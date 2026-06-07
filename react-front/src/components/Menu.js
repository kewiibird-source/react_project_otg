import React, { useState } from 'react'; 
import { 
  Drawer, List, ListItem, ListItemButton, ListItemIcon, 
  ListItemText, Typography, Toolbar, Divider,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button 
} from '@mui/material';
import { Home, Create, Person, Notifications, Bookmark, Logout } from '@mui/icons-material';
import { Link, useNavigate } from 'react-router-dom';
import Write from './Write';
import { Box } from '@mui/material';
import logoImage from '../assets/OverTheGlass.svg';

function Menu() {
  const navigate = useNavigate();

  // 1. 로그아웃 확인 모달
  const [openDialog, setOpenDialog] = useState(false);
  // 2. 글쓰기 모달
  const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);
  
  const storedUser = JSON.parse(localStorage.getItem('userInfo') || '{}');
  const myNickname = storedUser.nickname || 'me';

  // 로그아웃 관련 로직
  const handleLogoutClick = () => setOpenDialog(true);
  const handleCloseDialog = () => setOpenDialog(false);
  const handleConfirmLogout = async () => { 
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      if (refreshToken) {
        await fetch('http://localhost:3010/user/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        });
      }
    } catch (error) {
      console.error('백엔드 로그아웃 API 호출 실패:', error);
    }
    localStorage.removeItem('token'); 
    localStorage.removeItem('userInfo');
    localStorage.removeItem('accessToken'); 
    localStorage.removeItem('refreshToken');
    
    setOpenDialog(false); 
    navigate('/login', { replace: true }); 
  };

  // ✨ 보관함 클릭 로직
  const handleBookmarkMenuClick = () => {
    // 프로필 페이지로 이동하면서 state로 탭 정보를 넘겨줍니다.
    navigate(`/profile/${myNickname}`, { state: { defaultTab: 1 } });
  }

  // 🎨 1. 공통 메뉴 스타일 변수 선언 
  const menuItemStyle = {
    position: 'relative',
    transition: 'all 0.3s ease',
    '&::before': {
      content: '""',
      position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
      width: '4px', height: '0%', backgroundColor: '#1976d2', // 파란색 포인트 라인
      transition: 'height 0.3s ease', borderRadius: '0 4px 4px 0',
    },
    '&:hover': {
      backgroundColor: '#f5f5f5',
      '&::before': { height: '60%' },
      '& .MuiListItemIcon-root': { color: '#1976d2', transition: 'color 0.3s' },
      '& .MuiListItemText-root span': { color: '#1976d2', fontWeight: 'bold', transition: 'color 0.3s' }
    }
  };

  // 🎨 2. 로그아웃 전용 스타일 (빨간색)
  const logoutItemStyle = {
    ...menuItemStyle, // 기본 스타일은 그대로 가져오고
    '&::before': { ...menuItemStyle['&::before'], backgroundColor: '#d32f2f' }, // 라인만 빨간색
    '&:hover': {
      backgroundColor: '#fff0f0', // 마우스 올렸을 때 연한 빨간 배경
      '&::before': { height: '60%' },
      '& .MuiListItemIcon-root': { color: '#d32f2f', transition: 'color 0.3s' },
      '& .MuiListItemText-root span': { color: '#d32f2f', fontWeight: 'bold', transition: 'color 0.3s' }
    }
  };

  return (
    <>
      <Drawer
        variant="permanent"
        sx={{
          width: 240,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: 240,
            boxSizing: 'border-box',
            backgroundColor: '#ffffff', // 배경을 흰색으로 변경 (더 깔끔함)
            borderRight: 'none',
            boxShadow: '2px 0 10px rgba(0,0,0,0.05)', // 우측 은은한 그림자
          },
        }}
      >
        <Toolbar sx={{ padding: '20px 24px', justifyContent: 'flex-start' }}>
          <Box
            component="img"
            src={logoImage}
            alt="OverTheGlass 로고"
            onClick={() => navigate('/home')}
            sx={{
              width: 130, 
              height: 'auto',
              objectFit: 'contain',
              cursor: 'pointer',
              
              // transform 속성에 통통 튀는 텐션을 줍니다.
              transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)', 
              
              '&:hover': {
                transform: 'scale(1.08)', // 마우스를 올리면 8% 정도 앞으로 뿅 커짐
              },
              '&:active': {
                transform: 'scale(0.95)', // 클릭하는 순간 살짝 눌리는 디테일 추가!
              }
            }}
          />
        </Toolbar>
        
        {/* ✨ 스타일이 적용된 메뉴 리스트 시작 */}
        <List sx={{ px: 1 }}> {/* px: 1 을 줘서 메뉴가 벽에 너무 딱 붙지 않게 여백 추가 */}
          
          {/* 1. 홈 */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton component={Link} to="/home" sx={{ ...menuItemStyle, borderRadius: '8px' }}>
              <ListItemIcon sx={{ color: '#555' }}><Home /></ListItemIcon>
              <ListItemText primary="홈" />
            </ListItemButton>
          </ListItem>

          {/* 2. 새 게시물 */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton onClick={() => setIsWriteModalOpen(true)} sx={{ ...menuItemStyle, borderRadius: '8px' }}>
              <ListItemIcon sx={{ color: '#555' }}><Create /></ListItemIcon>
              <ListItemText primary="새 게시물" />
            </ListItemButton>
          </ListItem>

          {/* 3. 알림 */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton component={Link} to="/notifications" sx={{ ...menuItemStyle, borderRadius: '8px' }}>
              <ListItemIcon sx={{ color: '#555' }}><Notifications /></ListItemIcon>
              <ListItemText primary="알림 (준비중)" />
            </ListItemButton>
          </ListItem>

          {/* 4. 보관함 */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton onClick={handleBookmarkMenuClick} sx={{ ...menuItemStyle, borderRadius: '8px' }}>
              <ListItemIcon sx={{ color: '#555' }}><Bookmark /></ListItemIcon>
              <ListItemText primary="보관함" />
            </ListItemButton>
          </ListItem>

          {/* 5. 프로필 */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton component={Link} to={`/profile/${myNickname}`} sx={{ ...menuItemStyle, borderRadius: '8px' }}>
              <ListItemIcon sx={{ color: '#555' }}><Person /></ListItemIcon>
              <ListItemText primary="프로필" />
            </ListItemButton>
          </ListItem>
        </List>
        
        {/* 로그아웃 */}
        <List sx={{ px: 1 }}>
          <ListItem disablePadding>
            <ListItemButton onClick={handleLogoutClick} sx={{ ...logoutItemStyle, borderRadius: '8px' }}>
              <ListItemIcon sx={{ color: '#d32f2f' }}><Logout /></ListItemIcon>
              <ListItemText primary="로그아웃" sx={{ color: '#d32f2f' }} />
            </ListItemButton>
          </ListItem>
        </List>
      </Drawer>

      {/* 게시글 작성 모달 */}
      <Write open={isWriteModalOpen} onClose={() => setIsWriteModalOpen(false)} />
    </>
  );
}

export default Menu;