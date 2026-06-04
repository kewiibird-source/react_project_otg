import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardHeader, CardContent, Avatar, TextField, Stack, Chip, Button, IconButton, Dialog, InputBase } from '@mui/material';
import { Favorite, FavoriteBorder, ChatBubbleOutline, SendOutlined, BookmarkBorder, Close, NavigateBefore, NavigateNext, Repeat } from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
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
      localStorage.clear();
      window.location.href = '/login';
      return response;
    }
    try {
      const refreshRes = await fetch("http://localhost:3010/user/refresh", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken })
      });
      const refreshData = await refreshRes.json();
      if (refreshData.result && refreshData.accessToken) {
        localStorage.setItem('accessToken', refreshData.accessToken);
        options.headers['Authorization'] = `Bearer ${refreshData.accessToken}`;
        response = await fetch(url, options);
      } else throw new Error("리프레시 토큰도 만료됨");
    } catch (error) {
      alert("세션이 만료되었습니다. 다시 로그인해주세요.");
      localStorage.clear();
      window.location.href = '/login';
    }
  }
  return response;
};

const ActionBar = ({ post, onLike, onCommentClick, onQuoteClick }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1, py: 1 }}>
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <IconButton onClick={() => onLike(post.id, post.isLiked)} sx={{ p: 0.5 }}>
          {post.isLiked ? <Favorite sx={{ color: 'red' }} /> : <FavoriteBorder sx={{ color: 'text.primary' }} />}
        </IconButton>
        {post.likeCount > 0 && <Typography variant="body2" sx={{ ml: 0.5, fontWeight: 'bold' }}>{post.likeCount}</Typography>}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <IconButton onClick={() => onCommentClick(post)} sx={{ p: 0.5 }}>
          <ChatBubbleOutline sx={{ color: 'text.primary' }} />
        </IconButton>
        {post.commentCount > 0 && <Typography variant="body2" sx={{ ml: 0.5, fontWeight: 'bold' }}>{post.commentCount}</Typography>}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <IconButton onClick={() => onQuoteClick(post)} sx={{ p: 0.5 }}>
          <Repeat sx={{ color: 'text.primary' }} />
        </IconButton>
        {post.quoteCount > 0 && <Typography variant="body2" sx={{ ml: 0.5, fontWeight: 'bold' }}>{post.quoteCount}</Typography>}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <IconButton sx={{ p: 0.5 }}><SendOutlined sx={{ color: 'text.primary' }} /></IconButton>
      </Box>
    </Box>
    <Box><IconButton sx={{ p: 0.5 }}><BookmarkBorder sx={{ color: 'text.primary' }} /></IconButton></Box>
  </Box>
);

const ImageSlider = ({ images, height, onClick }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  if (!images || images.length === 0) return null;
  const handlePrev = (e) => { e.stopPropagation(); setCurrentIndex(prev => prev === 0 ? images.length - 1 : prev - 1); };
  const handleNext = (e) => { e.stopPropagation(); setCurrentIndex(prev => prev === images.length - 1 ? 0 : prev + 1); };

  return (
    <Box onClick={onClick} sx={{ position: 'relative', width: '100%', height: height, bgcolor: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: onClick ? 'pointer' : 'default' }}>
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

const QuoteBox = ({ parentPost, onOpenOriginal, onNavigateProfile }) => {
  if (!parentPost) return null;
  return (
    <Box onClick={(e) => { e.stopPropagation(); onOpenOriginal(parentPost.id); }} sx={{ mt: 2, p: 1.5, display: 'flex', alignItems: 'center', border: '1px solid #e0e0e0', borderRadius: 2, bgcolor: '#fafafa', cursor: 'pointer', '&:hover': { bgcolor: '#f0f0f0' }, transition: '0.2s' }}>
      {parentPost.imageUrl && <Avatar variant="rounded" src={parentPost.imageUrl} sx={{ width: 70, height: 70, mr: 1.5, border: '1px solid #eee' }} />}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
          <Repeat fontSize="small" sx={{ color: 'text.secondary', mr: 0.5, width: 16, height: 16 }} />
          <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ '&:hover': { textDecoration: 'underline' } }} onClick={(e) => onNavigateProfile(e, parentPost.authorName)}>
            @{parentPost.authorName} 님의 원본 글
          </Typography>
        </Box>
        <Typography variant="subtitle2" fontWeight="bold" noWrap>{parentPost.title}</Typography>
        <Typography variant="body2" color="text.secondary" noWrap>{parentPost.content}</Typography>
      </Box>
    </Box>
  );
};

