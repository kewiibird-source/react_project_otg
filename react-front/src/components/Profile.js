import React, { useState, useEffect } from 'react';
import { Box, Typography, Avatar, Button, Stack, Divider, Tab, Tabs, IconButton, Dialog, TextField, DialogTitle, DialogContent, DialogActions, InputBase } from '@mui/material';
import { GridOn, BookmarkBorder, Settings, PhotoCamera, Search as SearchIcon } from '@mui/icons-material';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Write from './Write';
import { fetchWithAuth } from '../utils/api'; 
import PostDetailModal from '../components/PostDetailModal';
import FollowModal from '../components/FollowModal';

function Profile() {
  const navigate = useNavigate();
  const { nickname } = useParams(); 
  const location = useLocation(); 

  const [loginUser] = useState(() => {
    const storedUser = localStorage.getItem('userInfo');
    return storedUser ? JSON.parse(storedUser) : null;
  });
  
  const [profileUser, setProfileUser] = useState({ 
    nickname: '', bio: '', profileImage: '', followerCount: 0, followingCount: 0, isFollowing: false 
  }); 

  const [myPosts, setMyPosts] = useState([]);
  const [tabValue, setTabValue] = useState(location.state?.defaultTab || 0);

  const [scraps, setScraps] = useState([]);
  const [scrapSearch, setScrapSearch] = useState('');

  const [selectedPost, setSelectedPost] = useState(null);
  const [quotePost, setQuotePost] = useState(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editNickname, setEditNickname] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editProfileImage, setEditProfileImage] = useState(null);
  const [previewImage, setPreviewImage] = useState('');

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsData, setSettingsData] = useState({ email: '', currentPassword: '', newPassword: '', confirmPassword: '' });

  // 팔로우 모달 상태 관리
  const [isFollowModalOpen, setIsFollowModalOpen] = useState(false);
  const [followModalTab, setFollowModalTab] = useState(0); // 0: 팔로워, 1: 팔로잉

  const isOwnProfile = loginUser && loginUser.nickname === nickname;

  const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

  // 1. 프로필 기본 데이터 및 내 게시글 목록 로드
  useEffect(() => {
    if (!nickname) return;

    const fetchProfileData = async () => {
      try {
        const storedUser = JSON.parse(localStorage.getItem('userInfo') || '{}');
        const isMine = storedUser.nickname === nickname;
        const url = isMine ? "http://localhost:3010/api/posts/my" : `http://localhost:3010/user/${nickname}`;

        const response = await fetchWithAuth(url);
        const data = await response.json();
        
        if (data.result) {
          setMyPosts(data.posts || []); // 빈 배열 방어
          setProfileUser({ 
              nickname: isMine ? storedUser.nickname : data.nickname,
              bio: data.bio || '',                          
              profileImage: data.profileImage || '',         
              followerCount: data.followerCount || 0,
              followingCount: data.followingCount || 0,
              isFollowing: data.isFollowing || false
          });
        } else {
          alert(data.message || "프로필을 불러올 수 없습니다.");
          navigate('/home');
        }
      } catch (error) { console.error(error); }
    };

    fetchProfileData();
  }, [nickname, navigate]);

  // 2. '저장됨' 탭 클릭 시 보관함 목록 로드
  useEffect(() => {
    if (tabValue === 1 && isOwnProfile) {
      const fetchScraps = async () => {
        try {
          const res = await fetchWithAuth("http://localhost:3010/api/posts/scraps/my");
          const data = await res.json();
          if (data.result) setScraps(data.scraps || []); // 빈 배열 방어
        } catch (error) { console.error("보관함 로드 실패", error); }
      };
      fetchScraps();
    }
  }, [tabValue, isOwnProfile]);

  const handleOpenEditModal = () => {
      setEditNickname(profileUser.nickname);
      setEditBio(profileUser.bio || '');
      setPreviewImage(profileUser.profileImage || '');
      setEditProfileImage(null);
      setIsEditModalOpen(true);
  };

  const handleImageSelect = (e) => {
      const file = e.target.files[0];
      if (file) {
          setEditProfileImage(file);
          setPreviewImage(URL.createObjectURL(file));
      }
  };

  const handleProfileEditSubmit = async () => {
      if (!editNickname.trim()) return alert("닉네임을 입력해주세요.");

      const formData = new FormData();
      formData.append('nickname', editNickname);
      formData.append('bio', editBio);
      if (editProfileImage) formData.append('profileImage', editProfileImage);

      try {
          const res = await fetchWithAuth("http://localhost:3010/user/profile", {
              method: 'PUT',
              body: formData 
          });
          const data = await res.json();
          
          if (data.result) {
              alert("프로필이 성공적으로 수정되었습니다.");
              localStorage.setItem('userInfo', JSON.stringify({ ...loginUser, nickname: editNickname }));
              setIsEditModalOpen(false);
              
              if (editNickname !== profileUser.nickname) navigate(`/profile/${editNickname}`, { replace: true });
              else window.location.reload(); 
          } else alert(data.message);
      } catch (error) { alert("프로필 수정 중 오류가 발생했습니다."); }
  };

  const handleSettingsOpen = async () => {
    try {
      const res = await fetchWithAuth('http://localhost:3010/user/me');
      const data = await res.json();
      if (data.result) {
        setSettingsData({ 
          email: data.email || '', 
          provider: data.provider || 'LOCAL', // 'LOCAL','KAKAO','GOOGLE','NAVER'
          currentPassword: '', newPassword: '', confirmPassword: '' 
        });
      }
    } catch(e) {}
    setIsSettingsOpen(true);
  };

  const handleCommentCountChange = (postId, changeValue) => {
    setMyPosts(prev => prev.map(p => p.id === postId ? { ...p, commentCount: (p.commentCount || 0) + changeValue } : p));
    if (selectedPost && selectedPost.id === postId) {
      setSelectedPost(prev => ({ ...prev, commentCount: (prev.commentCount || 0) + changeValue }));
    }
  };

  const handleLike = async (postId, currentIsLiked) => {
    setMyPosts(prevPosts => prevPosts.map(p => p.id === postId ? {
        ...p, isLiked: !currentIsLiked, likeCount: currentIsLiked ? p.likeCount - 1 : p.likeCount + 1
    } : p));
    if (selectedPost && selectedPost.id === postId) {
        setSelectedPost(prev => ({ ...prev, isLiked: !currentIsLiked, likeCount: currentIsLiked ? prev.likeCount - 1 : prev.likeCount + 1 }));
    }
    await fetchWithAuth(`http://localhost:3010/api/posts/${postId}/like`, { method: 'POST' });
  };

  const handleScrapToggle = async (postId, currentScrapState) => {
    try {
      const response = await fetchWithAuth(`http://localhost:3010/api/posts/${postId}/scrap`, { method: 'POST' });
      const data = await response.json();
      
      if (data.result) {
        setMyPosts(prev => prev.map(p => p.id === postId ? { ...p, isScrapped: !currentScrapState } : p));
        
        if (selectedPost && selectedPost.id === postId) {
          setSelectedPost(prev => ({ ...prev, isScrapped: !currentScrapState }));
        }

        if (currentScrapState) {
          setScraps(prev => prev.filter(s => s.id !== postId));
        }
      }
    } catch (error) {
      console.error("보관함 처리 실패:", error);
      alert('오류가 발생했습니다.');
    }
  };

  const handleProfileClick = (e, targetName) => {
    e.stopPropagation();
    setSelectedPost(null);
    navigate(`/profile/${targetName}`);
  };

  const handleFollowToggle = async () => {
    const currentlyFollowing = profileUser.isFollowing;
    setProfileUser(prev => ({ ...prev, isFollowing: !currentlyFollowing, followerCount: currentlyFollowing ? prev.followerCount - 1 : prev.followerCount + 1 }));

    try {
        const res = await fetchWithAuth(`http://localhost:3010/user/${profileUser.nickname}/follow`, { method: 'POST' });
        const data = await res.json();
        if (!data.result) {
            setProfileUser(prev => ({ ...prev, isFollowing: currentlyFollowing, followerCount: currentlyFollowing ? prev.followerCount + 1 : prev.followerCount - 1 }));
            alert(data.message);
        }
    } catch (error) { console.error("팔로우 에러:", error); }
  };

  const filteredScraps = scraps.filter(scrap => {
    const searchTerm = scrapSearch.toLowerCase();
    const matchTitle = scrap.title?.toLowerCase().includes(searchTerm);
    const matchContent = scrap.content?.toLowerCase().includes(searchTerm);
    const matchHashtags = Array.isArray(scrap.hashtags) 
      ? scrap.hashtags.some(tag => tag.toLowerCase().includes(searchTerm)) 
      : false;
    
    return matchTitle || matchContent || matchHashtags;
  });

  // ✨ 모달창에서 팔로우/언팔로우 했을 때 프로필 숫자를 즉시 바꿔주는 함수
  const handleModalFollowChange = (changedNickname, isNowFollowing) => {
    // setProfileUser 안에서 '이전 상태(prev)'를 가져와서 계산한 뒤,
    // 새로운 객체를 리턴(return)해주어야 화면에 반영됩니다!
    setProfileUser(prev => {
        let newFollowerCount = prev.followerCount;
        let newFollowingCount = prev.followingCount;
        let newIsFollowing = prev.isFollowing;

        // ① 내 프로필에서 행동한 경우: 내 '팔로잉' 숫자가 즉시 늘거나 줄어듦
        if (isOwnProfile) {
            newFollowingCount = isNowFollowing 
              ? prev.followingCount + 1 
              : Math.max(0, prev.followingCount - 1); // 혹시 모를 마이너스 숫자 방지
        }

        // ② 남의 프로필에서 '그 사람'을 팔로우/언팔로우한 경우: '팔로워' 숫자와 프로필 메인 버튼 변경
        if (changedNickname === prev.nickname) {
            newIsFollowing = isNowFollowing;
            newFollowerCount = isNowFollowing 
              ? prev.followerCount + 1 
              : Math.max(0, prev.followerCount - 1);
        }
        return {
            ...prev, // 기존의 프로필 사진, 소개글 등은 그대로 유지하고
            isFollowing: newIsFollowing,       // 변경된 팔로우 여부 덮어쓰기
            followerCount: newFollowerCount,   // 변경된 팔로워 수 덮어쓰기
            followingCount: newFollowingCount  // 변경된 팔로잉 수 덮어쓰기
        };
    });
  };

