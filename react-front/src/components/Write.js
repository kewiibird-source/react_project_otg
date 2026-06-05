import React, { useState } from 'react';
import { Box, Typography, TextField, Button, Stack, IconButton, Chip, Select, MenuItem, FormControl, InputLabel, Dialog } from '@mui/material';
import { PhotoCamera, Close, NavigateBefore, NavigateNext, Repeat, Delete } from '@mui/icons-material';

export const CATEGORY_LIST = [
    { value: 'MIXOLOGY', label: '나만의 레시피' },
    { value: 'FOOD', label: '안주 추천' },
    { value: 'PLACE', label: '술집 추천' }, 
    { value: 'DISCOUNT', label: '할인 정보' },
    { value: 'DAILY', label: '혼술 일상' }
];

function Write({ open, onClose, quoteData }) {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [category, setCategory] = useState(CATEGORY_LIST[0].value); 
    const [hashtagInput, setHashtagInput] = useState('');
    const [hashtags, setHashtags] = useState([]);
    const [files, setFiles] = useState([]); 
    const [previews, setPreviews] = useState([]); 
    const [previewIndex, setPreviewIndex] = useState(0);

    const handleHashtagKeyDown = (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            const tag = hashtagInput.trim();
            if (tag && !hashtags.includes(tag)) setHashtags([...hashtags, tag]);
            setHashtagInput(''); 
        }
    };

    const handleDeleteHashtag = (tag) => setHashtags(hashtags.filter(t => t !== tag));

    // ✨ 이미지 삭제 로직
    const handleRemoveImage = (index) => {
        const newFiles = files.filter((_, i) => i !== index);
        const newPreviews = previews.filter((_, i) => i !== index);
        setFiles(newFiles);
        setPreviews(newPreviews);
        // 인덱스 조정 (마지막 이미지를 지웠을 때 인덱스 감소)
        if (previewIndex >= newPreviews.length) setPreviewIndex(Math.max(0, newPreviews.length - 1));
    };

    const handleFileChange = (e) => {
        const selectedFiles = Array.from(e.target.files);
        if (files.length + selectedFiles.length > 5) return alert('이미지는 최대 5장까지 가능합니다.');
        const newPreviews = selectedFiles.map(file => URL.createObjectURL(file));
        setFiles(prev => [...prev, ...selectedFiles]);
        setPreviews(prev => [...prev, ...newPreviews]);
    };

    const handleClose = () => {
        setTitle(''); setContent(''); setHashtags([]); setFiles([]); setPreviews([]); setPreviewIndex(0);
        onClose();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title.trim() || !content.trim()) return alert('제목과 내용을 입력해주세요.');
        if (!quoteData && files.length === 0) return alert('최소 1장의 사진을 첨부해주세요.');

        const formData = new FormData();
        formData.append('title', title);
        formData.append('content', content);
        formData.append('category', category); 
        if (quoteData) formData.append('parentPostId', quoteData.id); 
        if (hashtags.length > 0) formData.append('hashtags', JSON.stringify(hashtags));
        for (let i = 0; i < files.length; i++) formData.append('images', files[i]);

        try {
            const token = localStorage.getItem('accessToken');
            const response = await fetch("http://localhost:3010/api/posts", {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` },
                body: formData
            });
            const data = await response.json();
            if (data.result) {
                alert('게시글이 성공적으로 등록되었습니다.');
                handleClose();
                window.location.reload(); 
            } else {
                alert(`등록 실패: ${data.message}`);
            }
        } catch (error) {
            alert('서버와 통신 중 문제가 발생했습니다.');
        }
    };

    return (
        <Dialog open={open} onClose={handleClose} fullWidth maxWidth="lg" PaperProps={{ sx: { height: '85vh', borderRadius: 2 } }}>
            <Box sx={{ p: 1.5, borderBottom: '1px solid #efefef', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <Typography variant="subtitle1" fontWeight="bold">
                    {quoteData ? '게시글 인용하기' : '새 게시물 만들기'}
                </Typography>
                <IconButton sx={{ position: 'absolute', right: 8 }} onClick={handleClose}><Close /></IconButton>
            </Box>

            <Box sx={{ display: 'flex', height: 'calc(100% - 53px)' }}>
                {/* 왼쪽: 이미지 영역 */}
                <Box sx={{ flex: 1.5, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', bgcolor: previews.length > 0 ? '#111' : '#f9f9f9', position: 'relative' }}>
                    {previews.length > 0 ? (
                        <>
                            <img src={previews[previewIndex]} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            
                            {/* ✨ 이미지 삭제 버튼 */}
                            <IconButton onClick={() => handleRemoveImage(previewIndex)} sx={{ position: 'absolute', top: 8, left: 8, bgcolor: 'rgba(255,0,0,0.6)', color: 'white', '&:hover': { bgcolor: 'red' } }}><Delete /></IconButton>
                            
                            {/* ✨ 이미지 추가 버튼 (슬라이더 위에 작게) */}
                            <Button component="label" sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}>
                                + 추가
                                <input accept="image/*" type="file" hidden multiple onChange={handleFileChange} />
                            </Button>

                            {previews.length > 1 && (
                                <>
                                    <IconButton onClick={() => setPreviewIndex(prev => prev === 0 ? previews.length - 1 : prev - 1)} sx={{ position: 'absolute', left: 8, top: '50%', bgcolor: 'rgba(255,255,255,0.5)', '&:hover': { bgcolor: 'white' } }}><NavigateBefore /></IconButton>
                                    <IconButton onClick={() => setPreviewIndex(prev => prev === previews.length - 1 ? 0 : prev + 1)} sx={{ position: 'absolute', right: 8, top: '50%', bgcolor: 'rgba(255,255,255,0.5)', '&:hover': { bgcolor: 'white' } }}><NavigateNext /></IconButton>
                                    <Box sx={{ position: 'absolute', bottom: 16, display: 'flex', gap: 1 }}>
                                        {previews.map((_, idx) => <Box key={idx} sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: idx === previewIndex ? '#1976d2' : 'rgba(255,255,255,0.5)' }} />)}
                                    </Box>
                                </>
                            )}
                        </>
                    ) : (
                        <Box sx={{ textAlign: 'center' }}>
                            <PhotoCamera sx={{ fontSize: 80, color: 'text.secondary', mb: 2 }} />
                            <Typography variant="h6" sx={{ mb: 3 }}>사진을 추가해보세요</Typography>
                            <Button variant="contained" component="label" sx={{ borderRadius: 2 }}>
                                컴퓨터에서 선택
                                <input accept="image/*" type="file" hidden multiple onChange={handleFileChange} />
                            </Button>
                        </Box>
                    )}
                </Box>

                {/* 오른쪽: 입력 영역 */}
                <Box sx={{ width: 400, display: 'flex', flexDirection: 'column', p: 3, borderLeft: '1px solid #efefef' }}>
                    <Box sx={{ flex: 1, overflowY: 'auto' }}>
                        {quoteData && (
                            <Box sx={{ p: 1.5, mb: 3, bgcolor: '#f0f2f5', borderRadius: 2 }}>
                                <Typography variant="caption" fontWeight="bold">원본 게시글</Typography>
                                <Typography variant="body2" noWrap>{quoteData.title}</Typography>
                            </Box>
                        )}
                        <Stack spacing={2}>
                            <FormControl fullWidth size="small"><InputLabel>카테고리</InputLabel><Select value={category} label="카테고리" onChange={(e) => setCategory(e.target.value)}>{CATEGORY_LIST.map((cat) => <MenuItem key={cat.value} value={cat.value}>{cat.label}</MenuItem>)}</Select></FormControl>
                            <TextField label="제목" variant="outlined" fullWidth required value={title} onChange={(e) => setTitle(e.target.value)} />
                            <TextField label="해시태그" variant="outlined" fullWidth size="small" value={hashtagInput} onChange={(e) => setHashtagInput(e.target.value)} onKeyDown={handleHashtagKeyDown} />
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{hashtags.map((tag, idx) => <Chip key={idx} label={tag} size="small" onDelete={() => handleDeleteHashtag(tag)} />)}</Box>
                            <TextField placeholder="내용을 입력하세요..." variant="outlined" fullWidth multiline rows={10} required value={content} onChange={(e) => setContent(e.target.value)} />
                        </Stack>
                    </Box>
                    <Button fullWidth variant="contained" onClick={handleSubmit} sx={{ mt: 2, py: 1.5, fontWeight: 'bold' }}>공유하기</Button>
                </Box>
            </Box>
        </Dialog>
    );
}

export default Write;