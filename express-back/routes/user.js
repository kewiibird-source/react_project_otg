const express = require('express');
const oracledb = require('oracledb');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const db = require("../db");
const router = express.Router();

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

// 6. 구글 소셜 로그인 콜백
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
      // [기존 가입된 유저]
      dbUser = findUserResult.rows[0];
      if (dbUser.STATUS !== 'ACTIVE') return res.send('<script>alert("정지된 계정입니다."); location.href="http://localhost:3000/login";</script>');
      await connection.execute(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = :id`, [dbUser.ID], dbOptions);
      
      // 공용 함수 (IP 기록 및 토큰 DB 저장)
      const { accessToken, refreshToken } = await processLoginSuccess(connection, dbUser.ID, req);
      const encodedNickname = encodeURIComponent(dbUser.NICKNAME);
      return res.redirect(`http://localhost:3000/home?loginSuccess=true&nickname=${encodedNickname}&accessToken=${accessToken}&refreshToken=${refreshToken}`);
      
    } else {
      // [처음 온 유저]
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

// 카카오 소셜 로그인 콜백
router.get('/kakao/callback', async (req, res) => {
  const { code } = req.query;
  let connection;

  if (!code) return res.send('<script>alert("인증 코드가 없습니다."); location.href="http://localhost:3000/login";</script>');

  try {
    // 1. 인가 코드로 카카오 Access Token 발급 받기
    // 카카오는 구글과 다르게 데이터를 'x-www-form-urlencoded' 형식으로 보내야 합니다.
    const tokenParams = new URLSearchParams();
    tokenParams.append('grant_type', 'authorization_code');
    tokenParams.append('client_id', process.env.KAKAO_CLIENT_ID);
    tokenParams.append('redirect_uri', process.env.KAKAO_REDIRECT_URI);
    tokenParams.append('code', code);

    const tokenResponse = await axios.post('https://kauth.kakao.com/oauth/token', tokenParams, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' }
    });

    const { access_token: accessToken } = tokenResponse.data;

    // 2. 발급받은 토큰으로 유저 정보 가져오기
    const userResponse = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: { 
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      }
    });

    const kakaoUser = userResponse.data; 
    
    // 카카오는 id를 숫자로 주므로 안전하게 문자열로 변환합니다.
    const providerId = String(kakaoUser.id);
    const nickname = kakaoUser.properties?.nickname || '카카오유저';
    const profileImage = kakaoUser.properties?.profile_image || '';
    
    // 카카오는 이메일을 안 줄 수도 있으므로, 없을 경우 가짜 이메일을 생성합니다.
    const email = kakaoUser.kakao_account?.email || `kakao_${providerId}@kakao.com`;

    connection = await db.getConnection();

    // 3. DB에 카카오로 가입한 내역이 있는지 조회
    const selectSql = `SELECT id, email, nickname, status FROM users WHERE provider = 'KAKAO' AND provider_id = :providerId`;
    const findUserResult = await connection.execute(selectSql, { providerId }, dbOptions);

    let dbUser;

    if (findUserResult.rows.length > 0) {
      // [가입된 유저] 로그인 처리 후 메인 홈으로!
      dbUser = findUserResult.rows[0];
      if (dbUser.STATUS !== 'ACTIVE') return res.send('<script>alert("정지된 계정입니다."); location.href="http://localhost:3000/login";</script>');
      await connection.execute(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = :id`, [dbUser.ID], dbOptions);

      // 공용 함수 (IP 기록 및 토큰 DB 저장)
      const { accessToken, refreshToken } = await processLoginSuccess(connection, dbUser.ID, req);
      
      const encodedNickname = encodeURIComponent(dbUser.NICKNAME);
      return res.redirect(`http://localhost:3000/home?loginSuccess=true&nickname=${encodedNickname}&accessToken=${accessToken}&refreshToken=${refreshToken}`);
    } else {
      // [처음 온 유저] 이메일 중복 검사 후 소셜 가입 폼(/social-join)으로!
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

// [신규 API] 네이버 소셜 로그인 콜백
router.get('/naver/callback', async (req, res) => {
  // 네이버는 code와 함께 state 값도 같이 돌려보내 줍니다.
  const { code, state } = req.query;
  let connection;

  if (!code) return res.send('<script>alert("인증 코드가 없습니다."); location.href="http://localhost:3000/login";</script>');

  try {
    // 1. 인가 코드로 네이버 Access Token 발급 받기
    // 네이버는 GET 방식으로 토큰을 요청하는 것이 특징입니다.
    const tokenUrl = `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${process.env.NAVER_CLIENT_ID}&client_secret=${process.env.NAVER_CLIENT_SECRET}&redirect_uri=${process.env.NAVER_REDIRECT_URI}&code=${code}&state=${state}`;

    const tokenResponse = await axios.get(tokenUrl);
    const { access_token: accessToken } = tokenResponse.data;

    // 2. 발급받은 토큰으로 유저 정보 가져오기
    const userResponse = await axios.get('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    // ✨ 네이버만의 특징: 정보가 data.response 안에 한 겹 더 싸여 있습니다!
    const naverUser = userResponse.data.response; 

    const providerId = naverUser.id;
    const nickname = naverUser.nickname || '네이버유저';
    const profileImage = naverUser.profile_image || '';
    const email = naverUser.email || `naver_${providerId}@naver.com`;

    connection = await db.getConnection();

    // 3. DB에 네이버로 가입한 내역이 있는지 조회 (기존 로직과 100% 동일)
    const selectSql = `SELECT id, email, nickname, status FROM users WHERE provider = 'NAVER' AND provider_id = :providerId`;
    const findUserResult = await connection.execute(selectSql, { providerId }, dbOptions);

    let dbUser;

    if (findUserResult.rows.length > 0) {
      // [가입된 유저] 로그인 처리 후 메인 홈으로!
      dbUser = findUserResult.rows[0];
      if (dbUser.STATUS !== 'ACTIVE') return res.send('<script>alert("정지된 계정입니다."); location.href="http://localhost:3000/login";</script>');
      await connection.execute(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = :id`, [dbUser.ID], dbOptions);

      // 공용 함수 (IP 기록 및 토큰 DB 저장)
      const { accessToken, refreshToken } = await processLoginSuccess(connection, dbUser.ID, req);
      
      const encodedNickname = encodeURIComponent(dbUser.NICKNAME);
      return res.redirect(`http://localhost:3000/home?loginSuccess=true&nickname=${encodedNickname}&accessToken=${accessToken}&refreshToken=${refreshToken}`);
    } else {
      // [처음 온 유저] 이메일 중복 검사 후 공용 소셜 가입 폼(/social-join)으로 토스!
      const emailCheckResult = await connection.execute(`SELECT provider FROM users WHERE email = :email`, [email], dbOptions);
      if (emailCheckResult.rows.length > 0) {
        return res.send(`<script>alert("이미 [${emailCheckResult.rows[0].PROVIDER}] 계정으로 등록된 이메일입니다."); location.href="http://localhost:3000/login";</script>`);
      }
      
      const encodedEmail = encodeURIComponent(email);
      const encodedName = encodeURIComponent(nickname);
      const encodedPic = encodeURIComponent(profileImage);
      
      // 구글, 카카오가 쓰던 화면을 그대로 재활용!
      return res.redirect(`http://localhost:3000/social-join?email=${encodedEmail}&name=${encodedName}&provider=NAVER&providerId=${providerId}&profileImage=${encodedPic}`);
    }

  } catch (error) {
    console.error('네이버 콜백 오류', error);
    res.send('<script>alert("네이버 로그인 중 서버 오류가 발생했습니다."); location.href="http://localhost:3000/login";</script>');
  } finally {
    if (connection) await connection.close();
  }
});

// 7. 소셜 최종 회원가입
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

// 8. 다날 본인인증 영수증 검증
router.post('/certifications', async (req, res) => {
  const { impUid } = req.body; // ✨ 프론트에서 impUid로 통일해서 받음

  try {
    const tokenResponse = await axios.post('https://api.iamport.kr/users/getToken', {
      imp_key: process.env.PORTONE_API_KEY,
      imp_secret: process.env.PORTONE_API_SECRET
    });
    
    // 포트원 응답인 access_token을 accessToken으로 변환
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
  // 1. 유저의 접속 IP와 브라우저(기기) 정보 빼오기
  // (프록시 환경을 대비해 x-forwarded-for 도 확인)
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
  const userAgent = req.headers['user-agent'] || 'Unknown';

  // 2. login_history 테이블에 기록 남기기 (방금 만드신 컬럼명 그대로!)
  const historySql = `
    INSERT INTO login_history (user_id, ip_address, user_agent, status, created_at)
    VALUES (:userId, :ipAddress, :userAgent, 'SUCCESS', CURRENT_TIMESTAMP)
  `;
  await connection.execute(historySql, { userId, ipAddress, userAgent }, dbOptions);

  // 3. JWT 토큰 2개 찍어내기
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '30m' }); // 30분짜리
  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '14d' }); // 14일짜리

  // 4. 리프레시 토큰 만료일(14일 뒤) 계산
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 14);

  // 5. refresh_tokens 테이블에 기록 남기기
  const tokenSql = `
    INSERT INTO refresh_tokens (user_id, refresh_token, expires_at, revoked, created_at)
    VALUES (:userId, :refreshToken, :expiresAt, 'N', CURRENT_TIMESTAMP)
  `;
  await connection.execute(tokenSql, { userId, refreshToken, expiresAt }, dbOptions);

  // 6. 프론트엔드에 돌려줄 토큰 반환
  return { accessToken, refreshToken };
}

// 9. 로그아웃 (리프레시 토큰 무효화)
router.post('/logout', async (req, res) => {
  // 프론트엔드에서 body에 실어 보낸 refreshToken을 받습니다.
  const { refreshToken } = req.body; 
  let connection;

  try {
    // 토큰이 안 넘어왔어도 프론트엔드 스토리지는 비워야 하므로 성공 처리는 해줍니다.
    if (!refreshToken) {
      return res.json({ result: true, message: '토큰 없음. 클라이언트 로그아웃 진행.' });
    }

    connection = await db.getConnection();

    // 핵심 로직: 해당 토큰을 찾아 REVOKED 상태를 'Y'로 변경
    const updateSql = `
      UPDATE refresh_tokens 
      SET revoked = 'Y' 
      WHERE refresh_token = :refreshToken
    `;
    
    const result = await connection.execute(updateSql, { refreshToken }, dbOptions);

    if (result.rowsAffected > 0) {
      res.json({ result: true, message: '서버 토큰이 성공적으로 폐기되었습니다.' });
    } else {
      res.json({ result: true, message: '이미 폐기되었거나 존재하지 않는 토큰입니다.' });
    }

  } catch (error) {
    console.error('로그아웃 처리 중 오류:', error);
    // 에러가 나더라도 프론트 단의 로그아웃은 진행되어야 하므로 200 상태코드로 보냅니다.
    res.json({ result: false, message: '서버 로그아웃 처리 실패' }); 
  } finally {
    if (connection) await connection.close();
  }
});

module.exports = router;