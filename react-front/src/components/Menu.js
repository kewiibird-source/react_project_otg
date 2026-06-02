import React, { useState } from 'react'; 
import { 
  Drawer, List, ListItem, ListItemButton, ListItemIcon, 
  ListItemText, Typography, Toolbar, Divider,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button 
} from '@mui/material';
// ✨ EditIcon 에러를 방지하기 위해 사용하시려던 Edit 아이콘이나, 기존의 Create 아이콘을 유지했습니다.
import { Home, Create, Person, Notifications, Bookmark, Logout } from '@mui/icons-material';
import { Link, useNavigate } from 'react-router-dom';
import Write from './Write';

function Menu() {
  const navigate = useNavigate();

  // 1. 로그아웃 확인 모달
  const [openDialog, setOpenDialog] = useState(false);
  // 2. 글쓰기 모달
  const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);

  // ✨ 수정 포인트: '게시글 작성'은 배열에서 뺐습니다. (아래쪽에서 따로 onClick 이벤트를 주어 렌더링하기 위함)
  const menuItems = [
    { text: '홈', icon: <Home />, path: '/home' },
    { text: '알림 (준비중)', icon: <Notifications />, path: '/notifications' },
    { text: '보관함 (준비중)', icon: <Bookmark />, path: '/archive' },
    { text: '프로필', icon: <Person />, path: '/profile' },
  ];

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
            backgroundColor: '#f8f9fa', 
          },
        }}
      >
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ fontWeight: 'bold', color: '#333' }}>
            잔너머
          </Typography>
        </Toolbar>
        <Divider />
        
        <List>
          {/* 1. 홈 메뉴 (따로 분리) */}
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/home">
              <ListItemIcon sx={{ color: '#555' }}><Home /></ListItemIcon>
              <ListItemText primary="홈" />
            </ListItemButton>
          </ListItem>

          {/* ✨ 2. 게시글 작성 메뉴 (페이지 이동 대신 모달 띄우기) */}
          <ListItem disablePadding>
            <ListItemButton onClick={() => setIsWriteModalOpen(true)}>
              <ListItemIcon sx={{ color: '#555' }}><Create /></ListItemIcon>
              <ListItemText primary="새 게시물" />
            </ListItemButton>
          </ListItem>

          {/* 3. 나머지 메뉴들 반복 렌더링 (알림, 보관함, 프로필) */}
          {menuItems.slice(1).map((item) => (
            <ListItem key={item.text} disablePadding>
              <ListItemButton component={Link} to={item.path}>
                <ListItemIcon sx={{ color: '#555' }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        
        <Divider sx={{ my: 1 }} />
        
        <List>
          <ListItem disablePadding>
            <ListItemButton onClick={handleLogoutClick}>
              <ListItemIcon sx={{ color: '#d32f2f' }}><Logout /></ListItemIcon>
              <ListItemText primary="로그아웃" sx={{ color: '#d32f2f' }} />
            </ListItemButton>
          </ListItem>
        </List>
      </Drawer>

      {/* 로그아웃 확인 모달 */}
      <Dialog open={openDialog} onClose={handleCloseDialog} >
        <DialogTitle sx={{ fontWeight: 'bold' }}>로그아웃 하시겠습니까?</DialogTitle>
        <DialogContent>
          <DialogContentText>다음에 또 방문해주세요!</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ pb: 2, pr: 2 }}>
          <Button onClick={handleCloseDialog} color="inherit" sx={{ fontWeight: 'bold' }}>취소</Button>
          <Button onClick={handleConfirmLogout} color="error" variant="contained" autoFocus>로그아웃</Button>
        </DialogActions>
      </Dialog>

      {/* ✨ 게시글 작성 모달 */}
      <Write open={isWriteModalOpen} onClose={() => setIsWriteModalOpen(false)} />
    </>
  );
}

export default Menu;