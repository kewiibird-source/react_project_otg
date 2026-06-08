const express = require('express');
const oracledb = require('oracledb');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const db = require("../db");
const router = express.Router();

const multer = require('multer');
const jwtAuthentication = require('../auth'); 
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');        
        cb(null, Date.now() + '-profile-' + decodedName);
    }
});
const upload = multer({ storage });

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, 
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const dbOptions = {
  outFormat: oracledb.OUT_FORMAT_OBJECT,
  autoCommit: true 
};

// 1. 닉네임 중복 확인
router.post('/check-nickname', async (req, res) => {
  const { nickname } = req.body;
  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      `SELECT COUNT(*) AS COUNT FROM users WHERE nickname = :nickname`,
      [nickname],
      dbOptions
    );
    if (result.rows[0].COUNT > 0) {
      return res.json({ result: false, message: '이미 사용 중인 닉네임입니다.' });
    }
    res.json({ result: true, message: '사용 가능한 닉네임입니다.' });
  } catch (error) {
    console.error('닉네임 체크 오류', error);
    res.status(500).json({ result: false, message: '서버 오류가 발생했습니다.' });
  } finally {
    if (connection) await connection.close();
  }
});

// 2. 일반 회원가입
router.post('/join', async (req, res) => {
  const { email, nickname, password, birthDate } = req.body;
  let connection;

  try {
    connection = await db.getConnection();

    const checkResult = await connection.execute(
      `SELECT COUNT(*) AS COUNT FROM users WHERE email = :email`,
      [email],
      dbOptions
    );
    if (checkResult.rows[0].COUNT > 0) return res.json({ result: false, message: '이미 가입된 이메일입니다.' });

    if (!birthDate) return res.json({ result: false, message: '생년월일 정보가 누락되었습니다.' });
    const birthYear = new Date(birthDate).getFullYear();
    const currentYear = new Date().getFullYear();
    if (currentYear - birthYear < 19) return res.json({ result: false, message: '만 19세 미만 청소년은 가입할 수 없습니다.' });

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const insertSql = 
    `
      INSERT INTO users (email, nickname, password, provider, email_verified, birth_date, last_login_at) 
      VALUES (:email, :nickname, :hashedPassword, 'LOCAL', 1, TO_DATE(:birthDate, 'YYYY-MM-DD'), CURRENT_TIMESTAMP)
    `;
    await connection.execute(insertSql, { email, nickname, hashedPassword, birthDate }, dbOptions);
    
    res.json({ result: true, message: '회원가입 성공!' });
  } catch (error) {
    console.error('회원가입 오류', error);
    res.status(500).json({ result: false, message: '회원가입 중 오류가 발생했습니다.' });
  } finally {
    if (connection) await connection.close();
  }
});

