import React, { useState, useEffect } from 'react';
import { Box, Button, Link, Paper, Stack, TextField, Typography, Grid, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';

function Join() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  
  // ✨ 성인인증 관련 상태
  const [isAdultVerified, setIsAdultVerified] = useState(false); // 인증 완료 여부
  const [userName, setUserName] = useState(''); // 인증 후 받아올 실명
  const [birthDate, setBirthDate] = useState(''); // 인증 후 받아올 생년월일

  const [isEmailSent, setIsEmailSent] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isNicknameChecked, setIsNicknameChecked] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0); 

  const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  const isPasswordValid = passwordRegex.test(password);

  // ✨ 포트원(Iamport) 스크립트를 화면이 켜질 때 자동으로 불러오기
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.iamport.kr/v1/iamport.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  useEffect(() => {
    if (timeLeft <= 0 || isEmailVerified) return;
    const timerId = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timerId);
  }, [timeLeft, isEmailVerified]);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  const handleSendEmailCode = () => {
    if (!email) return alert("이메일을 입력해주세요.");
    fetch("http://localhost:3010/user/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email })
    })
    .then(res => res.json())
    .then(data => {
      alert(data.message);
      if (data.result) {
        setIsEmailSent(true);
        setTimeLeft(300);
      }
    })
    .catch(err => alert("서버 통신 실패"));
  };

  const handleVerifyEmailCode = () => {
    if (!emailCode) return alert("인증번호를 입력해주세요.");
    if (timeLeft <= 0) return alert("인증 시간이 만료되었습니다. 다시 요청해주세요.");
    
    fetch("http://localhost:3010/user/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, token: emailCode })
    })
    .then(res => res.json())
    .then(data => {
      alert(data.message);
      if (data.result) {
        setIsEmailVerified(true);
        setTimeLeft(0);
      }
    })
    .catch(err => alert("서버 통신 실패"));
  };

  const handleCheckNickname = () => {
    if (!nickname) return alert("닉네임을 입력해주세요.");
    fetch("http://localhost:3010/user/check-nickname", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: nickname })
    })
    .then(res => res.json())
    .then(data => {
      alert(data.message);
      if (data.result) setIsNicknameChecked(true);
    })
    .catch(err => alert("서버 통신 실패"));
  };

  // 다날 휴대폰 본인인증 호출 함수
  const handleIdentityVerification = () => {
    const { IMP } = window;
    if (!IMP) return alert("결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도해주세요.");

    // 1. 환경변수가 잘 들어오는지 콘솔로 확인 (F12 개발자 도구에서 확인 가능)
    const impCode = process.env.REACT_APP_PORTONE_IMP_CODE;
    console.log("🛠️ 로드된 포트원 가맹점 코드:", impCode);

    if (!impCode) {
      return alert("환경변수(.env)를 읽지 못했습니다. 리액트 서버를 재시작해 주세요!");
    }

    // 2. 가맹점 식별코드로 초기화
    IMP.init(impCode); 

    // 3. 본인인증 창 호출
    IMP.certification({
      pg: 'danal', // ✨ 다날 본인인증 창을 명시적으로 호출
      merchant_uid: `mid_${new Date().getTime()}`,
    }, (rsp) => {
      if (rsp.success) {
        // 성공 시 백엔드로 영수증(imp_uid) 전송
        fetch("http://localhost:3010/user/certifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ impUid: rsp.imp_uid })
        })
        .then(res => res.json())
        .then(data => {
          if (data.result) {
            alert("성인인증이 완료되었습니다.");
            setIsAdultVerified(true);
            setUserName(data.name);       
            setBirthDate(data.birthDate); 
          } else {
            alert(data.message);
          }
        })
        .catch(err => alert("인증 서버 통신 실패"));
      } else {
        alert(`본인인증에 실패하였습니다. 에러 내용: ${rsp.error_msg}`);
      }
    });
  };

  // 일반 회원가입 최종 제출
  const handleSubmit = (event) => {
    event.preventDefault();
    if (!isEmailVerified) return alert("이메일 인증을 완료해주세요.");
    if (!isNicknameChecked) return alert("닉네임 중복 확인을 완료해주세요.");
    
    // ✨ 달력 값 대신 "본인인증 완료 여부"로 방어선 변경
    if (!isAdultVerified) return alert("휴대폰 본인인증(성인인증)을 진행해주세요.");
    
    if (!isPasswordValid) return alert("비밀번호 규격을 맞춰주세요.");
    if (password !== passwordConfirm) return alert("비밀번호가 일치하지 않습니다.");

    fetch("http://localhost:3010/user/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, nickname, password, birthDate }) 
    })
    .then(res => res.json())
    .then(data => {
      alert(data.message);
      if (data.result) navigate("/login"); 
    })
    .catch(err => alert("서버 가입 처리 통신 실패"));
  };

  // 1. 구글 로그인
  const handleGoogleLogin = () => {
    const clientFileId = "543671638677-cusv4p5t4vp7v5j1klnqu61f97tgoc4i.apps.googleusercontent.com"; 
    const redirectUri = "http://localhost:3010/user/google/callback";
    const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientFileId}&redirect_uri=${redirectUri}&response_type=code&scope=email%20profile&prompt=select_account`;
    window.location.href = googleUrl;
  };

  // 2. 카카오 로그인
  const handleKakaoLogin = () => {
    const kakaoClientId = "cfd19921bce3642b8c6f074cc94a64df"; 
    const redirectUri = "http://localhost:3010/user/kakao/callback";
    const kakaoUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${kakaoClientId}&redirect_uri=${redirectUri}&response_type=code`;
    window.location.href = kakaoUrl;
  };

  // 1. 네이버 로그인창으로 이동하는 함수 만들기
  const handleNaverLogin = () => {  
    const naverClientId = "HLLE39y9zcLFjrAOJNEf"; 
    const redirectUri = "http://localhost:3010/user/naver/callback";
    
    // ✨ 네이버 필수 항목: 해킹 방지용 무작위 난수(state) 생성
    const state = Math.random().toString(36).substring(3, 14); 
    const naverUrl = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${naverClientId}&redirect_uri=${redirectUri}&state=${state}`;
    window.location.href = naverUrl;
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', backgroundColor: '#f5f5f5' }}>
      <Paper elevation={3} sx={{ padding: 4, width: '100%', maxWidth: 450 }}>
        <Typography variant="h5" align="center" gutterBottom fontWeight="bold">
          잔너머 회원가입
        </Typography>
        <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 2 }}>
          방구석 혼술러들의 공간에 오신 것을 환영합니다.
        </Typography>

        <form onSubmit={handleSubmit}>
          <Stack spacing={2} sx={{ mt: 2 }}>
            
            {/* 이메일 및 인증 */}
            <Grid container spacing={1} alignItems="center">
              <Grid item xs={8}>
                <TextField label="Email" variant="outlined" fullWidth type="email" size="small" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isEmailVerified} />
              </Grid>
              <Grid item xs={4}>
                <Button variant="outlined" fullWidth onClick={handleSendEmailCode} disabled={isEmailVerified}>
                  {isEmailSent ? "재발송" : "인증 요청"}
                </Button>
              </Grid>
            </Grid>

            {isEmailSent && (
              <Grid container spacing={1} alignItems="center">
                <Grid item xs={8}>
                  <TextField 
                    label="Verification Code" variant="outlined" fullWidth size="small"
                    value={emailCode} onChange={(e) => setEmailCode(e.target.value)}
                    disabled={isEmailVerified}
                    InputProps={{
                      endAdornment: timeLeft > 0 && !isEmailVerified ? (
                        <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 'bold', minWidth: '40px' }}>{formatTime(timeLeft)}</Typography>
                      ) : isEmailVerified ? null : (
                        <Typography variant="body2" sx={{ color: 'error.main', fontWeight: 'bold' }}>만료됨</Typography>
                      )
                    }}
                  />
                </Grid>
                <Grid item xs={4}>
                  <Button variant="contained" color="secondary" fullWidth onClick={handleVerifyEmailCode} disabled={isEmailVerified}>
                    {isEmailVerified ? "완료" : "확인"}
                  </Button>
                </Grid>
              </Grid>
            )}
            
            {/* 닉네임 */}
            <Grid container spacing={1} alignItems="center">
              <Grid item xs={8}>
                <TextField label="Nickname" variant="outlined" fullWidth size="small" value={nickname} onChange={(e) => { setNickname(e.target.value); setIsNicknameChecked(false); }} disabled={isNicknameChecked} />
              </Grid>
              <Grid item xs={4}>
                <Button variant="outlined" fullWidth onClick={handleCheckNickname} disabled={isNicknameChecked}>
                  {isNicknameChecked ? "통과" : "중복 확인"}
                </Button>
              </Grid>
            </Grid>

            {/* ✨ 🔞 휴대폰 본인인증 영역 (달력 대체) */}
            <Grid container spacing={1} alignItems="center">
              <Grid item xs={8}>
                <TextField 
                  label="본인인증 (성인인증)" variant="outlined" fullWidth size="small"
                  placeholder="본인인증을 진행해주세요"
                  value={isAdultVerified ? `${userName} (${birthDate})` : ""}
                  disabled // 유저가 타이핑해서 수정하는 것을 원천 차단
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={4}>
                <Button 
                  variant={isAdultVerified ? "contained" : "outlined"} 
                  color={isAdultVerified ? "success" : "primary"} 
                  fullWidth 
                  onClick={handleIdentityVerification} 
                  disabled={isAdultVerified} // 인증 성공 시 버튼 클릭 잠금
                >
                  {isAdultVerified ? "인증 완료" : "본인 인증"}
                </Button>
              </Grid>
            </Grid>
            
            {/* 비밀번호 */}
            <TextField label="Password" type="password" variant="outlined" fullWidth size="small" value={password} onChange={(e) => setPassword(e.target.value)} />
            {password && (
              <Typography variant="caption" color={isPasswordValid ? "green" : "error.main"} sx={{ pl: 1, mt: -1 }}>
                {isPasswordValid ? "✓ 안전한 비밀번호입니다." : "✗ 영문, 숫자, 특수문자 포함 8자 이상이어야 합니다."}
              </Typography>
            )}
            <TextField label="Confirm Password" type="password" variant="outlined" fullWidth size="small" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} />
            
            <Button type="submit" variant="contained" color="primary" size="large" sx={{ mt: 2 }}>Sign up</Button>
          </Stack>
        </form>

        <Divider sx={{ my: 3 }}>or sign up with</Divider>
        <Stack direction="row" spacing={3} justifyContent="center" sx={{ mb: 1 }}>
          <Button onClick={handleGoogleLogin} sx={{ width: 46, height: 46, borderRadius: '50%', minWidth: 0, backgroundColor: '#ffffff', border: '1px solid #e0e0e0', color: '#757575', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', '&:hover': { backgroundColor: '#f5f5f5', border: '1px solid #ccc' } }}>G</Button>
          <Button onClick={handleNaverLogin} sx={{ width: 46, height: 46, borderRadius: '50%', minWidth: 0, backgroundColor: '#03C75A', color: '#ffffff', fontWeight: 'bold', fontSize: '16px', '&:hover': { backgroundColor: '#02b34f' } }}>N</Button>
          <Button onClick={handleKakaoLogin} sx={{ width: 46, height: 46, borderRadius: '50%', minWidth: 0, backgroundColor: '#FEE500', color: '#191919', fontWeight: 'bold', fontSize: '16px', '&:hover': { backgroundColor: '#fada00' } }}>K</Button>
        </Stack>
        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">Already have an account? <Link href="/login" underline="hover">Sign in</Link></Typography>
        </Box>
      </Paper>
    </Box>
  );
}

export default Join;