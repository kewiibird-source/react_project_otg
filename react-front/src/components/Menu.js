import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { 
  Drawer, List, ListItem, ListItemButton, ListItemIcon, 
  ListItemText, Typography, Toolbar, Divider,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button 
} from '@mui/material';
import { Home, Create, Person, Notifications, Bookmark, Logout } from '@mui/icons-material';
import { Box } from '@mui/material';
import { PushPin, PushPinOutlined } from '@mui/icons-material';
import { Badge } from '@mui/material';

import { fetchWithAuth } from '../utils/api';
import Write from './Write';
import logoImage from '../assets/OverTheGlass.svg';
import NotificationModal from './NotificationModal';

function Menu() {
  const navigate = useNavigate();

  // 1. 로그아웃 확인 모달
  const [openDialog, setOpenDialog] = useState(false);
  // 2. 글쓰기 모달
  const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);
  // 3. 사이드바 상태
  const [isHovered, setIsHovered] = useState(false);
  // 4. 사이드바 고정? 새로고침해도 풀리지 않게
  const [isPinned, setIsPinned] = useState(() => {
    return localStorage.getItem('sidebarPinned') === 'true';
  });
  // hover OR 고정 상태면 펼침
  const isOpen = isHovered || isPinned;
  // 5. 알림
  const [isNotiOpen, setIsNotiOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0); // 1. 상태 추가

  // 2. 읽지 않은 알림 개수 가져오기
  const fetchUnreadCount = async () => {
    try {
      const res = await fetchWithAuth("http://localhost:3010/api/notifications/count");
      const data = await res.json();
      if (data.result) {
        setUnreadCount(data.count);
      }
    } catch (err) {
      console.error("알림 개수 가져오기 실패", err);
    }
  };

  // 3. 페이지가 로드될 때 알림 개수 가져오기
  useEffect(() => {
    fetchUnreadCount();
    // 5분마다 갱신되도록 하려면 아래 주석 해제 (선택사항)
    // const interval = setInterval(fetchUnreadCount, 300000);
    // return () => clearInterval(interval);
  }, []);
  
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
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          width: isOpen ? 240 : 60,
          flexShrink: 0,
          transition: 'width 0.3s ease',
          '& .MuiDrawer-paper': {
            width: isOpen ? 240 : 60,
            boxSizing: 'border-box',
            backgroundColor: '#ffffff',
            borderRight: 'none',
            boxShadow: '2px 0 10px rgba(0,0,0,0.05)',
            overflowX: 'hidden',           // ✨ 접혔을 때 텍스트 잘림 방지
            transition: 'width 0.3s ease', // ✨ 부드러운 애니메이션
          },
        }}
      >
        <Toolbar sx={{ padding: '12px 8px', justifyContent: 'center', minHeight: '64px' }}>
          {!isOpen && (
            <Box
              onClick={() => navigate('/home')}
              sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path 
                  d="M50 20 L56 44 L80 50 L56 56 L50 80 L44 56 L20 50 L44 44 Z" 
                  fill="black"
                />
              </svg>
            </Box>
          )}

          {/* 펼쳐졌을 때: 전체 로고 */}
          {isOpen && (
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
                opacity: isHovered ? 1 : 0,
                transition: 'opacity 0.2s ease 0.1s, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                '&:hover': { transform: 'scale(1.08)' },
                '&:active': { transform: 'scale(0.95)' }
              }}
            />
          )}
        </Toolbar>
        
        {/* ✨ 스타일이 적용된 메뉴 리스트 시작 */}
        <List sx={{ px: 1 }}> {/* px: 1 을 줘서 메뉴가 벽에 너무 딱 붙지 않게 여백 추가 */}
          
          {/* 1. 홈 */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton component={Link} to="/home" sx={{ ...menuItemStyle, borderRadius: '8px', pl: 1.5 }}>
              <ListItemIcon sx={{ color: '#555', minWidth: 40 }}><Home /></ListItemIcon>
              {isOpen && <ListItemText primary="홈" sx={{ opacity: isOpen ? 1 : 0, transition: 'opacity 0.15s ease 0.1s', whiteSpace: 'nowrap'}} />}
            </ListItemButton>
          </ListItem>

          {/* 2. 새 게시물 */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton onClick={() => setIsWriteModalOpen(true)} sx={{ ...menuItemStyle, borderRadius: '8px', pl: 1.5 }}>
              <ListItemIcon sx={{ color: '#555', minWidth: 40 }}><Create /></ListItemIcon>
              {isOpen && <ListItemText primary="새 게시물" sx={{ opacity: isOpen ? 1 : 0, transition: 'opacity 0.15s ease 0.1s', whiteSpace: 'nowrap'}} />}
            </ListItemButton>
          </ListItem>

          {/* 3. 알림 */}
          {/* <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton component={Link} to="/notifications" sx={{ ...menuItemStyle, borderRadius: '8px', pl: 1.5 }}>
              <ListItemIcon sx={{ color: '#555', minWidth: 40 }}><Notifications /></ListItemIcon>
              {isOpen && <ListItemText primary="알림" sx={{ opacity: isOpen ? 1 : 0, transition: 'opacity 0.15s ease 0.1s', whiteSpace: 'nowrap'}} />}
            </ListItemButton>
          </ListItem> */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton onClick={() => setIsNotiOpen(true)} sx={{ ...menuItemStyle, borderRadius: '8px', pl: 1.5 }}>
              <ListItemIcon sx={{ color: '#555', minWidth: 40 }}>
                <Badge badgeContent={unreadCount} color="error">
                  <Notifications />
                </Badge>
              </ListItemIcon>
              {isOpen && <ListItemText primary="알림" sx={{ opacity: isOpen ? 1 : 0 }} />}
            </ListItemButton>
          </ListItem>

          {/* 4. 보관함 */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton onClick={handleBookmarkMenuClick} sx={{ ...menuItemStyle, borderRadius: '8px', pl: 1.5 }}>
              <ListItemIcon sx={{ color: '#555', minWidth: 40 }}><Bookmark /></ListItemIcon>
              {isOpen && <ListItemText primary="보관함" sx={{ opacity: isOpen ? 1 : 0, transition: 'opacity 0.15s ease 0.1s', whiteSpace: 'nowrap'}} />}
            </ListItemButton>
          </ListItem>

          {/* 5. 프로필 */}
          <ListItem disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton component={Link} to={`/profile/${myNickname}`} sx={{ ...menuItemStyle, borderRadius: '8px', pl: 1.5 }}>
              <ListItemIcon sx={{ color: '#555', minWidth: 40 }}><Person /></ListItemIcon>
              {isOpen && <ListItemText primary="프로필" sx={{ opacity: isOpen ? 1 : 0, transition: 'opacity 0.15s ease 0.1s', whiteSpace: 'nowrap'}} />}
            </ListItemButton>
          </ListItem>

         <Divider sx={{ my: 1 }} />
        {/* 로그아웃 */}

          <ListItem disablePadding>
            <ListItemButton onClick={handleLogoutClick} sx={{ ...menuItemStyle, borderRadius: '8px', pl: 1.5 }}>
              <ListItemIcon sx={{ color: '#d32f2f', minWidth: 40 }}><Logout /></ListItemIcon>
              {isOpen && <ListItemText primary="로그아웃" sx={{ opacity: isOpen ? 1 : 0, transition: 'opacity 0.15s ease 0.1s', whiteSpace: 'nowrap', color: '#d32f2f' }} />}
            </ListItemButton>
          </ListItem>

          <ListItem disablePadding sx={{ mb: 0.5 }}>
          <ListItemButton onClick={() => setIsPinned(prev => {
            const next = !prev;
            localStorage.setItem('sidebarPinned', next);
            return next;
          })} sx={{ ...menuItemStyle, borderRadius: '8px', pl: 1.5 }}>
            <ListItemIcon sx={{ color: isPinned ? '#1976d2' : '#555', minWidth: 40 }}>
              {isPinned ? <PushPin /> : <PushPinOutlined />}
            </ListItemIcon>
            {isOpen && (
              <ListItemText 
                primary={isPinned ? '고정 해제' : '사이드바 고정'} 
                sx={{ opacity: isOpen ? 1 : 0, transition: 'opacity 0.15s ease 0.1s', whiteSpace: 'nowrap' }} 
              />
            )}
          </ListItemButton>
        </ListItem>
        </List>
      </Drawer>
      

      {/* 로그아웃 확인 다이얼로그 */}
      <Dialog open={openDialog} onClose={handleCloseDialog}>
        <DialogTitle>로그아웃</DialogTitle>
        <DialogContent>
          <DialogContentText>정말 로그아웃 하시겠습니까?</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>취소</Button>
          <Button onClick={handleConfirmLogout} color="error">로그아웃</Button>
        </DialogActions>
      </Dialog>

      {/* 게시글 작성 모달 */}
      <Write open={isWriteModalOpen} onClose={() => setIsWriteModalOpen(false)} />
      {/* 알림창 모달 */}
      <NotificationModal open={isNotiOpen} onClose={() => setIsNotiOpen(false)} />
    </>
  );
}

export default Menu;