// 3. 일반 로그인
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  let connection;
  try {
    connection = await db.getConnection();
    
    const result = await connection.execute(`SELECT id, email, password, nickname, status FROM users WHERE email = :email`,
      [email],dbOptions
    );
    
    if (result.rows.length === 0) return res.json({ result: false, message: '존재하지 않는 계정입니다.' });
    const dbUser = result.rows[0]; 
    if (dbUser.STATUS !== 'ACTIVE') return res.json({ result: false, message: '정지되거나 탈퇴된 계정입니다.' });
    
    const isMatch = await bcrypt.compare(password, dbUser.PASSWORD);
    if (!isMatch) return res.json({ result: false, message: '비밀번호가 일치하지 않습니다.' });
    
    // 마지막 로그인 일시 업데이트
    await connection.execute(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = :id`, [dbUser.ID], dbOptions);

    // 공용 함수를 호출해서 IP 기록하고 토큰 2개 받아오기!
    const { accessToken, refreshToken } = await processLoginSuccess(connection, dbUser.ID, req);

    res.json({
      result: true,
      message: '로그인 성공!',
      user: { id: dbUser.ID, email: dbUser.EMAIL, nickname: dbUser.NICKNAME },
      // 프론트엔드로 토큰 2개 같이 보내주기
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('로그인 오류', error);
    res.status(500).json({ result: false, message: '로그인 중 오류가 발생했습니다.' });
  } finally {
    if (connection) await connection.close();
  }
});

// 4. 이메일 인증 발송
router.post('/send-email', async (req, res) => {
  const { email } = req.body;
  let connection;
  try {
    connection = await db.getConnection();
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    const insertSql = `
      INSERT INTO email_verifications (email, token, expires_at)
      VALUES (:email, :verificationCode, CURRENT_TIMESTAMP + INTERVAL '5' MINUTE)
    `;
    await connection.execute(insertSql, { email, verificationCode }, dbOptions);

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: '잔너머 회원가입 인증 메일입니다.',
      html: `<h2>${verificationCode}</h2>`,
    };

    await transporter.sendMail(mailOptions);
    res.json({ result: true, message: '인증번호가 발송되었습니다.' });
  } catch (error) {
    res.status(500).json({ result: false, message: '이메일 발송 중 오류가 발생했습니다.' });
  } finally {
    if (connection) await connection.close();
  }
});

// 5. 이메일 검증
router.post('/verify-email', async (req, res) => {
  const { email, token } = req.body;
  let connection;
  try {
    connection = await db.getConnection();
    const selectSql = `
      SELECT id FROM email_verifications
      WHERE email = :email AND token = :token AND is_used = 0 AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC
    `;
    const result = await connection.execute(selectSql, { email, token }, dbOptions);

    if (result.rows.length === 0) return res.json({ result: false, message: '인증번호가 잘못되었거나 만료되었습니다.' });

    await connection.execute(`UPDATE email_verifications SET is_used = 1 WHERE id = :id`, [result.rows[0].ID], dbOptions);
    res.json({ result: true, message: '이메일 인증 완료.' });
  } catch (error) {
    res.status(500).json({ result: false, message: '인증 확인 중 오류가 발생했습니다.' });
  } finally {
    if (connection) await connection.close();
  }
});

// 6. 로그아웃 (리프레시 토큰 무효화)
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body; 
  let connection;

  try {
    if (!refreshToken) {
      return res.json({ result: true, message: '토큰 없음. 클라이언트 로그아웃 진행.' });
    }
    connection = await db.getConnection();
    const updateSql = `UPDATE refresh_tokens SET revoked = 'Y' WHERE refresh_token = :refreshToken`;
    const result = await connection.execute(updateSql, { refreshToken }, dbOptions);

    if (result.rowsAffected > 0) res.json({ result: true, message: '서버 토큰이 성공적으로 폐기되었습니다.' });
    else res.json({ result: true, message: '이미 폐기되었거나 존재하지 않는 토큰입니다.' });
  } catch (error) {
    console.error('로그아웃 처리 중 오류:', error);
    res.json({ result: false, message: '서버 로그아웃 처리 실패' }); 
  } finally {
    if (connection) await connection.close();
  }
});

// 7. 토큰 재발급 API (로그인 풀림 현상 해결)
router.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body;
    let connection;

    if (!refreshToken) return res.status(401).json({ result: false, message: '리프레시 토큰이 누락되었습니다.' });

    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const userId = decoded.id;
        connection = await db.getConnection();

        const sql = `SELECT USER_ID FROM refresh_tokens WHERE refresh_token = :refreshToken AND revoked = 'N' AND expires_at > CURRENT_TIMESTAMP`;
        const result = await connection.execute(sql, { refreshToken }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        if (result.rows.length === 0) return res.status(403).json({ result: false, message: '유효하지 않거나 폐기 및 만료된 리프레시 토큰입니다. 다시 로그인하세요.' });

        const newAccessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '30m' });
        res.json({ result: true, accessToken: newAccessToken });
    } catch (error) {
        console.error('토큰 재발급 처리 중 오류:', error);
        res.status(403).json({ result: false, message: '리프레시 토큰이 만료되었거나 검증에 실패했습니다.' });
    } finally {
        if (connection) await connection.close();
    }
});

// ==============================================================
// ✨ 8. 프로필 편집 API (안전한 상단 위치로 이동 + UPDATED_AT 쿼리 추가 완료!)
// ==============================================================
router.put('/profile', jwtAuthentication, upload.single('profileImage'), async (req, res) => {
    let connection;
    try {
        connection = await db.getConnection();
        const userId = req.user?.id || req.userId;
        const { nickname, bio } = req.body;
        const file = req.file;

        // 1. 닉네임 중복 체크 (본인이 쓰던 닉네임은 통과)
        const nickCheck = await connection.execute(
            `SELECT ID FROM USERS WHERE NICKNAME = :nickname AND ID != :userId`, 
            { nickname, userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (nickCheck.rows.length > 0) return res.json({ result: false, message: '이미 사용 중인 닉네임입니다.' });

        // ✨ 2. 업데이트 쿼리 (UPDATED_AT = CURRENT_TIMESTAMP 완벽 적용)
        let updateSql = `UPDATE USERS SET NICKNAME = :nickname, BIO = :bio, UPDATED_AT = CURRENT_TIMESTAMP`;
        let params = { nickname, bio, userId };

        let newProfileImageUrl = null;
        if (file) {
            const host = `${req.protocol}://${req.get('host')}/`;
            newProfileImageUrl = host + file.destination + file.filename;
            updateSql += `, PROFILE_IMAGE = :profileImageUrl`;
            params.profileImageUrl = newProfileImageUrl;
        }
        updateSql += ` WHERE ID = :userId`;

        await connection.execute(updateSql, params, { autoCommit: true });

        res.json({ result: true, message: '프로필이 수정되었습니다.', newNickname: nickname, newProfileImage: newProfileImageUrl });

    } catch(error) {
        console.error('\n🚨 [PUT /user/profile] 프로필 수정 에러:\n', error);
        res.status(500).json({ result: false, message: '프로필 수정 중 오류가 발생했습니다.' });
    } finally {
        if (connection) await connection.close();
    }
});
// ==============================================================

