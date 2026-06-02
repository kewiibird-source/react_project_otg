import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardHeader, CardContent, Avatar, TextField, Stack, Chip, Button, IconButton, Dialog, InputBase } from '@mui/material';
import { FavoriteBorder, ChatBubbleOutline, SendOutlined, BookmarkBorder, Close, NavigateBefore, NavigateNext, Repeat } from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import Write from './Write';

// 1. 이미지 슬라이더 컴포넌트
const ImageSlider = ({ images, height, onClick }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  if (!images || images.length === 0) return null;

  const handlePrev = (e) => {
    e.stopPropagation(); 
    setCurrentIndex(prev => prev === 0 ? images.length - 1 : prev - 1);
  };
  const handleNext = (e) => {
    e.stopPropagation();
    setCurrentIndex(prev => prev === images.length - 1 ? 0 : prev + 1);
  };

  return (
    <Box onClick={onClick} sx={{ position: 'relative', width: '100%', height: height, bgcolor: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: onClick ? 'pointer' : 'default' }}>
      <img src={images[currentIndex]} alt="post_image" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      {images.length > 1 && (
        <>
          <IconButton onClick={handlePrev} sx={{ position: 'absolute', left: 8, bgcolor: 'rgba(255,255,255,0.6)', '&:hover': { bgcolor: 'white' } }}><NavigateBefore /></IconButton>
          <IconButton onClick={handleNext} sx={{ position: 'absolute', right: 8, bgcolor: 'rgba(255,255,255,0.6)', '&:hover': { bgcolor: 'white' } }}><NavigateNext /></IconButton>
          <Box sx={{ position: 'absolute', bottom: 16, display: 'flex', gap: 1 }}>
            {images.map((_, idx) => (
              <Box key={idx} sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: idx === currentIndex ? '#1976d2' : 'rgba(255,255,255,0.5)', transition: '0.3s' }} />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
};

// ✨ 2. 비율 찌그러짐을 완벽하게 해결한 인용 박스 컴포넌트
const QuoteBox = ({ parentPost, onOpenOriginal }) => {
  if (!parentPost) return null;
  return (
    <Box 
      onClick={(e) => { 
        e.stopPropagation(); 
        onOpenOriginal(parentPost.id); 
      }}
      // 박스 안쪽에 여백(p: 1.5)을 주어 더 카드 같은 느낌을 줍니다.
      sx={{ mt: 2, p: 1.5, display: 'flex', alignItems: 'center', border: '1px solid #e0e0e0', borderRadius: 2, bgcolor: '#fafafa', cursor: 'pointer', '&:hover': { bgcolor: '#f0f0f0' }, transition: '0.2s' }}
    >
      {/* ✨ img 태그 대신 Avatar를 사용하여 절대 찌그러지지 않는 정사각형(70x70) 썸네일 구현 */}
      {parentPost.imageUrl && (
        <Avatar 
            variant="rounded" 
            src={parentPost.imageUrl} 
            sx={{ width: 70, height: 70, mr: 1.5, border: '1px solid #eee' }} 
        />
      )}
      
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
          <Repeat fontSize="small" sx={{ color: 'text.secondary', mr: 0.5, width: 16, height: 16 }} />
          <Typography variant="caption" color="text.secondary" fontWeight="bold">@{parentPost.authorName} 님의 원본 글</Typography>
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

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    if (queryParams.get('loginSuccess') === 'true') {
      localStorage.setItem('accessToken', queryParams.get('accessToken'));
      localStorage.setItem('userInfo', JSON.stringify({ nickname: queryParams.get('nickname') }));
      navigate('/home', { replace: true });
    }
    const storedUser = localStorage.getItem('userInfo');
    if (storedUser) setUserInfo(JSON.parse(storedUser));
  }, [location, navigate]);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const response = await fetch("http://localhost:3010/api/posts", {
          headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.result) setPosts(data.posts); 
      } catch (error) {
        console.error("서버 통신 에러:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPosts();
  }, []); 

  const filteredPosts = posts.filter(post => {
    const matchesSearch = post.content?.toLowerCase().includes(search.toLowerCase()) || 
                          post.title?.toLowerCase().includes(search.toLowerCase());
    const matchesTag = selectedTag ? post.hashtags.includes(selectedTag) : true;
    return matchesSearch && matchesTag;
  });

  const handleOpenQuoteOriginal = (parentId) => {
    const originalPost = posts.find(p => p.id === parentId);
    if (originalPost) {
        setSelectedPost(originalPost);
    } else {
        alert('원본 게시글을 찾을 수 없습니다.');
    }
  };

  const hasImages = selectedPost && selectedPost.images && selectedPost.images.length > 0;

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%', py: 3 }}>
      <Box sx={{ display: 'flex', width: '100%', maxWidth: 1000, gap: 4 }}>
        
        {/* 중앙 피드 영역 */}
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
                 <CardHeader avatar={<Avatar>{post.authorName?.charAt(0)}</Avatar>} title={post.authorName} subheader={post.createdAt} />
                 
                 <ImageSlider images={post.images} height={400} onClick={() => setSelectedPost(post)} />

                 <CardContent sx={{ pt: 1, pb: 0 }}>
                    <Typography variant="h6">{post.title}</Typography>
                    <Typography variant="body2" sx={{ mb: 1, cursor: 'pointer' }} onClick={() => setSelectedPost(post)}>
                        {post.content.length > 50 ? post.content.substring(0, 50) + '...' : post.content}
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                        {post.hashtags.map(t => <Chip key={t} label={`#${t}`} size="small" variant="outlined" />)}
                    </Stack>

                    <QuoteBox parentPost={post.parentPost} onOpenOriginal={handleOpenQuoteOriginal} />
                </CardContent>

                 <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1, pb: 1, mt: 1 }}>
                   <Box>
                        <IconButton><FavoriteBorder sx={{ color: 'text.primary' }} /></IconButton>
                        <IconButton onClick={() => setSelectedPost(post)}><ChatBubbleOutline sx={{ color: 'text.primary' }} /></IconButton>
                        <IconButton onClick={() => setQuotePost(post)}><Repeat sx={{ color: 'text.primary' }} /></IconButton>
                        <IconButton><SendOutlined sx={{ color: 'text.primary' }} /></IconButton>
                    </Box>
                    <Box>
                        <IconButton><BookmarkBorder sx={{ color: 'text.primary' }} /></IconButton>
                    </Box>
                 </Box>
               </Card>
             ))}
             {displayCount < filteredPosts.length && (
               <Button fullWidth onClick={() => setDisplayCount(prev => prev + 5)} sx={{ mb: 5 }}>더보기</Button>
             )}
           </>}
        </Box>

        <Box sx={{ width: 320, display: { xs: 'none', md: 'block' } }}>
          {userInfo && (
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <Avatar sx={{ mr: 2 }}>{userInfo.nickname?.charAt(0)}</Avatar>
              <Typography fontWeight="bold">{userInfo.nickname}</Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* ✨ 3. 넓이와 높이를 넉넉하게 확대한 반응형 모달창 */}
      <Dialog 
        open={Boolean(selectedPost)} 
        onClose={() => setSelectedPost(null)} 
        maxWidth="md" // md 사이즈로 고정하여 넓게 사용 가능
        fullWidth 
        PaperProps={{ 
            sx: { 
                height: hasImages ? '80vh' : 'auto', 
                minHeight: hasImages ? 'auto' : '400px', // 텍스트만 있을 때도 400px의 최소 높이 보장
                maxHeight: '80vh', 
                maxWidth: hasImages ? 1000 : 600, // 사진이 없을 땐 600px로 넉넉하게
                m: 2, 
                borderRadius: 2 
            } 
        }}
      >
        {selectedPost && (
          <Box sx={{ display: 'flex', flexDirection: hasImages ? 'row' : 'column', height: '100%' }}>
            
            {hasImages && (
              <Box sx={{ flex: 1.5, position: 'relative' }}>
                <ImageSlider images={selectedPost.images} height="100%" />
              </Box>
            )}

            <Box sx={{ width: hasImages ? 350 : '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', height: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', p: 2, borderBottom: '1px solid #efefef' }}>
                <Avatar sx={{ width: 32, height: 32, mr: 1.5 }}>{selectedPost.authorName?.charAt(0)}</Avatar>
                <Typography variant="subtitle2" fontWeight="bold" sx={{ flexGrow: 1 }}>{selectedPost.authorName}</Typography>
                <IconButton size="small" onClick={() => setSelectedPost(null)}><Close /></IconButton>
              </Box>

              <Box sx={{ flex: 1, overflowY: 'auto', p: 2, '&::-webkit-scrollbar': { display: 'none' }, maxHeight: hasImages ? 'none' : '60vh' }}>
                <Box sx={{ display: 'flex', mb: 3 }}>
                  <Avatar sx={{ width: 32, height: 32, mr: 1.5 }}>{selectedPost.authorName?.charAt(0)}</Avatar>
                  <Box sx={{ width: '100%' }}>
                    <Typography variant="body2"><strong>{selectedPost.authorName}</strong> {selectedPost.content}</Typography>
                    <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>
                      {selectedPost.hashtags.map(t => <Typography key={t} variant="caption" color="primary">#{t} </Typography>)}
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{selectedPost.createdAt}</Typography>
                    
                    <QuoteBox parentPost={selectedPost.parentPost} onOpenOriginal={handleOpenQuoteOriginal} />
                  </Box>
                </Box>
              </Box>

              {/* 하단 액션바 및 댓글창이 항상 모달 바닥에 붙도록 marginTop: auto 활용 */}
              <Box sx={{ mt: 'auto' }}>
                <Box sx={{ borderTop: '1px solid #efefef', p: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Box>
                        <IconButton><FavoriteBorder sx={{ color: 'text.primary' }} /></IconButton>
                        <IconButton><ChatBubbleOutline sx={{ color: 'text.primary' }} /></IconButton>
                        <IconButton onClick={() => setQuotePost(selectedPost)}><Repeat sx={{ color: 'text.primary' }} /></IconButton>
                        <IconButton><SendOutlined sx={{ color: 'text.primary' }} /></IconButton>
                    </Box>
                    <IconButton><BookmarkBorder sx={{ color: 'text.primary' }} /></IconButton>
                    </Box>
                    <Typography variant="subtitle2" sx={{ px: 1, pb: 1 }}>좋아요 0개</Typography>
                </Box>

                <Box sx={{ borderTop: '1px solid #efefef', p: 1.5, display: 'flex', alignItems: 'center' }}>
                    <InputBase placeholder="댓글 달기..." fullWidth sx={{ ml: 1, fontSize: '0.9rem' }} />
                    <Button variant="text" size="small" sx={{ minWidth: 'auto', fontWeight: 'bold' }}>게시</Button>
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