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
  
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState(null);
  const [displayCount, setDisplayCount] = useState(5); 
  
  const [selectedPost, setSelectedPost] = useState(null);
  const [quotePost, setQuotePost] = useState(null);
  const [focusComment, setFocusComment] = useState(false); // ✨ 추가: 댓글 포커스 상태

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

  // ✨ 추가: 일반 게시물 클릭 시 (포커스 안 함)
  const handlePostClick = (post) => {
    setSelectedPost(post);
    setFocusComment(false);
  };

  // ✨ 추가: 댓글 아이콘 클릭 시 (포커스 켬)
  const handleCommentIconClick = (post) => {
    setSelectedPost(post);
    setFocusComment(true); 
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

  const handleScrapToggle = async (postId, currentScrapState) => {
    try {
      const response = await fetchWithAuth(`http://localhost:3010/api/posts/${postId}/scrap`, {
        method: 'POST'
      });
      const data = await response.json();
      
      if (data.result) {
        // 1. 피드 목록 업데이트
        setPosts(prevPosts => prevPosts.map(post => 
          post.id === postId ? { ...post, isScrapped: !currentScrapState } : post
        ));

        // ✨ 2. 모달에 띄워진 게시물(selectedPost)도 즉시 업데이트!
        if (selectedPost && selectedPost.id === postId) {
            setSelectedPost(prev => ({ ...prev, isScrapped: !currentScrapState }));
        }
      }
    } catch (error) {
      console.error("보관함 처리 실패:", error);
      alert('오류가 발생했습니다.');
    }
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%', py: 3 }}>
      <Box sx={{ display: 'flex', width: '100%', maxWidth: 1000, gap: 4 }}>
        
        {/* 왼쪽 피드 영역 */}
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
                 <CardHeader 
                   avatar={
                     <Avatar src={post.authorProfileImage || undefined} sx={{ cursor: 'pointer' }} onClick={(e) => handleProfileClick(e, post.authorName)}>
                       {!post.authorProfileImage && post.authorName?.charAt(0)}
                     </Avatar>
                   } 
                   title={<Typography sx={{ fontWeight: 'bold', fontSize: '0.9rem', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }} onClick={(e) => handleProfileClick(e, post.authorName)}>{post.authorName}</Typography>} 
                   subheader={post.createdAt} 
                 />
                 
                 {/* ✨ onClick 변경됨 */}
                 <ImageSlider images={post.images} height={400} onClick={() => handlePostClick(post)} />

                 <CardContent sx={{ pt: 1, pb: 0 }}>
                    <Typography variant="h6">{post.title}</Typography>
                    {/* ✨ onClick 변경됨 */}
                    <Typography variant="body2" sx={{ mb: 1, cursor: 'pointer' }} onClick={() => handlePostClick(post)}>
                        {post.content.length > 50 ? post.content.substring(0, 50) + '...' : post.content}
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                        {post.hashtags.map(t => <Chip key={t} label={`#${t}`} size="small" variant="outlined" />)}
                    </Stack>
                    <QuoteBox parentPost={post.parentPost} onOpenOriginal={handleOpenOriginal} onNavigateProfile={handleProfileClick} />
                </CardContent>

                <ActionBar 
                  post={post} 
                  onLike={handleLike} 
                  onCommentClick={() => handleCommentIconClick(post)} 
                  onQuoteClick={setQuotePost} 
                  onScrap={handleScrapToggle} 
                />
               </Card>
             ))}
             {displayCount < filteredPosts.length && <Button fullWidth onClick={() => setDisplayCount(prev => prev + 5)} sx={{ mb: 5 }}>더보기</Button>}
           </>}
        </Box>

        {/* 오른쪽 프로필 영역 */}
        <Box sx={{ width: 320, display: { xs: 'none', md: 'block' } }}>
          {userInfo && (
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, cursor: 'pointer' }} onClick={(e) => handleProfileClick(e, userInfo.nickname)}>
              <Avatar sx={{ mr: 2 }}>{userInfo.nickname?.charAt(0)}</Avatar>
              <Typography fontWeight="bold">{userInfo.nickname}</Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* ✨ 모달 프롭스 업데이트 */}
      <PostDetailModal 
        open={Boolean(selectedPost)} 
        post={selectedPost} 
        onClose={() => { setSelectedPost(null); setFocusComment(false); }}
        autoFocusComment={focusComment}
        currentUser={userInfo} 
        onLike={handleLike}
        onQuoteClick={setQuotePost}
        onNavigateProfile={handleProfileClick}
        onOpenOriginal={handleOpenOriginal}
        onCommentCountChange={handleCommentCountChange}
        onScrap={handleScrapToggle} 
        onCommentClick={() => setFocusComment(true)}
      />

      <Write open={Boolean(quotePost)} onClose={() => setQuotePost(null)} quoteData={quotePost} />
    </Box>
  );
}

export default Home;