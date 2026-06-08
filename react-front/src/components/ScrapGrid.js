import React, { useState, useEffect } from 'react';
import { Box, InputBase, Grid, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { fetchWithAuth } from '../utils/api';

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

  // 해시태그 기반 검색 (제목 검색 기능 제거)
  const filteredScraps = scraps.filter(post => 
    post.hashtags && post.hashtags.some(tag => 
      tag.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  return (
    <Box sx={{ width: '100%', mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: '#f1f3f4', p: 1, borderRadius: 2, mb: 3 }}>
        <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />
        <InputBase 
          placeholder="보관함 검색 (해시태그)" 
          fullWidth 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </Box>

      <Grid container spacing={2}>
        {filteredScraps.map(post => (
          <Grid item xs={4} sm={3} key={post.id}>
            <Box sx={{ cursor: 'pointer', transition: '0.2s', '&:hover': { opacity: 0.8 } }}>
              <Box sx={{ position: 'relative', width: '100%', paddingTop: '100%', bgcolor: '#eee', borderRadius: 1, overflow: 'hidden' }}>
                {post.thumbnail && (
                  <img 
                    src={post.thumbnail} 
                    alt="scrap_thumb" 
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} 
                  />
                )}
              </Box>
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