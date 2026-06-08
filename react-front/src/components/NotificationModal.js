import React, { useEffect, useState } from 'react';
import { Dialog, DialogTitle, List, ListItem, ListItemText, ListItemAvatar, Avatar, IconButton, Box, Typography, DialogContent, Badge } from '@mui/material';
import { Close, Favorite, ChatBubble, PersonAdd, AlternateEmail, Reply, NotificationsActive } from '@mui/icons-material';
import { fetchWithAuth } from '../utils/api';
import { useNavigate } from 'react-router-dom';

const getNotiIcon = (type) => {
    switch(type) {
        case 'LIKE': return <Favorite sx={{ color: '#e91e63', fontSize: 14, bgcolor: 'white', borderRadius: '50%', p: '2px' }} />;
        case 'COMMENT': return <ChatBubble sx={{ color: '#2196f3', fontSize: 14, bgcolor: 'white', borderRadius: '50%', p: '2px' }} />;
        case 'FOLLOW': return <PersonAdd sx={{ color: '#4caf50', fontSize: 14, bgcolor: 'white', borderRadius: '50%', p: '2px' }} />;
        case 'MENTION': return <AlternateEmail sx={{ color: '#ff9800', fontSize: 14, bgcolor: 'white', borderRadius: '50%', p: '2px' }} />;
        case 'REPLY': return <Reply sx={{ color: '#9c27b0', fontSize: 14, bgcolor: 'white', borderRadius: '50%', p: '2px' }} />;
        default: return <NotificationsActive sx={{ color: '#757575', fontSize: 14, bgcolor: 'white', borderRadius: '50%', p: '2px' }} />;
    }
};

const NotificationModal = ({ open, onClose }) => {
  const [list, setList] = useState([]);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open]);

  const fetchNotifications = async () => {
    const res = await fetchWithAuth("http://localhost:3010/api/notifications");
    const data = await res.json();
    if (data.result) setList(data.notifications);
  };

  const navigate = useNavigate();

  const handleRead = async (noti) => {
  // 1. 읽음 처리
  if (noti.isRead === 'N') {
    await fetchWithAuth(`http://localhost:3010/api/notifications/${noti.id}/read`, { method: 'PATCH' });
    setList(prev => prev.map(item => item.id === noti.id ? { ...item, isRead: 'Y' } : item));
  }

  // 2. 타입별 이동
  onClose(); // 모달 닫고 이동
  
  switch (noti.type) {
    case 'LIKE':
    case 'COMMENT':
    case 'MENTION':
    case 'REPLY':
        // 게시물로 이동 — postId가 있을 때
        if (noti.targetId) navigate(`/home`, { state: { openPostId: noti.targetId } });
        break;
    case 'FOLLOW':
        if (noti.senderName) navigate(`/profile/${noti.senderName}`);
        break;
    default:
      break;
  }
};

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ sx: { minHeight: '400px', borderRadius: 2 } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, borderBottom: '1px solid #eee' }}>
        <Typography variant="h6" fontWeight="bold">알림</Typography>
        <IconButton onClick={onClose} sx={{ p: 0.5 }}><Close /></IconButton>
      </DialogTitle>
      
      <DialogContent sx={{ minHeight: '300px', display: 'flex', flexDirection: 'column', p: 0 }}>
        {list.length > 0 ? (
          <List sx={{ width: '100%', p: 0 }}>
            {list.map(n => (
              <ListItem 
                key={n.id} 
                button 
                onClick={() => handleRead(n)} 
                sx={{ 
                  // 안 읽었으면(N) 연한 파란색 배경, 읽었으면(Y) 흰색 투명 배경
                  bgcolor: n.isRead === 'N' ? '#f4f9ff' : 'transparent', 
                  borderBottom: '1px solid #f0f0f0',
                  // 읽은 알림은 약간 흐리게(0.6) 처리해서 구별되게 만듦
                  opacity: n.isRead === 'N' ? 1 : 0.6 
                }}
              >
                <ListItemAvatar sx={{ minWidth: 56 }}>
                  <Badge overlap="circular" anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} badgeContent={getNotiIcon(n.type)}>
                    <Avatar src={n.senderProfileImage || undefined}>
                      {n.senderName ? n.senderName.charAt(0) : '?'}
                    </Avatar>
                  </Badge>
                </ListItemAvatar>
                
                <ListItemText 
                  primary={
                    // 안 읽었을 때는 글씨를 두껍게(bold) 표시
                    <Typography variant="body2" fontWeight={n.isRead === 'N' ? 'bold' : 'normal'} color="text.primary">
                      {n.senderName && <b>{n.senderName}</b>}
                      {n.senderName ? '님이 ' : ''}{n.message}
                    </Typography>
                  } 
                  secondary={<Typography variant="caption" color="text.secondary">{n.createdAt}</Typography>} 
                />
                
                {/* ✨ 안 읽은 알림(N)일 때만 우측에 파란 점 표시, 읽으면 사라짐 */}
                {n.isRead === 'N' && (
                  <Box sx={{ width: 8, height: 8, bgcolor: '#1976d2', borderRadius: '50%', ml: 1, flexShrink: 0 }} />
                )}
              </ListItem>
            ))}
          </List>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="text.secondary">새로운 알림이 없습니다.</Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default NotificationModal;