import React, { useState } from 'react';
import { Box, Typography, TextField, Button, Stack, IconButton, Chip, Select, MenuItem, FormControl, InputLabel, Dialog, Divider } from '@mui/material';
import { PhotoCamera, Close, NavigateBefore, NavigateNext, Repeat } from '@mui/icons-material';

export const CATEGORY_LIST = [
    { value: 'MIXOLOGY', label: '나만의 레시피' },
    { value: 'FOOD', label: '안주 추천' },
    { value: 'DISCOUNT', label: '할인 정보' },
    { value: 'ETC', label: '혼술 일상' }
];

// ✨ quoteData: Home.js에서 넘겨주는 원본 글 데이터
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
        // 인용 글이 아닐 때만 사진 필수 검사 (인용 글은 사진 없이 의견만 쓸 수도 있으니까요!)
        if (!quoteData && files.length === 0) return alert('최소 1장의 사진을 첨부해주세요.');

        const formData = new FormData();
        formData.append('title', title);
        formData.append('content', content);
        formData.append('category', category); 
        // ✨ 인용 데이터가 있다면 백엔드로 ID 전송
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
        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth PaperProps={{ sx: { height: '80vh', maxWidth: 1000, borderRadius: 2 } }}>
            <Box sx={{ p: 1.5, borderBottom: '1px solid #efefef', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <Typography variant="subtitle1" fontWeight="bold">
                    {quoteData ? '게시글 인용하기' : '새 게시물 만들기'}
                </Typography>
                <IconButton sx={{ position: 'absolute', right: 8 }} onClick={handleClose}><Close /></IconButton>
            </Box>

            <Box sx={{ display: 'flex', height: 'calc(100% - 53px)' }}>
                <Box sx={{ flex: 1.5, borderRight: '1px solid #efefef', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', bgcolor: previews.length > 0 ? 'black' : '#fafafa', position: 'relative' }}>
                    {previews.length > 0 ? (
                        <>
                            <img src={previews[previewIndex]} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            {previews.length > 1 && (
                                <>
                                    <IconButton onClick={() => setPreviewIndex(prev => prev === 0 ? previews.length - 1 : prev - 1)} sx={{ position: 'absolute', left: 8, bgcolor: 'rgba(255,255,255,0.5)', '&:hover': { bgcolor: 'white' } }}><NavigateBefore /></IconButton>
                                    <IconButton onClick={() => setPreviewIndex(prev => prev === previews.length - 1 ? 0 : prev + 1)} sx={{ position: 'absolute', right: 8, bgcolor: 'rgba(255,255,255,0.5)', '&:hover': { bgcolor: 'white' } }}><NavigateNext /></IconButton>
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

                <Box sx={{ width: 350, display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ p: 2, flex: 1, overflowY: 'auto' }}>
                        {/* ✨ 인용하는 원본 글 미리보기 박스 */}
                        {quoteData && (
                            <Box sx={{ p: 1.5, mb: 3, bgcolor: '#f0f2f5', borderRadius: 2, border: '1px solid #e4e6e8' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                                    <Repeat fontSize="small" sx={{ color: 'text.secondary', mr: 0.5 }} />
                                    <Typography variant="caption" color="text.secondary" fontWeight="bold">원본 게시글</Typography>
                                </Box>
                                <Typography variant="subtitle2" fontWeight="bold">@{quoteData.authorName}</Typography>
                                <Typography variant="body2" color="text.secondary" noWrap>{quoteData.title}</Typography>
                            </Box>
                        )}

                        <Stack spacing={3}>
                            <FormControl fullWidth size="small">
                                <InputLabel>카테고리</InputLabel>
                                <Select value={category} label="카테고리" onChange={(e) => setCategory(e.target.value)}>
                                    {CATEGORY_LIST.map((cat) => <MenuItem key={cat.value} value={cat.value}>{cat.label}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <TextField label="제목" variant="standard" fullWidth required value={title} onChange={(e) => setTitle(e.target.value)} />
                            <Box>
                                <TextField label="해시태그 (스페이스바로 구분)" variant="standard" fullWidth size="small" value={hashtagInput} onChange={(e) => setHashtagInput(e.target.value)} onKeyDown={handleHashtagKeyDown} />
                                <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                    {hashtags.map((tag, index) => <Chip key={index} label={tag} size="small" onDelete={() => handleDeleteHashtag(tag)} />)}
                                </Box>
                            </Box>
                            <TextField placeholder="이 레시피에 대해 어떻게 생각하시나요?" variant="standard" fullWidth multiline rows={8} required value={content} onChange={(e) => setContent(e.target.value)} InputProps={{ disableUnderline: true }} sx={{ mt: 2 }} />
                        </Stack>
                    </Box>
                    <Box sx={{ p: 2, borderTop: '1px solid #efefef' }}>
                        <Button fullWidth variant="contained" onClick={handleSubmit} sx={{ py: 1.5, fontWeight: 'bold' }}>공유하기</Button>
                    </Box>
                </Box>
            </Box>
        </Dialog>
    );
}

export default Write;