const handleSettingsSubmit = async () => {
    // 1. 빈 값 체크
    if (!settingsData.currentPassword) return alert('현재 비밀번호를 입력해주세요.');
    if (!settingsData.newPassword) return alert('새 비밀번호를 입력해주세요.');
    if (!passwordRegex.test(settingsData.newPassword)) {
        alert('비밀번호는 영문, 숫자, 특수문자를 포함한 8자 이상이어야 합니다.');
        return;
    }
    
    // 3. 비밀번호 일치 확인
    if (settingsData.newPassword !== settingsData.confirmPassword) 
        return alert('새 비밀번호가 일치하지 않습니다.');

    try {
        const res = await fetchWithAuth('http://localhost:3010/user/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                currentPassword: settingsData.currentPassword,
                newPassword: settingsData.newPassword
            })
        });
        const data = await res.json();
        if (data.result) {
            alert('비밀번호가 변경되었습니다.');
            setIsSettingsOpen(false);
        } else {
            alert(data.message || '저장 실패');
        }
    } catch (e) { alert('오류가 발생했습니다.'); }
};

  // 회원탈퇴
  const handleWithdraw = async () => {
    if (!window.confirm('정말 탈퇴하시겠습니까?\n모든 데이터가 삭제되며 복구할 수 없습니다.')) return;
    try {
      const res = await fetchWithAuth('http://localhost:3010/user/withdraw', { method: 'DELETE' });
      const data = await res.json();
      if (data.result) {
        localStorage.clear();
        alert('탈퇴가 완료되었습니다.');
        navigate('/');
      } else alert(data.message || '탈퇴 실패');
    } catch(e) { alert('오류가 발생했습니다.'); }
  };

  return (
    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center', width: '100%', py: 4, gap: 3 }}>
       <Box sx={{ width: '100%', maxWidth: 935, px: 2 }}>
        
        {/* 프로필 헤더 */}
        <Box sx={{ display: 'flex', mb: 6, px: { xs: 2, md: 8 } }}>
          <Box sx={{ flexShrink: 0, mr: { xs: 4, md: 10 } }}>
            <Avatar src={profileUser.profileImage || undefined} sx={{ width: { xs: 80, md: 150 }, height: { xs: 80, md: 150 }, bgcolor: '#e0e0e0', fontSize: { xs: '2rem', md: '4rem' } }}>
              {!profileUser.profileImage && profileUser.nickname?.charAt(0)}
            </Avatar>
          </Box>
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2.5, flexWrap: { xs: 'wrap', sm: 'nowrap' }, gap: 2 }}>
              <Typography variant="h5" sx={{ fontWeight: 400, mr: 2 }}>{profileUser.nickname}</Typography>
              <Stack direction="row" spacing={1}>
                {isOwnProfile ? (
                    <>
                        <Button variant="contained" size="small" onClick={handleOpenEditModal} sx={{ whiteSpace: 'nowrap', minWidth: 'max-content', bgcolor: '#efefef', color: 'black', boxShadow: 'none', '&:hover': { bgcolor: '#dbdbdb', boxShadow: 'none' }, fontWeight: 'bold', borderRadius: 2, px: 2 }}>프로필 편집</Button>
                        <IconButton size="small" onClick={handleSettingsOpen}>
                          <Settings />
                        </IconButton>
                    </>
                ) : (
                    <Button variant="contained" size="small" onClick={handleFollowToggle} sx={{ whiteSpace: 'nowrap', minWidth: 'max-content', bgcolor: profileUser.isFollowing ? 'transparent' : '#0095f6', color: profileUser.isFollowing ? 'black' : 'white', fontWeight: 'bold', boxShadow: 'none', borderRadius: 2, px: 4, '&:hover': { bgcolor: profileUser.isFollowing ? 'transparent' : '#1877f2', boxShadow: 'none' } }}>
                        {profileUser.isFollowing ? '팔로잉' : '팔로우'}
                    </Button>
                )}
              </Stack>
            </Box>
            <Stack direction="row" spacing={4} sx={{ mb: 2.5, whiteSpace: 'nowrap' }}>
              <Typography variant="body1">게시물 <Box component="span" fontWeight="bold">{myPosts.length}</Box></Typography>
              
              <Typography variant="body1" sx={{ cursor: 'pointer' }} onClick={() => { setFollowModalTab(0); setIsFollowModalOpen(true); }}>
                팔로워 <Box component="span" fontWeight="bold">{profileUser.followerCount}</Box>
              </Typography>

              <Typography variant="body1" sx={{ cursor: 'pointer' }} onClick={() => { setFollowModalTab(1); setIsFollowModalOpen(true); }}>
                팔로우 <Box component="span" fontWeight="bold">{profileUser.followingCount}</Box>
              </Typography>
            </Stack>
            <Box>
              <Typography variant="subtitle2" fontWeight="bold">{profileUser.nickname}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{profileUser.bio}</Typography>
            </Box>
          </Box>
        </Box>

        <Divider />

        {/* 탭 메뉴 */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)} textColor="inherit" TabIndicatorProps={{ sx: { bgcolor: 'transparent', top: 0, height: 1 } }}>
            <Tab icon={<GridOn sx={{ fontSize: 16 }} />} iconPosition="start" label="게시물" sx={{ fontWeight: tabValue === 0 ? 'bold' : 'normal', fontSize: '0.8rem', minHeight: 50 }} />
            {isOwnProfile && <Tab icon={<BookmarkBorder sx={{ fontSize: 16 }} />} iconPosition="start" label="저장됨" sx={{ fontWeight: tabValue === 1 ? 'bold' : 'normal', fontSize: '0.8rem', minHeight: 50 }} />}
          </Tabs>
        </Box>

        {/* 탭 콘텐츠 렌더링 분기 */}
        {tabValue === 0 ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
            {myPosts.length > 0 ? (
              myPosts.map((post) => (
                <Box key={post.id} onClick={() => setSelectedPost(post)} sx={{ position: 'relative', width: '100%', paddingBottom: '100%', bgcolor: 'transparent', cursor: 'pointer', '&:hover': { opacity: 0.8 } }}>
                  {post.thumbnail ? (
                    <img src={post.thumbnail} alt="post_thumbnail" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Box sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, border: '1px solid #efefef' }}>
                      <Typography variant="body2" align="center" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.title}</Typography>
                    </Box>
                  )}
                  {/* ✨ 통계 오버레이 */}
                  <Box className="stats-overlay" sx={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    bgcolor: 'rgba(0,0,0,0.45)', opacity: 0, transition: 'opacity 0.2s ease',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2
                  }}>
                    <Typography sx={{ color: 'white', fontWeight: 'bold', fontSize: '0.85rem' }}>❤️ {post.likeCount || 0}</Typography>
                    <Typography sx={{ color: 'white', fontWeight: 'bold', fontSize: '0.85rem' }}>💬 {post.commentCount || 0}</Typography>
                    <Typography sx={{ color: 'white', fontWeight: 'bold', fontSize: '0.85rem' }}>👁️ {post.viewCount || 0}</Typography>
                  </Box>
                </Box>
              ))
            ) : (
              <Typography sx={{ gridColumn: '1 / -1', textAlign: 'center', mt: 5, color: 'text.secondary' }}>아직 작성된 게시물이 없습니다.</Typography>
            )}
          </Box>
        ) : (
          <Box sx={{ width: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: '#f1f3f4', p: 1, borderRadius: 2, mb: 3 }}>
              <SearchIcon sx={{ color: 'text.secondary', mr: 1, ml: 1 }} />
              <InputBase 
                placeholder="보관함 검색 (제목, 내용, 해시태그 포함)" 
                fullWidth 
                value={scrapSearch}
                onChange={(e) => setScrapSearch(e.target.value)}
              />
            </Box>
            
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
              {filteredScraps.length > 0 ? (
                filteredScraps.map((scrap) => (
                  <Box key={scrap.id} onClick={() => setSelectedPost(scrap)} sx={{ cursor: 'pointer', transition: '0.2s', '&:hover': { opacity: 0.8 } }}>
                    <Box sx={{ position: 'relative', width: '100%', paddingTop: '100%', bgcolor: '#eee', borderRadius: 1, overflow: 'hidden' }}>
                      {scrap.thumbnail ? (
                        <img src={scrap.thumbnail} alt="scrap_thumb" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <Box sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #efefef', p: 2 }}>
                          <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {scrap.content}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                    <Typography variant="body2" fontWeight="bold" sx={{ mt: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {scrap.title}
                    </Typography>
                  </Box>
                ))
              ) : (
                <Typography sx={{ gridColumn: '1 / -1', textAlign: 'center', mt: 5, color: 'text.secondary' }}>보관된 게시물이 없거나 검색 결과가 없습니다.</Typography>
              )}
            </Box>
          </Box>
        )}
      </Box>

      {/* 프로필 편집 모달 */}
      <Dialog open={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 'bold', textAlign: 'center', borderBottom: '1px solid #efefef' }}>프로필 편집</DialogTitle>
        <DialogContent sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4, mt: 2 }}>
                <Avatar src={previewImage || undefined} sx={{ width: 100, height: 100, mb: 2 }}>
                  {!previewImage && editNickname?.charAt(0)}
              </Avatar>
                <Button variant="outlined" component="label" size="small" startIcon={<PhotoCamera />}>
                    사진 변경
                    <input type="file" accept="image/*" hidden onChange={handleImageSelect} />
                </Button>
            </Box>
            <Stack spacing={3}>
                <TextField label="닉네임" fullWidth value={editNickname} onChange={(e) => setEditNickname(e.target.value)} />
                <TextField label="자기소개" fullWidth multiline rows={4} value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="자신을 자유롭게 표현해보세요." />
            </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
            <Button onClick={() => setIsEditModalOpen(false)} color="inherit">취소</Button>
            <Button onClick={handleProfileEditSubmit} variant="contained" disableElevation>저장</Button>
        </DialogActions>
      </Dialog>

      {/* 계정정보수정 */}
      <Dialog open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 'bold', textAlign: 'center', borderBottom: '1px solid #efefef' }}>계정 설정</DialogTitle>
      <DialogContent sx={{ p: 4 }}>
        <Stack spacing={3} sx={{ mt: 1 }}>

          {/* 가입 유형 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>가입 유형</Typography>
            <Box sx={{ 
              px: 1.5, py: 0.5, borderRadius: 2, fontSize: '0.8rem', fontWeight: 'bold',
              bgcolor: settingsData.provider === 'KAKAO' ? '#FEE500' 
                    : settingsData.provider === 'GOOGLE' ? '#EA4335'
                    : settingsData.provider === 'NAVER' ? '#03C75A' : '#1976d2',
              color: settingsData.provider === 'KAKAO' ? '#3C1E1E' : 'white'
            }}>
              {settingsData.provider === 'KAKAO' ? '카카오' 
            : settingsData.provider === 'GOOGLE' ? 'Google'
            : settingsData.provider === 'NAVER' ? '네이버' : '일반'}
            </Box>
          </Box>

          {/* 이메일 (읽기전용) */}
          <TextField
            label="이메일" fullWidth
            value={settingsData.email}
            InputProps={{ readOnly: true }}
            helperText="이메일은 변경할 수 없습니다."
            sx={{ '& .MuiInputBase-input': { color: 'text.secondary' } }}
          />

          {/* 소셜 가입자는 비밀번호 변경 불필요 */}
          {settingsData.provider === 'LOCAL' && (
            <>
              <Divider><Typography variant="caption" color="text.secondary">비밀번호 변경</Typography></Divider>
              <TextField label="현재 비밀번호" fullWidth type="password"
                value={settingsData.currentPassword}
                onChange={(e) => setSettingsData(prev => ({ ...prev, currentPassword: e.target.value }))}
              />
              <TextField 
                  label="새 비밀번호" fullWidth type="password"
                  value={settingsData.newPassword}
                  onChange={(e) => setSettingsData(prev => ({ ...prev, newPassword: e.target.value }))}
                  // ✨ 규칙에 맞지 않으면 빨간색 에러 표시
                  error={settingsData.newPassword !== '' && !passwordRegex.test(settingsData.newPassword)}
                  helperText={settingsData.newPassword !== '' && !passwordRegex.test(settingsData.newPassword) ? "영문, 숫자, 특수문자 포함 8자 이상이어야 합니다." : ""}
              />
              <TextField label="새 비밀번호 확인" fullWidth type="password"
                value={settingsData.confirmPassword}
                onChange={(e) => setSettingsData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                error={settingsData.newPassword !== settingsData.confirmPassword && settingsData.confirmPassword !== ''}
                helperText={settingsData.newPassword !== settingsData.confirmPassword && settingsData.confirmPassword !== '' ? '비밀번호가 일치하지 않습니다.' : ''}
              />
            </>
          )}

          {/* 회원탈퇴 */}
          <Divider />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="body2" fontWeight="bold" color="error">회원 탈퇴</Typography>
              <Typography variant="caption" color="text.secondary">탈퇴 시 모든 데이터가 삭제됩니다.</Typography>
            </Box>
            <Button variant="outlined" color="error" size="small" onClick={handleWithdraw}>
              탈퇴하기
            </Button>
          </Box>

        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 3, pt: 0 }}>
        <Button onClick={() => setIsSettingsOpen(false)} color="inherit">취소</Button>
        {settingsData.provider === 'LOCAL' && (
          <Button onClick={handleSettingsSubmit} variant="contained" disableElevation>저장</Button>
        )}
      </DialogActions>
    </Dialog>

      <PostDetailModal 
        open={Boolean(selectedPost)} 
        post={selectedPost} 
        onClose={() => setSelectedPost(null)}
        currentUser={loginUser} 
        onLike={handleLike}
        onQuoteClick={setQuotePost}
        onNavigateProfile={handleProfileClick}
        onOpenOriginal={null} 
        onCommentCountChange={handleCommentCountChange}
        onScrap={handleScrapToggle} 
      />

      <Write open={Boolean(quotePost)} onClose={() => setQuotePost(null)} quoteData={quotePost} />

      <FollowModal 
        open={isFollowModalOpen} 
        onClose={() => setIsFollowModalOpen(false)} 
        initialTab={followModalTab}
        targetNickname={profileUser.nickname} // 현재 보고 있는 프로필 주인의 닉네임
        loginUser={loginUser} // 내 정보 (내가 나를 팔로우할 순 없으니 버튼 숨기기 위함)
        onFollowChange={handleModalFollowChange}
      />
    </Box>
  );
}

export default Profile;