// 9. 구글 소셜 로그인 콜백
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  let connection;

  if (!code) return res.send('<script>alert("인증 코드가 없습니다."); location.href="http://localhost:3000/login";</script>');

  try {
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    const { access_token: googleAccessToken } = tokenResponse.data;

    const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${googleAccessToken}` }
    });

    const googleUser = userResponse.data; 
    connection = await db.getConnection();

    const selectSql = `SELECT id, email, nickname, status FROM users WHERE provider = 'GOOGLE' AND provider_id = :providerId`;
    const findUserResult = await connection.execute(selectSql, { providerId: googleUser.id }, dbOptions);

    let dbUser;

    if (findUserResult.rows.length > 0) {
      dbUser = findUserResult.rows[0];
      if (dbUser.STATUS !== 'ACTIVE') return res.send('<script>alert("정지된 계정입니다."); location.href="http://localhost:3000/login";</script>');
      await connection.execute(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = :id`, [dbUser.ID], dbOptions);
      
      const { accessToken, refreshToken } = await processLoginSuccess(connection, dbUser.ID, req);
      const encodedNickname = encodeURIComponent(dbUser.NICKNAME);
      return res.redirect(`http://localhost:3000/home?loginSuccess=true&nickname=${encodedNickname}&accessToken=${accessToken}&refreshToken=${refreshToken}`);
      
    } else {
      const emailCheckResult = await connection.execute(`SELECT provider FROM users WHERE email = :email`, [googleUser.email], dbOptions);
      if (emailCheckResult.rows.length > 0) {
        return res.send(`<script>alert("이미 [${emailCheckResult.rows[0].PROVIDER}] 계정으로 등록된 이메일입니다."); location.href="http://localhost:3000/login";</script>`);
      }
      
      const encodedEmail = encodeURIComponent(googleUser.email);
      const encodedName = encodeURIComponent(googleUser.name);
      const encodedPic = encodeURIComponent(googleUser.picture);
      
      return res.redirect(`http://localhost:3000/social-join?email=${encodedEmail}&name=${encodedName}&provider=GOOGLE&providerId=${googleUser.id}&profileImage=${encodedPic}`);
    }

  } catch (error) {
    console.error('구글 콜백 오류', error);
    res.send('<script>alert("로그인 중 서버 오류가 발생했습니다."); location.href="http://localhost:3000/login";</script>');
  } finally {
    if (connection) await connection.close();
  }
});

