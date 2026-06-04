import React, { useState, useEffect } from 'react';
import { Box, Typography, Avatar, Button, Stack, Divider, Tab, Tabs, IconButton, Dialog, InputBase, TextField, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { GridOn, BookmarkBorder, Settings, Favorite, FavoriteBorder, ChatBubbleOutline, SendOutlined, Close, NavigateBefore, NavigateNext, Repeat, PhotoCamera } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import Write from './Write';

const fetchWithAuth = async (url, options = {}) => {
  let accessToken = localStorage.getItem('accessToken');
  if (!options.headers) options.headers = {};
  if (accessToken) options.headers['Authorization'] = `Bearer ${accessToken}`;
  let response = await fetch(url, options);

  if (response.status === 401 || response.status === 403) {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      alert("로그인이 만료되었습니다. 다시 로그인해주세요.");
      localStorage.clear(); window.location.href = '/login'; return response;
    }
    try {
      const refreshRes = await fetch("http://localhost:3010/user/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken }) });
      const refreshData = await refreshRes.json();
      if (refreshData.result && refreshData.accessToken) {
        localStorage.setItem('accessToken', refreshData.accessToken);
        options.headers['Authorization'] = `Bearer ${refreshData.accessToken}`;
        response = await fetch(url, options);
      } else throw new Error("리프레시 토큰도 만료됨");
    } catch (error) {
      alert("세션이 만료되었습니다. 다시 로그인해주세요.");
      localStorage.clear(); window.location.href = '/login';
    }
  }
  return response;
};

const ActionBar = ({ post, onLike, onCommentClick, onQuoteClick }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1, py: 1 }}>
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <IconButton onClick={() => onLike(post.id, post.isLiked)} sx={{ p: 0.5 }}>{post.isLiked ? <Favorite sx={{ color: 'red' }} /> : <FavoriteBorder sx={{ color: 'text.primary' }} />}</IconButton>
        {post.likeCount > 0 && <Typography variant="body2" sx={{ ml: 0.5, fontWeight: 'bold' }}>{post.likeCount}</Typography>}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <IconButton onClick={() => onCommentClick(post)} sx={{ p: 0.5 }}><ChatBubbleOutline sx={{ color: 'text.primary' }} /></IconButton>
        {post.commentCount > 0 && <Typography variant="body2" sx={{ ml: 0.5, fontWeight: 'bold' }}>{post.commentCount}</Typography>}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <IconButton onClick={() => onQuoteClick(post)} sx={{ p: 0.5 }}><Repeat sx={{ color: 'text.primary' }} /></IconButton>
        {post.quoteCount > 0 && <Typography variant="body2" sx={{ ml: 0.5, fontWeight: 'bold' }}>{post.quoteCount}</Typography>}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center' }}><IconButton sx={{ p: 0.5 }}><SendOutlined sx={{ color: 'text.primary' }} /></IconButton></Box>
    </Box>
    <Box><IconButton sx={{ p: 0.5 }}><BookmarkBorder sx={{ color: 'text.primary' }} /></IconButton></Box>
  </Box>
);

const ImageSlider = ({ images, height }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  if (!images || images.length === 0) return null;
  const handlePrev = (e) => { e.stopPropagation(); setCurrentIndex(prev => prev === 0 ? images.length - 1 : prev - 1); };
  const handleNext = (e) => { e.stopPropagation(); setCurrentIndex(prev => prev === images.length - 1 ? 0 : prev + 1); };

  return (
    <Box sx={{ position: 'relative', width: '100%', height: height, bgcolor: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img src={images[currentIndex]} alt="post_image" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      {images.length > 1 && (
        <>
          <IconButton onClick={handlePrev} sx={{ position: 'absolute', left: 8, bgcolor: 'rgba(255,255,255,0.6)', '&:hover': { bgcolor: 'white' } }}><NavigateBefore /></IconButton>
          <IconButton onClick={handleNext} sx={{ position: 'absolute', right: 8, bgcolor: 'rgba(255,255,255,0.6)', '&:hover': { bgcolor: 'white' } }}><NavigateNext /></IconButton>
          <Box sx={{ position: 'absolute', bottom: 16, display: 'flex', gap: 1 }}>{images.map((_, idx) => <Box key={idx} sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: idx === currentIndex ? '#1976d2' : 'rgba(255,255,255,0.5)', transition: '0.3s' }} /> )}</Box>
        </>
      )}
    </Box>
  );
};

