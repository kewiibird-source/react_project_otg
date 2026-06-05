import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, Box, Tabs, Tab, IconButton, InputBase, List, ListItem, ListItemAvatar, Avatar, ListItemText, Button, Typography, CircularProgress } from '@mui/material';
import { Close as CloseIcon, Search as SearchIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../utils/api';

// ✨ onFollowChange 프롭스가 새로 추가되었습니다!
function FollowModal({ open, onClose, initialTab, targetNickname, loginUser, onFollowChange }) {
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [usersList, setUsersList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTabValue(initialTab);
      setSearchQuery('');
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open || !targetNickname) return;
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const type = tabValue === 0 ? 'followers' : 'followings';
        const response = await fetchWithAuth(`http://localhost:3010/user/${targetNickname}/${type}`);
        const data = await response.json();
        if (data.result) setUsersList(data.data || []);
      } catch (error) {
        console.error("팔로우 리스트 로드 중 오류:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [open, tabValue, targetNickname]);

  // ✨ 팔로우 토글 시 모달과 프로필(부모) 화면을 동시에 업데이트
  const handleToggleFollow = async (e, nickname, isCurrentlyFollowing) => {
    e.stopPropagation();

    const newFollowingState = !isCurrentlyFollowing;

    // 1. 모달 안의 리스트 즉시 변경
    setUsersList(prev => prev.map(user => 
      user.nickname === nickname ? { ...user, isFollowing: newFollowingState } : user
    ));

    // 2. 부모(Profile.js)의 숫자 즉시 변경 알림
    if (onFollowChange) {
      onFollowChange(nickname, newFollowingState);
    }

    // 3. 서버에 저장 요청
    try {
      const res = await fetchWithAuth(`http://localhost:3010/user/${nickname}/follow`, { method: 'POST' });
      const data = await res.json();
      
      if (!data.result) {
        // 서버 에러 시 화면 롤백(원상복구)
        setUsersList(prev => prev.map(user => 
          user.nickname === nickname ? { ...user, isFollowing: isCurrentlyFollowing } : user
        ));
        if (onFollowChange) onFollowChange(nickname, isCurrentlyFollowing);
        alert(data.message);
      }
    } catch (error) {
      console.error("팔로우 처리 오류:", error);
      // 서버 에러 시 화면 롤백
      setUsersList(prev => prev.map(user => 
        user.nickname === nickname ? { ...user, isFollowing: isCurrentlyFollowing } : user
      ));
      if (onFollowChange) onFollowChange(nickname, isCurrentlyFollowing);
    }
  };

  const handleUserClick = (nickname) => {
    onClose();
    navigate(`/profile/${nickname}`);
  };

  const filteredUsers = usersList.filter(user => 
    user.nickname?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    user.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3, minHeight: 400, maxHeight: 500 } }}>
      <DialogTitle sx={{ textAlign: 'center', fontWeight: 'bold', p: 1.5, borderBottom: '1px solid #efefef' }}>
        {tabValue === 0 ? '팔로워' : '팔로잉'}
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Tabs 
        value={tabValue} 
        onChange={(e, newValue) => setTabValue(newValue)} 
        variant="fullWidth" 
        textColor="inherit" 
        TabIndicatorProps={{ sx: { bgcolor: 'text.primary', height: 1 } }}
        sx={{ 
          '& .MuiTab-root': { bgcolor: 'transparent !important' },
          '& .Mui-selected': { bgcolor: 'transparent !important' } 
        }}
      >
        <Tab label="팔로워" sx={{ fontWeight: tabValue === 0 ? 'bold' : 'normal' }} />
        <Tab label="팔로잉" sx={{ fontWeight: tabValue === 1 ? 'bold' : 'normal' }} />
      </Tabs>

      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ p: 2, pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: '#efefef', p: 0.5, px: 1.5, borderRadius: 2 }}>
            <SearchIcon sx={{ color: 'text.secondary', fontSize: 20, mr: 1 }} />
            <InputBase placeholder="검색" fullWidth value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} sx={{ fontSize: '0.9rem' }} />
          </Box>
        </Box>

        <List sx={{ px: 1, minHeight: 250 }}>
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
              <CircularProgress size={30} sx={{ color: '#ccc' }} />
            </Box>
          ) : filteredUsers.length > 0 ? (
            filteredUsers.map((user) => (
              <ListItem 
                key={user.nickname} 
                onClick={() => handleUserClick(user.nickname)}
                sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#fafafa' }, borderRadius: 1 }}
                secondaryAction={
                  loginUser?.nickname !== user.nickname && (
                    <Button 
                      variant="contained" 
                      size="small" 
                      onClick={(e) => handleToggleFollow(e, user.nickname, user.isFollowing)}
                      sx={{ 
                        bgcolor: user.isFollowing ? 'transparent' : '#0095f6', 
                        color: user.isFollowing ? 'black' : 'white', 
                        border: user.isFollowing ? '1px solid #dbdbdb' : '1px solid #0095f6',
                        boxShadow: 'none', borderRadius: 2, fontWeight: 'bold',
                        '&:hover': { 
                          bgcolor: user.isFollowing ? 'transparent' : '#1877f2', 
                          boxShadow: 'none' 
                        }
                      }}
                    >
                      {user.isFollowing ? '팔로잉' : '팔로우'}
                    </Button>
                  )
                }
              >
                <ListItemAvatar>
                  <Avatar src={user.profileImage || undefined} sx={{ width: 44, height: 44 }}>
                    {!user.profileImage && user.nickname?.charAt(0)}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText primary={<Typography variant="body2" fontWeight="bold">{user.nickname}</Typography>} secondary={<Typography variant="caption" color="text.secondary">{user.name || ' '}</Typography>} />
              </ListItem>
            ))
          ) : (
            <Typography sx={{ textAlign: 'center', mt: 4, color: 'text.secondary', fontSize: '0.9rem' }}>결과가 없습니다.</Typography>
          )}
        </List>
      </DialogContent>
    </Dialog>
  );
}

export default FollowModal;