// 10. 카카오 소셜 로그인 콜백
router.get('/kakao/callback', async (req, res) => {
  const { code } = req.query;
  let connection;

  if (!code) return res.send('<script>alert("인증 코드가 없습니다."); location.href="http://localhost:3000/login";</script>');

  try {
    const tokenParams = new URLSearchParams();
    tokenParams.append('grant_type', 'authorization_code');
    tokenParams.append('client_id', process.env.KAKAO_CLIENT_ID);
    tokenParams.append('redirect_uri', process.env.KAKAO_REDIRECT_URI);
    tokenParams.append('code', code);

    const tokenResponse = await axios.post('https://kauth.kakao.com/oauth/token', tokenParams, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' }
    });

    const { access_token: accessToken } = tokenResponse.data;

    const userResponse = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: { 
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      }
    });

    const kakaoUser = userResponse.data; 
    const providerId = String(kakaoUser.id);
    const nickname = kakaoUser.properties?.nickname || '카카오유저';
    const profileImage = kakaoUser.properties?.profile_image || '';
    const email = kakaoUser.kakao_account?.email || `kakao_${providerId}@kakao.com`;

    connection = await db.getConnection();

    const selectSql = `SELECT id, email, nickname, status FROM users WHERE provider = 'KAKAO' AND provider_id = :providerId`;
    const findUserResult = await connection.execute(selectSql, { providerId }, dbOptions);

    let dbUser;

    if (findUserResult.rows.length > 0) {
      dbUser = findUserResult.rows[0];
      if (dbUser.STATUS !== 'ACTIVE') return res.send('<script>alert("정지된 계정입니다."); location.href="http://localhost:3000/login";</script>');
      await connection.execute(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = :id`, [dbUser.ID], dbOptions);

      const { accessToken, refreshToken } = await processLoginSuccess(connection, dbUser.ID, req);
      const encodedNickname = encodeURIComponent(dbUser.NICKNAME);
      return res.redirect(`http://localhost:3000/home?loginSuccess=true&nickname=${encodedNickname}&accessToken=${accessToken}&refreshToken=${refreshToken}`);
    } else {
      const emailCheckResult = await connection.execute(`SELECT provider FROM users WHERE email = :email`, [email], dbOptions);
      if (emailCheckResult.rows.length > 0) {
        return res.send(`<script>alert("이미 [${emailCheckResult.rows[0].PROVIDER}] 계정으로 등록된 이메일입니다."); location.href="http://localhost:3000/login";</script>`);
      }
      
      const encodedEmail = encodeURIComponent(email);
      const encodedName = encodeURIComponent(nickname);
      const encodedPic = encodeURIComponent(profileImage);
      return res.redirect(`http://localhost:3000/social-join?email=${encodedEmail}&name=${encodedName}&provider=KAKAO&providerId=${providerId}&profileImage=${encodedPic}`);
    }

  } catch (error) {
    console.error('카카오 콜백 오류', error);
    res.send('<script>alert("카카오 로그인 중 서버 오류가 발생했습니다."); location.href="http://localhost:3000/login";</script>');
  } finally {
    if (connection) await connection.close();
  }
});