function Home() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const [posts, setPosts] = useState([]); 
  const [userInfo, setUserInfo] = useState(null); 
  const [isLoading, setIsLoading] = useState(true);
  
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState(null);
  const [displayCount, setDisplayCount] = useState(5); 
  
  const [selectedPost, setSelectedPost] = useState(null);
  const [quotePost, setQuotePost] = useState(null);

  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState('');
  const [replyTo, setReplyTo] = useState(null); 
  const [editingCommentId, setEditingCommentId] = useState(null); 
  const [editContent, setEditContent] = useState(''); 

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    if (queryParams.get('loginSuccess') === 'true') {
      localStorage.setItem('accessToken', queryParams.get('accessToken'));
      localStorage.setItem('refreshToken', queryParams.get('refreshToken'));
      localStorage.setItem('userInfo', JSON.stringify({ nickname: queryParams.get('nickname') }));
      navigate('/home', { replace: true });
    }
    const storedUser = localStorage.getItem('userInfo');
    if (storedUser) setUserInfo(JSON.parse(storedUser));
  }, [location, navigate]);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const response = await fetchWithAuth("http://localhost:3010/api/posts");
        const data = await response.json();
        if (data.result) setPosts(data.posts); 
      } catch (error) { console.error(error); } 
      finally { setIsLoading(false); }
    };
    fetchPosts();
  }, []); 

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
    setPosts(prevPosts => prevPosts.map(p => p.id === postId ? {
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

    await fetchWithAuth(`http://localhost:3010/api/posts/${postId}/comment`, {
        method: 'POST', headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyData)
    });
    setCommentInput(''); setReplyTo(null); fetchComments(postId); 
    
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p));
    if (selectedPost && selectedPost.id === postId) setSelectedPost(prev => ({ ...prev, commentCount: prev.commentCount + 1 }));
  };

  const handleCommentEditSubmit = async (commentId) => {
    if (!editContent.trim()) return;
    const res = await fetchWithAuth(`http://localhost:3010/api/posts/comments/${commentId}`, {
        method: 'PUT', headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: editContent })
    });
    const data = await res.json();
    if (data.result) { setEditingCommentId(null); fetchComments(selectedPost.id); } 
    else alert(data.message || '수정에 실패했습니다.');
  };

  const handleProfileClick = (e, nickname) => {
    e.stopPropagation(); 
    setSelectedPost(null); 
    navigate(`/profile/${nickname}`);
  };

  const filteredPosts = posts.filter(post => {
    const matchesSearch = post.content?.toLowerCase().includes(search.toLowerCase()) || post.title?.toLowerCase().includes(search.toLowerCase());
    const matchesTag = selectedTag ? post.hashtags.includes(selectedTag) : true;
    return matchesSearch && matchesTag;
  });

  const handleOpenOriginal = (parentId) => {
    const originalPost = posts.find(p => p.id === parentId);
    if (originalPost) setSelectedPost(originalPost);
    else alert('원본 게시글을 찾을 수 없습니다.');
  };

  const hasImages = selectedPost && selectedPost.images && selectedPost.images.length > 0;

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%', py: 3 }}>
      <Box sx={{ display: 'flex', width: '100%', maxWidth: 1000, gap: 4 }}>
        <Box sx={{ flex: 1, maxWidth: 600 }}>
          <TextField fullWidth label="키워드 검색" variant="outlined" size="small" sx={{ mb: 2 }} onChange={(e) => setSearch(e.target.value)} />
          <Stack direction="row" spacing={1} sx={{ mb: 3, overflowX: 'auto', pb: 1 }}>
            <Chip label="전체" onClick={() => setSelectedTag(null)} color={selectedTag === null ? "primary" : "default"} />
            {[...new Set(posts.flatMap(p => p.hashtags))].map(tag => (
              <Chip key={tag} label={`#${tag}`} onClick={() => setSelectedTag(tag)} color={selectedTag === tag ? "primary" : "default"} />
            ))}
          </Stack>

          {isLoading ? <Typography>피드를 불러오는 중...</Typography> : 
           filteredPosts.length === 0 ? <Typography sx={{ textAlign: 'center', mt: 5 }}>검색 결과가 없습니다.</Typography> : 
           <>
             {filteredPosts.slice(0, displayCount).map((post) => (
               <Card key={post.id} sx={{ mb: 4, boxShadow: 'none', border: '1px solid #dbdbdb' }}>
                 {/* ✨ 피드 헤더에 프사 적용! (프사가 없으면 이름 첫 글자) */}
                 <CardHeader 
                   avatar={
                     <Avatar src={post.authorProfileImage || undefined} sx={{ cursor: 'pointer' }} onClick={(e) => handleProfileClick(e, post.authorName)}>
                       {!post.authorProfileImage && post.authorName?.charAt(0)}
                     </Avatar>
                   } 
                   title={<Typography sx={{ fontWeight: 'bold', fontSize: '0.9rem', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }} onClick={(e) => handleProfileClick(e, post.authorName)}>{post.authorName}</Typography>} 
                   subheader={post.createdAt} 
                 />
                 
                 <ImageSlider images={post.images} height={400} onClick={() => setSelectedPost(post)} />

                 <CardContent sx={{ pt: 1, pb: 0 }}>
                    <Typography variant="h6">{post.title}</Typography>
                    <Typography variant="body2" sx={{ mb: 1, cursor: 'pointer' }} onClick={() => setSelectedPost(post)}>
                        {post.content.length > 50 ? post.content.substring(0, 50) + '...' : post.content}
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                        {post.hashtags.map(t => <Chip key={t} label={`#${t}`} size="small" variant="outlined" />)}
                    </Stack>
                    <QuoteBox parentPost={post.parentPost} onOpenOriginal={handleOpenOriginal} onNavigateProfile={handleProfileClick} />
                </CardContent>

                <ActionBar post={post} onLike={handleLike} onCommentClick={setSelectedPost} onQuoteClick={setQuotePost} />
               </Card>
             ))}
             {displayCount < filteredPosts.length && <Button fullWidth onClick={() => setDisplayCount(prev => prev + 5)} sx={{ mb: 5 }}>더보기</Button>}
           </>}
        </Box>

        <Box sx={{ width: 320, display: { xs: 'none', md: 'block' } }}>
          {userInfo && (
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, cursor: 'pointer' }} onClick={(e) => handleProfileClick(e, userInfo.nickname)}>
              <Avatar sx={{ mr: 2 }}>{userInfo.nickname?.charAt(0)}</Avatar>
              <Typography fontWeight="bold">{userInfo.nickname}</Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* 상세 보기 모달 */}
      <Dialog open={Boolean(selectedPost)} onClose={() => setSelectedPost(null)} maxWidth="md" fullWidth PaperProps={{ sx: { height: hasImages ? '80vh' : 'auto', minHeight: hasImages ? 'auto' : '400px', maxHeight: '80vh', maxWidth: hasImages ? 1000 : 600, m: 2, borderRadius: 2 } }}>
        {selectedPost && (
          <Box sx={{ display: 'flex', flexDirection: hasImages ? 'row' : 'column', height: '100%' }}>
            {hasImages && <Box sx={{ flex: 1.5, position: 'relative' }}><ImageSlider images={selectedPost.images} height="100%" /></Box>}

            <Box sx={{ width: hasImages ? 350 : '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', height: '100%' }}>
              
              {/* ✨ 모달 헤더 프사 적용 */}
              <Box sx={{ display: 'flex', alignItems: 'center', p: 2, borderBottom: '1px solid #efefef' }}>
                <Avatar src={selectedPost.authorProfileImage || undefined} sx={{ width: 32, height: 32, mr: 1.5, cursor: 'pointer' }} onClick={(e) => handleProfileClick(e, selectedPost.authorName)}>
                  {!selectedPost.authorProfileImage && selectedPost.authorName?.charAt(0)}
                </Avatar>
                <Typography variant="subtitle2" fontWeight="bold" sx={{ flexGrow: 1, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }} onClick={(e) => handleProfileClick(e, selectedPost.authorName)}>{selectedPost.authorName}</Typography>
                <IconButton size="small" onClick={() => setSelectedPost(null)}><Close /></IconButton>
              </Box>

              <Box sx={{ flex: 1, overflowY: 'auto', p: 2, '&::-webkit-scrollbar': { display: 'none' }, maxHeight: hasImages ? 'none' : '60vh' }}>
                
                {/* ✨ 본문 작성자 프사 적용 */}
                <Box sx={{ display: 'flex', mb: 3 }}>
                  <Avatar src={selectedPost.authorProfileImage || undefined} sx={{ width: 32, height: 32, mr: 1.5, cursor: 'pointer' }} onClick={(e) => handleProfileClick(e, selectedPost.authorName)}>
                    {!selectedPost.authorProfileImage && selectedPost.authorName?.charAt(0)}
                  </Avatar>
                  <Box sx={{ width: '100%' }}>
                    <Typography variant="body2"><strong style={{ cursor: 'pointer' }} onClick={(e) => handleProfileClick(e, selectedPost.authorName)}>{selectedPost.authorName}</strong> {selectedPost.content}</Typography>
                    {selectedPost.hashtags && selectedPost.hashtags.length > 0 && (
                      <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>{selectedPost.hashtags.map(t => <Typography key={t} variant="caption" color="primary">#{t} </Typography>)}</Stack>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{selectedPost.createdAt}</Typography>
                    <QuoteBox parentPost={selectedPost.parentPost} onOpenOriginal={handleOpenOriginal} onNavigateProfile={handleProfileClick} />
                  </Box>
                </Box>

                {/* ✨ 댓글 목록 프사 적용 */}
                {comments.map((comment) => (
                  <Box key={comment.id} sx={{ display: 'flex', mb: 2, alignItems: 'flex-start', ml: comment.parentCommentId ? 4 : 0 }}>
                    <Avatar src={comment.authorProfileImage || undefined} sx={{ width: 24, height: 24, mr: 1, mt: 0.5, cursor: 'pointer' }} onClick={(e) => handleProfileClick(e, comment.authorName)}>
                      {!comment.authorProfileImage && comment.authorName?.charAt(0)}
                    </Avatar>
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
                            {userInfo && userInfo.nickname === comment.authorName && <Typography variant="caption" sx={{ cursor: 'pointer', color: 'text.secondary' }} onClick={() => { setEditingCommentId(comment.id); setEditContent(comment.content); }}>수정</Typography>}
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

export default Home;