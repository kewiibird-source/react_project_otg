import React, { useState, useEffect } from 'react';
import { Box, Avatar, Typography, Button, Divider, Stack } from '@mui/material';
import { Favorite, CheckCircleOutline } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../utils/api';

// ✨ props로 followTrigger와 onSidebarFollow를 받아옵니다
function RightSidebar({ userInfo, followTrigger, onSidebarFollow, likeTrigger }) {
  const navigate = useNavigate();
  const [profileImage, setProfileImage] = useState('');
  const [recommendations, setRecommendations] = useState([]);
  const [topPosts, setTopPosts] = useState([]);
  const [following, setFollowing] = useState({});

  // 1. 프로필 이미지와 인기 게시물은 맨 처음에 한 번만 불러옵니다.
  useEffect(() => {
    const fetchStatic = async () => {
      try {
        const [meRes, topRes] = await Promise.all([
          fetchWithAuth('http://localhost:3010/user/me'),
          fetchWithAuth('http://localhost:3010/api/posts/top'),
        ]);
        const [me, top] = await Promise.all([meRes.json(), topRes.json()]);
        if (me.result) setProfileImage(me.profileImage || '');
        if (top.result) setTopPosts(top.posts || []);
      } catch (e) {}
    };
    fetchStatic();
  }, []);

  // ✨ 2. 팔로우 추천 리스트는 피드에서 변경(followTrigger)이 일어날 때마다 다시 불러옵니다!
  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        const recRes = await fetchWithAuth('http://localhost:3010/api/posts/users/recommend');
        const rec = await recRes.json();
        if (rec.result) setRecommendations(rec.users || []);
      } catch (e) {}
    };
    fetchRecommendations();
  }, [followTrigger]); 

  // 사이드 좋아요 업데이트
  useEffect(() => {
    const fetchTopPosts = async () => {
      try {
        const res = await fetchWithAuth('http://localhost:3010/api/posts/top');
        const data = await res.json();
        if (data.result) setTopPosts(data.posts || []);
      } catch (e) {}
    };
    fetchTopPosts();
  }, [likeTrigger]);

  // 사이드바에서 팔로우 버튼을 눌렀을 때
  const handleFollow = async (nickname) => {
    // 버튼 색을 즉시 바꾸기 위해 로컬 상태 업데이트
    setFollowing(prev => ({ ...prev, [nickname]: !prev[nickname] }));
    
    // 서버에 팔로우 요청
    await fetchWithAuth(`http://localhost:3010/user/${nickname}/follow`, { method: 'POST' });
    
    // 피드에 알려주어 피드 안의 버튼도 '팔로잉'으로 변경
    if (onSidebarFollow) onSidebarFollow(nickname);

    // 0.5초 뒤에 추천 목록에서 자연스럽게 사라지도록 새로고침 (인스타그램 방식)
    setTimeout(async () => {
      const recRes = await fetchWithAuth('http://localhost:3010/api/posts/users/recommend');
      const rec = await recRes.json();
      if (rec.result) setRecommendations(rec.users || []);
    }, 500);
  };

  return (
    // ✨ 너비를 넓히고 왼쪽을 볼 수 있게 조정 (width: 280 -> 340, 반응형 숨김 추가)
    <Box sx={{ width: 320, flexShrink: 0, position: 'sticky', top: 80, alignSelf: 'flex-start', display: { xs: 'none', md: 'block' } }}>

      {/* 팔로우 추천 영역 */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ display: 'block', mb: 1.5 }}>
          회원님을 위한 추천
        </Typography>
        
        {recommendations.length > 0 ? (
          <Stack spacing={1.5}>
            {recommendations.map(user => (
              <Box key={user.nickname} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer' }}
                  onClick={() => navigate(`/profile/${encodeURIComponent(user.nickname)}`)}>
                  <Avatar src={user.profileImage || undefined} sx={{ width: 32, height: 32, fontSize: '0.8rem' }}>
                    {!user.profileImage && user.nickname?.charAt(0)}
                  </Avatar>
                  <Typography variant="body2" fontWeight="bold">{user.nickname}</Typography>
                </Box>
                <Button size="small" variant="text" onClick={() => handleFollow(user.nickname)}
                  sx={{ fontSize: '0.75rem', fontWeight: 'bold', p: 0, minWidth: 'auto',
                    color: following[user.nickname] ? 'text.secondary' : '#0095f6' }}>
                  {following[user.nickname] ? '팔로잉' : '팔로우'}
                </Button>
              </Box>
            ))}
          </Stack>
        ) : (
          /* ✨ 모든 회원을 팔로우 했을 때 뜨는 예쁜 알림 */
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 3, bgcolor: '#fafafa', borderRadius: 2 }}>
            <CheckCircleOutline sx={{ fontSize: 40, color: '#4caf50', mb: 1 }} />
            <Typography variant="body2" fontWeight="bold" color="text.secondary">
              모든 회원을 팔로우하셨습니다!
            </Typography>
          </Box>
        )}
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* 인기 게시물 영역 */}
      {topPosts.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ display: 'block', mb: 1.5 }}>
            인기 게시물 TOP 5
          </Typography>
          <Stack spacing={1.5}>
            {topPosts.map((post, index) => (
              <Box key={post.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="body2" color="text.secondary" fontWeight="bold" sx={{ minWidth: 16 }}>
                  {index + 1}
                </Typography>
                <Box sx={{ width: 40, height: 40, borderRadius: 1, overflow: 'hidden', flexShrink: 0,
                  bgcolor: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {post.thumbnail
                    ? <img src={post.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <Favorite sx={{ fontSize: 16, color: '#ccc' }} />}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => navigate(`/home`, { state: { openPostId: post.id }})}>
                  <Typography variant="caption" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', '&:hover': { textDecoration: 'underline' } }}>
                    {post.content}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Favorite sx={{ fontSize: 11, color: 'red' }} />
                    <Typography variant="caption" color="text.secondary">{post.likeCount}</Typography>
                  </Box>
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  );
}

export default RightSidebar;