// 11. 네이버 소셜 로그인 콜백
router.get('/naver/callback', async (req, res) => {
  const { code, state } = req.query;
  let connection;

  if (!code) return res.send('<script>alert("인증 코드가 없습니다."); location.href="http://localhost:3000/login";</script>');

  try {
    const tokenUrl = `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${process.env.NAVER_CLIENT_ID}&client_secret=${process.env.NAVER_CLIENT_SECRET}&redirect_uri=${process.env.NAVER_REDIRECT_URI}&code=${code}&state=${state}`;

    const tokenResponse = await axios.get(tokenUrl);
    const { access_token: accessToken } = tokenResponse.data;

    const userResponse = await axios.get('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const naverUser = userResponse.data.response; 
    const providerId = naverUser.id;
    const nickname = naverUser.nickname || '네이버유저';
    const profileImage = naverUser.profile_image || '';
    const email = naverUser.email || `naver_${providerId}@naver.com`;

    connection = await db.getConnection();

    const selectSql = `SELECT id, email, nickname, status FROM users WHERE provider = 'NAVER' AND provider_id = :providerId`;
    const findUserResult = await connection.execute(selectSql, { providerId }, dbOptions);

    let dbUser;

    if (findUserResult.rows.length > 0) {
      dbUser = findUserResult.rows[0];
      if (dbUser.STATUS !== 'ACTIVE') return res.send('<script>alert("정지된 계정입니다."); location.href="http://localhost:3000/login";</script>');
      await connection.execute(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = :id`, [dbUser.ID], dbOptions);

      const { accessToken, refreshToken } = await processLoginSuccess(connection, dbUser.ID, req);
      const encodedNickname = encodeURIComponent(dbUser.NICKNAME);
      return res.redirect(`http://localhost:3000/home?loginSuccess=true&nickname=${encodedNickname}&accessToken=${accessToken}&refreshToken=${refreshToken}`);
    } else {
      const emailCheckResult = await connection.execute(`SELECT provider FROM users WHERE email = :email`, [email], dbOptions);
      if (emailCheckResult.rows.length > 0) {
        return res.send(`<script>alert("이미 [${emailCheckResult.rows[0].PROVIDER}] 계정으로 등록된 이메일입니다."); location.href="http://localhost:3000/login";</script>`);
      }
      
      const encodedEmail = encodeURIComponent(email);
      const encodedName = encodeURIComponent(nickname);
      const encodedPic = encodeURIComponent(profileImage);
      return res.redirect(`http://localhost:3000/social-join?email=${encodedEmail}&name=${encodedName}&provider=NAVER&providerId=${providerId}&profileImage=${encodedPic}`);
    }

  } catch (error) {
    console.error('네이버 콜백 오류', error);
    res.send('<script>alert("네이버 로그인 중 서버 오류가 발생했습니다."); location.href="http://localhost:3000/login";</script>');
  } finally {
    if (connection) await connection.close();
  }
});

// 12. 소셜 최종 회원가입
router.post('/socialRegister', async (req, res) => {
  const { email, nickname, provider, providerId, profileImage, birthDate } = req.body;
  let connection;

  try {
    connection = await db.getConnection();

    const nickCheckResult = await connection.execute(`SELECT COUNT(*) AS COUNT FROM users WHERE nickname = :nickname`, [nickname], dbOptions);
    if (nickCheckResult.rows[0].COUNT > 0) return res.json({ result: false, message: '이미 사용 중인 닉네임입니다.' });

    const birthYear = new Date(birthDate).getFullYear();
    if (new Date().getFullYear() - birthYear < 19) return res.json({ result: false, message: '만 19세 미만입니다.' });
    const insertSql = 
    `
      INSERT INTO users (email, nickname, provider, provider_id, email_verified, profile_image, birth_date, last_login_at) 
      VALUES (:email, :nickname, :provider, :providerId, 1, :profileImage, TO_DATE(:birthDate, 'YYYY-MM-DD'), CURRENT_TIMESTAMP)
    `;
    await connection.execute(insertSql, { email, nickname, provider, providerId, profileImage, birthDate }, dbOptions);

    const userResult = await connection.execute(
      `SELECT id, email, nickname FROM users WHERE provider = :provider AND provider_id = :providerId`, 
      { provider, providerId }, 
      dbOptions
    );
    const newUser = userResult.rows[0];
    const { accessToken, refreshToken } = await processLoginSuccess(connection, newUser.ID, req);

    res.json({
      result: true,
      message: '소셜 회원가입 완료!',
      user: { id: newUser.ID, email: newUser.EMAIL, nickname: newUser.NICKNAME },
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('소셜 가입 오류', error);
    res.status(500).json({ result: false, message: '가입 중 오류 발생.' });
  } finally {
    if (connection) await connection.close();
  }
});

// 13. 다날 본인인증 영수증 검증
router.post('/certifications', async (req, res) => {
  const { impUid } = req.body; 

  try {
    const tokenResponse = await axios.post('https://api.iamport.kr/users/getToken', {
      imp_key: process.env.PORTONE_API_KEY,
      imp_secret: process.env.PORTONE_API_SECRET
    });
    
    const { access_token: accessToken } = tokenResponse.data.response;

    const certResponse = await axios.get(`https://api.iamport.kr/certifications/${impUid}`, {
      headers: { Authorization: accessToken }
    });
    
    const certData = certResponse.data.response; 

    const birthYear = new Date(certData.birthday).getFullYear();
    const isAdult = (new Date().getFullYear() - birthYear) >= 19;

    if (isAdult) {
      const birthDateStr = new Date(certData.birthday).toISOString().split('T')[0];
      res.json({ result: true, name: certData.name, birthDate: birthDateStr });
    } else {
      res.json({ result: false, message: '❌ 만 19세 미만 청소년은 가입할 수 없습니다.' });
    }
  } catch (error) {
    res.status(500).json({ result: false, message: '인증 서버 오류' });
  }
});

// [공용 함수] 로그인 성공 시 히스토리 기록 & 토큰 발급
async function processLoginSuccess(connection, userId, req) {
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
  const userAgent = req.headers['user-agent'] || 'Unknown';

  const historySql = `
    INSERT INTO login_history (user_id, ip_address, user_agent, status, created_at)
    VALUES (:userId, :ipAddress, :userAgent, 'SUCCESS', CURRENT_TIMESTAMP)
  `;
  await connection.execute(historySql, { userId, ipAddress, userAgent }, dbOptions);

  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '30m' }); 
  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '14d' }); 

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);

  const tokenSql = `
    INSERT INTO refresh_tokens (user_id, refresh_token, expires_at, revoked, created_at)
    VALUES (:userId, :refreshToken, :expiresAt, 'N', CURRENT_TIMESTAMP)
  `;
  await connection.execute(tokenSql, { userId, refreshToken, expiresAt }, dbOptions);

  return { accessToken, refreshToken };
};

