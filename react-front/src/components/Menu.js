import React, { useState } from 'react'; 
import { 
  Drawer, List, ListItem, ListItemButton, ListItemIcon, 
  ListItemText, Typography, Toolbar, Divider,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button 
} from '@mui/material';
import { Home, Create, Person, Notifications, Bookmark, Logout } from '@mui/icons-material';
import { Link, useNavigate } from 'react-router-dom';
import Write from './Write';

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
        
        {/* ✨ 리팩토링된 메뉴 리스트: map 반복문을 풀고 명시적으로 분리하여 가독성과 유지보수성 확보 */}
        <List>
          {/* 1. 홈 */}
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/home">
              <ListItemIcon sx={{ color: '#555' }}><Home /></ListItemIcon>
              <ListItemText primary="홈" />
            </ListItemButton>
          </ListItem>

          {/* 2. 새 게시물 */}
          <ListItem disablePadding>
            <ListItemButton onClick={() => setIsWriteModalOpen(true)}>
              <ListItemIcon sx={{ color: '#555' }}><Create /></ListItemIcon>
              <ListItemText primary="새 게시물" />
            </ListItemButton>
          </ListItem>

          {/* 3. 알림 */}
          <ListItem disablePadding>
            <ListItemButton component={Link} to="/notifications">
              <ListItemIcon sx={{ color: '#555' }}><Notifications /></ListItemIcon>
              <ListItemText primary="알림 (준비중)" />
            </ListItemButton>
          </ListItem>

          {/* ✨ 4. 보관함: 커스텀 함수(handleBookmarkMenuClick) 연결 */}
          <ListItem disablePadding>
            <ListItemButton onClick={handleBookmarkMenuClick}>
              <ListItemIcon sx={{ color: '#555' }}><Bookmark /></ListItemIcon>
              <ListItemText primary="보관함" />
            </ListItemButton>
          </ListItem>

          {/* 5. 프로필 */}
          <ListItem disablePadding>
            <ListItemButton component={Link} to={`/profile/${myNickname}`}>
              <ListItemIcon sx={{ color: '#555' }}><Person /></ListItemIcon>
              <ListItemText primary="프로필" />
            </ListItemButton>
          </ListItem>
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

      {/* 게시글 작성 모달 */}
      <Write open={isWriteModalOpen} onClose={() => setIsWriteModalOpen(false)} />
    </>
  );
}

export default Menu;