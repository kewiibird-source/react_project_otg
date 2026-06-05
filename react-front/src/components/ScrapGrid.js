import React, { useState, useEffect } from 'react';
import { Box, Typography, InputBase, Grid } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { fetchWithAuth } from '../utils/api';

// 왜(Why)?: 프로필 페이지의 '저장됨' 탭에서 렌더링될 전용 컴포넌트입니다.
// Client-side 필터링을 통해 서버 통신 없이 즉각적인 검색(MVP 최적화)을 지원합니다.
export const ScrapGrid = () => {
  const [scraps, setScraps] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const loadScraps = async () => {
      try {
        const res = await fetchWithAuth('http://localhost:3010/api/posts/scraps/my');
        const data = await res.json();
        if (data.result) setScraps(data.scraps);
      } catch (error) {
        console.error("보관함 로드 실패", error);
      }
    };
    loadScraps();
  }, []);

  // 검색어에 따른 프론트엔드 즉시 필터링
  const filteredScraps = scraps.filter(post => 
    post.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Box sx={{ width: '100%', mt: 2 }}>
      {/* 프론트엔드 검색 바 */}
      <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: '#f1f3f4', p: 1, borderRadius: 2, mb: 3 }}>
        <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />
        <InputBase 
          placeholder="보관함 검색 (제목)" 
          fullWidth 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </Box>

      {/* 스크랩 그리드 (제목이 포함된 중간 형태) */}
      <Grid container spacing={2}>
        {filteredScraps.map(post => (
          <Grid item xs={4} sm={3} key={post.id}>
            <Box sx={{ cursor: 'pointer', transition: '0.2s', '&:hover': { opacity: 0.8 } }}>
              {/* 정방형 이미지 비율 유지 */}
              <Box sx={{ position: 'relative', width: '100%', paddingTop: '100%', bgcolor: '#eee', borderRadius: 1, overflow: 'hidden' }}>
                {post.thumbnail && (
                  <img 
                    src={post.thumbnail} 
                    alt="scrap_thumb" 
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} 
                  />
                )}
              </Box>
              {/* 이미지 하단 제목 (1줄 넘어가면 말줄임표) */}
              <Typography variant="body2" fontWeight="bold" sx={{ mt: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {post.title}
              </Typography>
            </Box>
          </Grid>
        ))}
        {filteredScraps.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ width: '100%', textAlign: 'center', mt: 5 }}>
            보관된 게시물이 없습니다.
          </Typography>
        )}
      </Grid>
    </Box>
  );
};