// ==============================================================
// ✨ 14. 특정 유저의 '팔로워' 목록 가져오기 (나를 팔로우하는 사람)
// ==============================================================
router.get('/:nickname/followers', jwtAuthentication, async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const targetNickname = req.params.nickname;
    const loginUserId = req.user?.id || req.userId; // 로그인한 유저 ID

    // [OracleDB 최적화 쿼리] 서브쿼리에 EXISTS 사용
    const query = `
      SELECT 
        u.nickname, 
        u.bio, 
        u.profile_image,
        CASE 
          WHEN EXISTS (SELECT 1 FROM follows WHERE follower_id = :loginUserId AND following_id = u.id) 
          THEN 1 ELSE 0 
        END AS is_following
      FROM users u
      JOIN follows f ON u.id = f.follower_id
      JOIN users target ON target.id = f.following_id
      WHERE target.nickname = :targetNickname
    `;
    
    const result = await connection.execute(query, { loginUserId, targetNickname }, dbOptions);

    // Oracle은 기본적으로 키값을 모두 대문자로 반환하므로, 프론트엔드가 쓰기 편하게 소문자/카멜케이스로 변환해서 줍니다.
    const followers = result.rows.map(row => ({
      nickname: row.NICKNAME,
      name: row.BIO || '', 
      profileImage: row.PROFILE_IMAGE || '',
      isFollowing: row.IS_FOLLOWING === 1 // 1이면 true, 0이면 false
    }));

    res.json({ result: true, data: followers });
  } catch (error) {
    console.error("🚨 팔로워 목록 로드 에러:", error);
    res.status(500).json({ result: false, message: "서버 오류가 발생했습니다." });
  } finally {
    if (connection) await connection.close();
  }
});


// ==============================================================
// ✨ 15. 특정 유저의 '팔로잉' 목록 가져오기 (내가 팔로우하는 사람)
// ==============================================================
router.get('/:nickname/followings', jwtAuthentication, async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const targetNickname = req.params.nickname;
    const loginUserId = req.user?.id || req.userId;

    const query = `
      SELECT 
        u.nickname, 
        u.bio, 
        u.profile_image,
        CASE 
          WHEN EXISTS (SELECT 1 FROM follows WHERE follower_id = :loginUserId AND following_id = u.id) 
          THEN 1 ELSE 0 
        END AS is_following
      FROM users u
      JOIN follows f ON u.id = f.following_id
      JOIN users target ON target.id = f.follower_id
      WHERE target.nickname = :targetNickname
    `;

    const result = await connection.execute(query, { loginUserId, targetNickname }, dbOptions);

    const followings = result.rows.map(row => ({
      nickname: row.NICKNAME,
      name: row.BIO || '',
      profileImage: row.PROFILE_IMAGE || '',
      isFollowing: row.IS_FOLLOWING === 1 
    }));

    res.json({ result: true, data: followings });
  } catch (error) {
    console.error("🚨 팔로잉 목록 로드 에러:", error);
    res.status(500).json({ result: false, message: "서버 오류가 발생했습니다." });
  } finally {
    if (connection) await connection.close();
  }
});

