import React, { useState, useEffect } from 'react';
import { Box, Button, Paper, Stack, TextField, Typography, Grid } from '@mui/material';
import { useSearchParams, useNavigate } from 'react-router-dom';

function SocialJoin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ✨ 구글 콜백 주소창에 실려온 데이터 꺼내기 (카멜 표기법으로 완벽 수정!)
  const email = searchParams.get('email') || '';
  const provider = searchParams.get('provider') || '';
  const providerId = searchParams.get('providerId') || ''; 
  const profileImage = searchParams.get('profileImage') || ''; 

  // 유저가 가입 폼에서 입력할 닉네임
  const [nickname, setNickname] = useState(searchParams.get('name') || '');
  const [isNicknameChecked, setIsNicknameChecked] = useState(false);

  // 휴대폰 본인인증(성인인증) 관련 상태
  const [isAdultVerified, setIsAdultVerified] = useState(false); 
  const [userName, setUserName] = useState(''); 
  const [birthDate, setBirthDate] = useState(''); 

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.iamport.kr/v1/iamport.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

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

  const handleIdentityVerification = () => {
    const { IMP } = window;
    if (!IMP) return alert("결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도해주세요.");

    const impCode = process.env.REACT_APP_PORTONE_IMP_CODE;
    if (!impCode) return alert("환경변수(.env)를 읽지 못했습니다. 리액트 서버를 재시작해 주세요!");

    IMP.init(impCode); 

    IMP.certification({
      pg: 'danal',
      merchant_uid: `mid_${new Date().getTime()}`,
    }, (rsp) => {
      if (rsp.success) {
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

  const handleSocialSubmit = (event) => {
    event.preventDefault();

    if (!isNicknameChecked) return alert("닉네임 중복 확인을 완료해주세요.");
    if (!isAdultVerified) return alert("휴대폰 본인인증(성인인증)을 진행해주세요.");

    // ✨ providerId가 정상적으로 들어있는지 백엔드로 쏘기!
    fetch("http://localhost:3010/user/socialRegister", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        nickname,
        provider,
        providerId,
        profileImage,
        birthDate 
      })
    })
    .then(res => res.json())
    .then(data => {
      alert(data.message);
      if (data.result) {
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        
        console.log("소셜 가입 완료 유저 세션 정보:", data.user);
        navigate("/home"); 
      }
    })
    .catch(err => alert("소셜 가입 통신 실패"));
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', backgroundColor: '#f5f5f5' }}>
      <Paper elevation={3} sx={{ padding: 4, width: '100%', maxWidth: 450 }}>
        <Typography variant="h5" align="center" gutterBottom fontWeight="bold" color="primary.main">
          {provider} 계정 연동 완료
        </Typography>
        <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 3 }}>
          잔너머 서비스 이용을 위해 추가 정보를 입력해 주세요.
        </Typography>

        <form onSubmit={handleSocialSubmit}>
          <Stack spacing={3}>
            <TextField label="소셜 연동 이메일" variant="outlined" fullWidth size="small" value={email} disabled />

            <Grid container spacing={1} alignItems="center">
              <Grid item xs={8}>
                <TextField 
                  label="닉네임 설정" variant="outlined" fullWidth size="small"
                  value={nickname} 
                  onChange={(e) => { setNickname(e.target.value); setIsNicknameChecked(false); }}
                  disabled={isNicknameChecked}
                />
              </Grid>
              <Grid item xs={4}>
                <Button variant="outlined" fullWidth onClick={handleCheckNickname} disabled={isNicknameChecked}>
                  {isNicknameChecked ? "통과" : "중복 확인"}
                </Button>
              </Grid>
            </Grid>

            <Grid container spacing={1} alignItems="center">
              <Grid item xs={8}>
                <TextField 
                  label="본인인증 (성인인증)" variant="outlined" fullWidth size="small"
                  placeholder="본인인증을 진행해주세요"
                  value={isAdultVerified ? `${userName} (${birthDate})` : ""}
                  disabled 
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={4}>
                <Button 
                  variant={isAdultVerified ? "contained" : "outlined"} 
                  color={isAdultVerified ? "success" : "primary"} 
                  fullWidth 
                  onClick={handleIdentityVerification} 
                  disabled={isAdultVerified}
                >
                  {isAdultVerified ? "인증 완료" : "본인 인증"}
                </Button>
              </Grid>
            </Grid>

            <Button type="submit" variant="contained" color="primary" size="large" sx={{ mt: 1 }}>
              가입 완료 및 서비스 시작
            </Button>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}

export default SocialJoin;