const QuoteBox = ({ parentPost, onNavigateProfile }) => {
  if (!parentPost) return null;
  return (
    <Box sx={{ mt: 2, p: 1.5, display: 'flex', alignItems: 'center', border: '1px solid #e0e0e0', borderRadius: 2, bgcolor: '#fafafa' }}>
      {parentPost.imageUrl && <Avatar variant="rounded" src={parentPost.imageUrl} sx={{ width: 70, height: 70, mr: 1.5, border: '1px solid #eee' }} />}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
          <Repeat fontSize="small" sx={{ color: 'text.secondary', mr: 0.5, width: 16, height: 16 }} />
          <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }} onClick={(e) => onNavigateProfile(e, parentPost.authorName)}>@{parentPost.authorName} 님의 원본 글</Typography>
        </Box>
        <Typography variant="subtitle2" fontWeight="bold" noWrap>{parentPost.title}</Typography>
        <Typography variant="body2" color="text.secondary" noWrap>{parentPost.content}</Typography>
      </Box>
    </Box>
  );
};

function Profile() {
  const navigate = useNavigate();
  const { nickname } = useParams(); 
  
  const [loginUser, setLoginUser] = useState(null); 
  
  // ✨ DB에서 가져오는 정보 구조화 (bio와 profileImage 포함)
  const [profileUser, setProfileUser] = useState({ 
    nickname: '', bio: '', profileImage: '', followerCount: 0, followingCount: 0, isFollowing: false 
  }); 

  const [myPosts, setMyPosts] = useState([]);
  const [tabValue, setTabValue] = useState(0);

  const [selectedPost, setSelectedPost] = useState(null);
  const [quotePost, setQuotePost] = useState(null);

  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState('');
  const [replyTo, setReplyTo] = useState(null); 
  const [editingCommentId, setEditingCommentId] = useState(null); 
  const [editContent, setEditContent] = useState(''); 

  // ✨ 프로필 편집 모달용 상태
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editNickname, setEditNickname] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editProfileImage, setEditProfileImage] = useState(null);
  const [previewImage, setPreviewImage] = useState('');

  useEffect(() => {
    const storedUser = localStorage.getItem('userInfo');
    if (storedUser) setLoginUser(JSON.parse(storedUser));
  }, []);

  useEffect(() => {
    if (!nickname) return;

    const fetchProfileData = async () => {
      try {
        const storedUser = JSON.parse(localStorage.getItem('userInfo') || '{}');
        const isMine = storedUser.nickname === nickname;
        const url = isMine ? "http://localhost:3010/api/posts/my" : `http://localhost:3010/api/posts/user/${nickname}`;

        const response = await fetchWithAuth(url);
        const data = await response.json();
        
        if (data.result) {
          setMyPosts(data.posts);
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

  // 프로필 편집 모달 열기
  const handleOpenEditModal = () => {
      setEditNickname(profileUser.nickname);
      setEditBio(profileUser.bio || '');
      setPreviewImage(profileUser.profileImage || '');
      setEditProfileImage(null);
      setIsEditModalOpen(true);
  };

  // 프로필 이미지 선택
  const handleImageSelect = (e) => {
      const file = e.target.files[0];
      if (file) {
          setEditProfileImage(file);
          setPreviewImage(URL.createObjectURL(file));
      }
  };

  // 프로필 편집 저장 처리
  const handleProfileEditSubmit = async () => {
      if (!editNickname.trim()) return alert("닉네임을 입력해주세요.");

      const formData = new FormData();
      formData.append('nickname', editNickname);
      formData.append('bio', editBio);
      if (editProfileImage) formData.append('profileImage', editProfileImage);

      try {
          const res = await fetchWithAuth("http://localhost:3010/user/profile", {
              method: 'PUT',
              body: formData // FormData는 headers에 Content-Type을 수동으로 넣지 않습니다!
          });
          const data = await res.json();
          
          if (data.result) {
              alert("프로필이 성공적으로 수정되었습니다.");
              // LocalStorage의 내 정보 업데이트
              localStorage.setItem('userInfo', JSON.stringify({ ...loginUser, nickname: editNickname }));
              setIsEditModalOpen(false);
              
              // 닉네임이 바뀌었다면 새로운 닉네임 주소로 이동
              if (editNickname !== profileUser.nickname) {
                  navigate(`/profile/${editNickname}`, { replace: true });
              } else {
                  window.location.reload(); // 단순 정보 변경이면 새로고침
              }
          } else {
              alert(data.message);
          }
      } catch (error) {
          alert("프로필 수정 중 오류가 발생했습니다.");
      }
  };


  useEffect(() => {
    if (selectedPost) fetchComments(selectedPost.id);
    else { setComments([]); setReplyTo(null); setEditingCommentId(null); }
  }, [selectedPost]);

  const fetchComments = async (postId) => {
    const response = await fetchWithAuth(`http://localhost:3010/api/posts/${postId}/comments`);
    const data = await response.json();
    if (data.result) setComments(data.comments);
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

  const handleCommentSubmit = async (postId) => {
    if (!commentInput.trim()) return;
    const bodyData = { content: commentInput };
    if (replyTo) bodyData.parentCommentId = replyTo.id;

    await fetchWithAuth(`http://localhost:3010/api/posts/${postId}/comment`, { method: 'POST', headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyData) });
    setCommentInput(''); setReplyTo(null); fetchComments(postId); 
    
    setMyPosts(prev => prev.map(p => p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p));
    if (selectedPost && selectedPost.id === postId) setSelectedPost(prev => ({ ...prev, commentCount: prev.commentCount + 1 }));
  };

  const handleCommentEditSubmit = async (commentId) => {
    if (!editContent.trim()) return;
    const res = await fetchWithAuth(`http://localhost:3010/api/posts/comments/${commentId}`, { method: 'PUT', headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: editContent }) });
    const data = await res.json();
    if (data.result) { setEditingCommentId(null); fetchComments(selectedPost.id); } 
    else alert(data.message || '수정에 실패했습니다.');
  };

  const handleProfileClick = (e, targetName) => {
    e.stopPropagation();
    setSelectedPost(null);
    navigate(`/profile/${targetName}`);
  };

  const handleFollowToggle = async () => {
    const currentlyFollowing = profileUser.isFollowing;
    setProfileUser(prev => ({
        ...prev, isFollowing: !currentlyFollowing, followerCount: currentlyFollowing ? prev.followerCount - 1 : prev.followerCount + 1
    }));

    try {
        const res = await fetchWithAuth(`http://localhost:3010/api/posts/user/${profileUser.nickname}/follow`, { method: 'POST' });
        const data = await res.json();
        if (!data.result) {
            setProfileUser(prev => ({ ...prev, isFollowing: currentlyFollowing, followerCount: currentlyFollowing ? prev.followerCount + 1 : prev.followerCount - 1 }));
            alert(data.message);
        }
    } catch (error) { console.error("팔로우 에러:", error); }
  };

  const isOwnProfile = loginUser && loginUser.nickname === nickname;
  const hasImages = selectedPost && selectedPost.images && selectedPost.images.length > 0;

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%', py: 4 }}>
      <Box sx={{ width: '100%', maxWidth: 935, px: 2 }}>
        
        {/* 프로필 헤더 */}
        <Box sx={{ display: 'flex', mb: 6, px: { xs: 2, md: 8 } }}>
          <Box sx={{ flexShrink: 0, mr: { xs: 4, md: 10 } }}>
            {/* ✨ 진짜 프로필 이미지 적용 */}
            <Avatar 
                src={profileUser.profileImage || undefined}
                sx={{ width: { xs: 80, md: 150 }, height: { xs: 80, md: 150 }, bgcolor: '#e0e0e0', fontSize: { xs: '2rem', md: '4rem' } }}
            >
              {!profileUser.profileImage && profileUser.nickname?.charAt(0)}
            </Avatar>
          </Box>
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 2 }}>
              <Typography variant="h5" sx={{ fontWeight: 400, mr: 2 }}>{profileUser.nickname}</Typography>
              <Stack direction="row" spacing={1}>
                {isOwnProfile ? (
                    <>
                        <Button variant="contained" size="small" onClick={handleOpenEditModal} sx={{ bgcolor: '#efefef', color: 'black', boxShadow: 'none', '&:hover': { bgcolor: '#dbdbdb', boxShadow: 'none' }, fontWeight: 'bold', borderRadius: 2, px: 2 }}>프로필 편집</Button>
                        <Button variant="contained" size="small" sx={{ bgcolor: '#efefef', color: 'black', boxShadow: 'none', '&:hover': { bgcolor: '#dbdbdb', boxShadow: 'none' }, fontWeight: 'bold', borderRadius: 2, px: 2 }}>보관함 보기</Button>
                        <IconButton size="small"><Settings /></IconButton>
                    </>
                ) : (
                    <Button variant="contained" size="small" onClick={handleFollowToggle} sx={{ bgcolor: profileUser.isFollowing ? '#efefef' : '#0095f6', color: profileUser.isFollowing ? 'black' : 'white', fontWeight: 'bold', boxShadow: 'none', borderRadius: 2, px: 4, '&:hover': { bgcolor: profileUser.isFollowing ? '#dbdbdb' : '#1877f2', boxShadow: 'none' } }}>
                        {profileUser.isFollowing ? '팔로잉' : '팔로우'}
                    </Button>
                )}
              </Stack>
            </Box>
            
            <Stack direction="row" spacing={4} sx={{ mb: 2.5 }}>
              <Typography variant="body1">게시물 <Box component="span" fontWeight="bold">{myPosts.length}</Box></Typography>
              <Typography variant="body1" sx={{ cursor: 'pointer' }}>팔로워 <Box component="span" fontWeight="bold">{profileUser.followerCount}</Box></Typography>
              <Typography variant="body1" sx={{ cursor: 'pointer' }}>팔로우 <Box component="span" fontWeight="bold">{profileUser.followingCount}</Box></Typography>
            </Stack>
            <Box>
              <Typography variant="subtitle2" fontWeight="bold">{profileUser.nickname}</Typography>
              {/* ✨ 진짜 자기소개(Bio) 텍스트 적용 */}
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                  {profileUser.bio || '자기소개를 입력해보세요!'}
              </Typography>
            </Box>
          </Box>
        </Box>

        <Divider />

        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)} textColor="inherit" TabIndicatorProps={{ sx: { bgcolor: 'black', top: 0, height: 1 } }}>
            <Tab icon={<GridOn sx={{ fontSize: 16 }} />} iconPosition="start" label="게시물" sx={{ fontWeight: tabValue === 0 ? 'bold' : 'normal', fontSize: '0.8rem', minHeight: 50 }} />
            <Tab icon={<BookmarkBorder sx={{ fontSize: 16 }} />} iconPosition="start" label="저장됨" sx={{ fontWeight: tabValue === 1 ? 'bold' : 'normal', fontSize: '0.8rem', minHeight: 50 }} />
          </Tabs>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
          {myPosts.length > 0 ? (
            myPosts.map((post) => (
              <Box key={post.id} onClick={() => setSelectedPost(post)} sx={{ position: 'relative', width: '100%', paddingBottom: '100%', bgcolor: '#fafafa', cursor: 'pointer', '&:hover': { opacity: 0.8 } }}>
                {post.thumbnail ? (
                  <img src={post.thumbnail} alt="post_thumbnail" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Box sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, border: '1px solid #efefef' }}>
                    <Typography variant="body2" align="center" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{post.title}</Typography>
                  </Box>
                )}
              </Box>
            ))
          ) : (
            <Typography sx={{ gridColumn: '1 / -1', textAlign: 'center', mt: 5, color: 'text.secondary' }}>아직 작성된 게시물이 없습니다.</Typography>
          )}
        </Box>
      </Box>

      {/* ✨ [신규 추가] 프로필 편집 모달창 */}
      <Dialog open={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 'bold', textAlign: 'center', borderBottom: '1px solid #efefef' }}>프로필 편집</DialogTitle>
        <DialogContent sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4, mt: 2 }}>
                <Avatar src={previewImage} sx={{ width: 100, height: 100, mb: 2 }}>
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

      {/* 상세 보기 모달 */}
      <Dialog open={Boolean(selectedPost)} onClose={() => setSelectedPost(null)} maxWidth="md" fullWidth PaperProps={{ sx: { height: hasImages ? '80vh' : 'auto', minHeight: hasImages ? 'auto' : '400px', maxHeight: '80vh', maxWidth: hasImages ? 1000 : 600, m: 2, borderRadius: 2 } }}>
        {selectedPost && (
          <Box sx={{ display: 'flex', flexDirection: hasImages ? 'row' : 'column', height: '100%' }}>
            {hasImages && <Box sx={{ flex: 1.5, position: 'relative' }}><ImageSlider images={selectedPost.images} height="100%" /></Box>}

            <Box sx={{ width: hasImages ? 350 : '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', p: 2, borderBottom: '1px solid #efefef' }}>
                <Avatar sx={{ width: 32, height: 32, mr: 1.5, cursor: 'pointer' }} onClick={(e) => handleProfileClick(e, selectedPost.authorName)}>{selectedPost.authorName?.charAt(0)}</Avatar>
                <Typography variant="subtitle2" fontWeight="bold" sx={{ flexGrow: 1, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }} onClick={(e) => handleProfileClick(e, selectedPost.authorName)}>{selectedPost.authorName}</Typography>
                <IconButton size="small" onClick={() => setSelectedPost(null)}><Close /></IconButton>
              </Box>

              <Box sx={{ flex: 1, overflowY: 'auto', p: 2, '&::-webkit-scrollbar': { display: 'none' }, maxHeight: hasImages ? 'none' : '60vh' }}>
                <Box sx={{ display: 'flex', mb: 3 }}>
                  <Avatar sx={{ width: 32, height: 32, mr: 1.5, cursor: 'pointer' }} onClick={(e) => handleProfileClick(e, selectedPost.authorName)}>{selectedPost.authorName?.charAt(0)}</Avatar>
                  <Box sx={{ width: '100%' }}>
                    <Typography variant="body2"><strong style={{ cursor: 'pointer' }} onClick={(e) => handleProfileClick(e, selectedPost.authorName)}>{selectedPost.authorName}</strong> {selectedPost.content}</Typography>
                    {selectedPost.hashtags && selectedPost.hashtags.length > 0 && (
                      <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>{selectedPost.hashtags.map(t => <Typography key={t} variant="caption" color="primary">#{t} </Typography>)}</Stack>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{selectedPost.createdAt}</Typography>
                    <QuoteBox parentPost={selectedPost.parentPost} onNavigateProfile={handleProfileClick} />
                  </Box>
                </Box>
                
                {comments.map((comment) => (
                  <Box key={comment.id} sx={{ display: 'flex', mb: 2, alignItems: 'flex-start', ml: comment.parentCommentId ? 4 : 0 }}>
                    <Avatar sx={{ width: 24, height: 24, mr: 1, mt: 0.5, cursor: 'pointer' }} onClick={(e) => handleProfileClick(e, comment.authorName)}>{comment.authorName?.charAt(0)}</Avatar>
                    <Box sx={{ flex: 1 }}>
                      {editingCommentId === comment.id ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <InputBase fullWidth value={editContent} onChange={(e) => setEditContent(e.target.value)} sx={{ borderBottom: '1px solid #ccc', fontSize: '0.85rem' }} autoFocus />
                          <Button size="small" onClick={() => handleCommentEditSubmit(comment.id)} sx={{ minWidth: 'auto', p: 0 }}>완료</Button>
                          <Button size="small" onClick={() => setEditingCommentId(null)} sx={{ minWidth: 'auto', p: 0, color: 'text.secondary' }}>취소</Button>
                        </Box>
                      ) : (
                        <>
                          <Typography variant="body2"><strong style={{ cursor: 'pointer' }} onClick={(e) => handleProfileClick(e, comment.authorName)}>{comment.authorName}</strong> {comment.content}</Typography>
                          <Stack direction="row" spacing={1.5} sx={{ mt: 0.5, alignItems: 'center' }}>
                            <Typography variant="caption" color="text.secondary">{comment.createdAt}</Typography>
                            {!comment.parentCommentId && <Typography variant="caption" sx={{ cursor: 'pointer', color: 'text.secondary', fontWeight: 'bold' }} onClick={() => { setReplyTo(comment); setCommentInput(`@${comment.authorName} `); }}>답글 달기</Typography>}
                            {loginUser && loginUser.nickname === comment.authorName && <Typography variant="caption" sx={{ cursor: 'pointer', color: 'text.secondary' }} onClick={() => { setEditingCommentId(comment.id); setEditContent(comment.content); }}>수정</Typography>}
                          </Stack>
                        </>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>

              <Box sx={{ mt: 'auto' }}>
                <Box sx={{ borderTop: '1px solid #efefef' }}><ActionBar post={selectedPost} onLike={handleLike} onCommentClick={() => {}} onQuoteClick={setQuotePost} /></Box>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    {replyTo && (
                        <Box sx={{ px: 2, py: 1, bgcolor: '#f1f1f1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="caption" color="text.secondary">@{replyTo.authorName} 님에게 답글 남기는 중...</Typography>
                            <Close sx={{ fontSize: 14, cursor: 'pointer' }} onClick={() => { setReplyTo(null); setCommentInput(''); }} />
                        </Box>
                    )}
                    <Box sx={{ borderTop: '1px solid #efefef', p: 1.5, display: 'flex', alignItems: 'center' }}>
                        <InputBase placeholder={replyTo ? "답글 달기..." : "댓글 달기..."} fullWidth sx={{ ml: 1, fontSize: '0.9rem' }} value={commentInput} onChange={(e) => setCommentInput(e.target.value)} onKeyPress={(e) => { if(e.key === 'Enter') handleCommentSubmit(selectedPost.id); }} />
                        <Button onClick={() => handleCommentSubmit(selectedPost.id)} disabled={!commentInput.trim()} variant="text" size="small" sx={{ minWidth: 'auto', fontWeight: 'bold' }}>게시</Button>
                    </Box>
                </Box>
              </Box>
            </Box>
          </Box>
        )}
      </Dialog>
      <Write open={Boolean(quotePost)} onClose={() => setQuotePost(null)} quoteData={quotePost} />
    </Box>
  );
}

export default Profile;