// ==============================================================
// ✨ 16. 팔로우 / 언팔로우 토글 API
// ==============================================================
router.post('/:nickname/follow', jwtAuthentication, async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const targetNickname = req.params.nickname;
    const loginUserId = req.user?.id || req.userId;

    // 1. 팔로우할 대상(타겟)의 ID 찾기
    const targetResult = await connection.execute(
      `SELECT id FROM users WHERE nickname = :targetNickname`,
      { targetNickname },
      dbOptions
    );

    if (targetResult.rows.length === 0) {
      return res.json({ result: false, message: "존재하지 않는 사용자입니다." });
    }
    const targetUserId = targetResult.rows[0].ID;

    if (loginUserId === targetUserId) {
       return res.json({ result: false, message: "자기 자신을 팔로우할 수 없습니다." });
    }

    // 2. 현재 내가 이 사람을 팔로우 중인지 확인
    const followCheck = await connection.execute(
      `SELECT 1 FROM follows WHERE follower_id = :loginUserId AND following_id = :targetUserId`,
      { loginUserId, targetUserId },
      dbOptions
    );

    if (followCheck.rows.length > 0) {
      // 3-A. 이미 팔로우 중이면 -> 언팔로우 (데이터 삭제)
      await connection.execute(
        `DELETE FROM follows WHERE follower_id = :loginUserId AND following_id = :targetUserId`,
        { loginUserId, targetUserId },
        { autoCommit: true }
      );
      res.json({ result: true, message: "팔로우를 취소했습니다.", isFollowing: false });
    } else {
      // 3-B. 팔로우 중이 아니면 -> 팔로우 (데이터 추가)
      await connection.execute(
        `INSERT INTO follows (follower_id, following_id) VALUES (:loginUserId, :targetUserId)`,
        { loginUserId, targetUserId },
        { autoCommit: true }
      );
      res.json({ result: true, message: "팔로우했습니다.", isFollowing: true });
    }

  } catch (error) {
    console.error("🚨 팔로우 토글 에러:", error);
    res.status(500).json({ result: false, message: "서버 오류가 발생했습니다." });
  } finally {
    if (connection) await connection.close();
  }
});

// 계정정보수정
router.put('/settings', jwtAuthentication, async (req, res) => {
  const { currentPassword, newPassword } = req.body;  // email 제거
  const userId = req.user?.id || req.userId;
  let connection;
  try {
    connection = await db.getConnection();

    if (!currentPassword || !newPassword) 
      return res.json({ result: false, message: '현재 비밀번호와 새 비밀번호를 모두 입력해주세요.' });

    const userResult = await connection.execute(
      `SELECT PASSWORD FROM USERS WHERE ID = :userId`,
      { userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (userResult.rows.length === 0) 
      return res.status(404).json({ result: false, message: '유저를 찾을 수 없습니다.' });

    const isMatch = await bcrypt.compare(currentPassword, userResult.rows[0].PASSWORD);
    if (!isMatch) 
      return res.json({ result: false, message: '현재 비밀번호가 틀렸습니다.' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await connection.execute(
      `UPDATE USERS SET PASSWORD = :password, UPDATED_AT = CURRENT_TIMESTAMP WHERE ID = :userId`,
      { password: hashed, userId }, { autoCommit: true }
    );
    res.json({ result: true, message: '비밀번호가 변경되었습니다.' });
  } catch (e) {
    console.error('비밀번호 변경 에러:', e);
    res.status(500).json({ result: false });
  } finally { if (connection) await connection.close(); }
});

// 내 계정 정보 조회
router.get('/me', jwtAuthentication, async (req, res) => {
  const userId = req.user?.id || req.userId;
  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      `SELECT EMAIL, PROVIDER FROM USERS WHERE ID = :userId`,
      { userId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    if (result.rows.length === 0) return res.status(404).json({ result: false });
    const row = result.rows[0];
    res.json({ result: true, email: row.EMAIL, provider: row.PROVIDER || 'LOCAL' });
  } catch(e) {
    console.error('GET /me 에러:', e);
    res.status(500).json({ result: false });
  } finally { if (connection) await connection.close(); }
});

// 회원 탈퇴
router.delete('/withdraw', jwtAuthentication, async (req, res) => {
  const userId = req.user?.id || req.userId;
  let connection;
  try {
    connection = await db.getConnection();
    // Soft delete — 실제 삭제 대신 상태값 변경 권장
    await connection.execute(
      `UPDATE USERS SET STATUS = 'DELETED', DELETED_AT = CURRENT_TIMESTAMP WHERE ID = :userId`,
      { userId }, { autoCommit: true }
    );
    res.json({ result: true });
  } catch(e) {
    console.error('탈퇴 에러:', e);
    res.status(500).json({ result: false });
  } finally { if (connection) await connection.close(); }
});

module.exports = router;