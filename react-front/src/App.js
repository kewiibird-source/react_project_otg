import React from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Box, CssBaseline } from '@mui/material';
import Main from './components/Main';
import Login from './components/Login';
import Home from './components/Home'; 
import Join from './components/Join';
import Menu from './components/Menu';
import SocialJoin from './components/SocialJoin';
import Write from './components/Write';
import Profile from './components/Profile';

function App() {
  const location = useLocation();
  
  const isAuthPage = 
    location.pathname === '/login' || 
    location.pathname === '/join' || 
    location.pathname === '/social-join' ||
    location.pathname === '/';

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <CssBaseline />
      
      {/* 2. 인증 페이지가 아닐 때만 Menu(사이드바) 렌더링 */}
      {!isAuthPage && <Menu />} 

      {/* 3. 메인 컨텐츠 영역 */}
      <Box 
        component={isAuthPage ? 'div' : 'main'} 
        sx={{ 
          flexGrow: 1, 
          minWidth: 0, 
          p: isAuthPage ? 0 : 3 
        }}
      >
        <Routes>
          <Route path="/" element={<Main />} />
          <Route path="/login" element={<Login />} />
          <Route path="/join" element={<Join />} />
          <Route path="/home" element={<Home />} />
          <Route path="/social-join" element={<SocialJoin />} /> 
          <Route path="/write" element={<Write />} /> 
          <Route path="/profile" element={<Profile />} /> 
          <Route path="/profile/:nickname" element={<Profile />} />
        </Routes>
      </Box>
    </Box>
  );
}

export default App;