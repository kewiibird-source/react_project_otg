import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardHeader, CardContent, Avatar, TextField, Stack, Chip, Button } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import Write from './Write';
import { fetchWithAuth } from '../utils/api'; 
import PostDetailModal, { ActionBar, ImageSlider, QuoteBox } from '../components/PostDetailModal';

function Home() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const [posts, setPosts] = useState([]); 
  const [userInfo, setUserInfo] = useState(null); 
  const [isLoading, setIsLoading] = useState(true);

  const [displayCount, setDisplayCount] = useState(5); 
  
  const [selectedPost, setSelectedPost] = useState(null);
  const [quotePost, setQuotePost] = useState(null);
  const [focusComment, setFocusComment] = useState(false);

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
        if (data.result) {
          setPosts(data.posts);
        }
      } catch (error) { console.error(error); }
      finally { setIsLoading(false); }
    };
    fetchPosts();
  }, []);

  useEffect(() => {
    const openPostId = location.state?.openPostId;
    if (!openPostId) return;

    // posts가 이미 로드된 경우
    if (posts.length > 0) {
      const target = posts.find(p => p.id === openPostId);
      if (target) {
        setSelectedPost(target);
        navigate('/home', { replace: true, state: {} }); // state 초기화
      }
    }
  }, [location.state?.openPostId, posts]);

  const handleCommentCountChange = (postId, changeValue) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, commentCount: p.commentCount + changeValue } : p));
    if (selectedPost && selectedPost.id === postId) {
      setSelectedPost(prev => ({ ...prev, commentCount: prev.commentCount + changeValue }));
    }
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

  const handleProfileClick = (e, nickname) => {
    e.stopPropagation(); 
    setSelectedPost(null); 
    navigate(`/profile/${nickname}`);
  };

  const handlePostClick = (post) => {
    setSelectedPost(post);
    setFocusComment(false);
  };

  const handleCommentIconClick = (post) => {
    setSelectedPost(post);
    setFocusComment(true); 
  };

  const handleOpenOriginal = (parentId) => {
    const originalPost = posts.find(p => p.id === parentId);
    if (originalPost) setSelectedPost(originalPost);
    else alert('원본 게시글을 찾을 수 없습니다.');
  };

  const handleScrapToggle = async (postId, currentScrapState) => {
    try {
      const response = await fetchWithAuth(`http://localhost:3010/api/posts/${postId}/scrap`, { method: 'POST' });
      const data = await response.json();
      if (data.result) {
        setPosts(prevPosts => prevPosts.map(post => post.id === postId ? { ...post, isScrapped: !currentScrapState } : post));
        if (selectedPost && selectedPost.id === postId) {
          setSelectedPost(prev => ({ ...prev, isScrapped: !currentScrapState }));
        }
      }
    } catch (error) { console.error("보관함 처리 실패:", error); }
  };

  const handleFollow = async (e, post) => {
    e.stopPropagation();
    if (post.authorName === userInfo?.nickname) return;

    setPosts(prev => prev.map(p =>
      p.authorName === post.authorName
        ? { ...p, isFollowing: !p.isFollowing }
        : p
    ));
    await fetchWithAuth(`http://localhost:3010/user/${post.authorName}/follow`, { method: 'POST' });
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%', py: 3 }}>
      <Box sx={{ display: 'flex', width: '100%', maxWidth: 1000, gap: 4 }}>
        <Box sx={{ flex: 1, maxWidth: 600 }}>
          {isLoading ? <Typography>피드를 불러오는 중...</Typography> : 
           posts.length === 0 ? <Typography sx={{ textAlign: 'center', mt: 5 }}>검색 결과가 없습니다.</Typography> : 
           <>
             {posts.slice(0, displayCount).map((post) => (
               <Card key={post.id} sx={{ mb: 4, boxShadow: 'none', border: '1px solid #dbdbdb' }}>
                 <CardHeader 
                   avatar={<Avatar src={post.authorProfileImage || undefined} sx={{ cursor: 'pointer' }} onClick={(e) => handleProfileClick(e, post.authorName)}>{!post.authorProfileImage && post.authorName?.charAt(0)}</Avatar>} 
                   title={<Typography sx={{ fontWeight: 'bold', fontSize: '0.9rem', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }} onClick={(e) => handleProfileClick(e, post.authorName)}>{post.authorName}</Typography>} 
                   subheader={post.createdAt} 
                   action={
                    // 본인 게시물엔 버튼 숨김
                    post.authorName !== userInfo?.nickname && (
                      <Button
                        size="small"
                        variant={post.isFollowing ? 'outlined' : 'contained'}
                        onClick={(e) => handleFollow(e, post)}
                        sx={{ mt: 1, mr: 1, borderRadius: 5, fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                      >
                        {post.isFollowing ? '팔로잉' : '팔로우'}
                      </Button>
                    )
                  }
                 />
                 
                 <Box onClick={() => handlePostClick(post)} sx={{ cursor: 'pointer' }}>
                   <ImageSlider images={post.images} height={400} />
                 </Box>

                 <CardContent sx={{ pt: 1, pb: 0, cursor: 'pointer' }} onClick={() => handlePostClick(post)}>
                   
                   <Typography 
                     onClick={() => handlePostClick(post)}
                     sx={{ 
                       p: 0, mb: 1, cursor: 'pointer', fontSize: '0.875rem',
                       display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                     }}
                   >
                     {post.content}
                   </Typography>
                   
                   <Stack direction="row" spacing={0.5}>
                       {post.hashtags.map(t => <Chip key={t} label={`#${t}`} size="small" variant="outlined" />)}
                   </Stack>
                   <QuoteBox parentPost={post.parentPost} onOpenOriginal={handleOpenOriginal} onNavigateProfile={handleProfileClick} />
                 </CardContent>

                 <ActionBar post={post} onLike={handleLike} onCommentClick={() => handleCommentIconClick(post)} onQuoteClick={setQuotePost} onScrap={handleScrapToggle} />
               </Card>
             ))}
             {displayCount < posts.length && <Button fullWidth onClick={() => setDisplayCount(prev => prev + 5)} sx={{ mb: 5 }}>더보기</Button>}
           </>}
        </Box>
      </Box>

      <PostDetailModal 
        open={Boolean(selectedPost)} post={selectedPost} onClose={() => { setSelectedPost(null); setFocusComment(false); }}
        autoFocusComment={focusComment} currentUser={userInfo} onLike={handleLike}
        onQuoteClick={setQuotePost} onNavigateProfile={handleProfileClick} onOpenOriginal={handleOpenOriginal}
        onCommentCountChange={handleCommentCountChange} onScrap={handleScrapToggle} onCommentClick={() => setFocusComment(true)}
      />

      <Write open={Boolean(quotePost)} onClose={() => setQuotePost(null)} quoteData={quotePost} />
    </Box>
  );
}

export default Home;