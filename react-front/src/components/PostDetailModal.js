import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Avatar, Button, Stack, Dialog, InputBase, IconButton } from '@mui/material';
import { Close, NavigateBefore, NavigateNext, Favorite, FavoriteBorder, ChatBubbleOutline, SendOutlined, BookmarkBorder, Bookmark, Repeat } from '@mui/icons-material';
import { fetchWithAuth } from '../utils/api';

// 1. 하단 액션바 컴포넌트
export const ActionBar = ({ post, onLike, onQuoteClick, onScrap, onCommentClick }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1, py: 1 }}>
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <IconButton onClick={() => onLike(post.id, post.isLiked)} sx={{ p: 0.5 }}>
          {post.isLiked ? <Favorite sx={{ color: 'red' }} /> : <FavoriteBorder sx={{ color: 'text.primary' }} />}
        </IconButton>
        {post.likeCount > 0 && <Typography variant="body2" sx={{ ml: 0.5, fontWeight: 'bold' }}>{post.likeCount}</Typography>}
      </Box>
      
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <IconButton onClick={() => onCommentClick && onCommentClick()} sx={{ p: 0.5 }}>
          <ChatBubbleOutline sx={{ color: 'text.primary' }} />
        </IconButton>
        {post.commentCount > 0 && <Typography variant="body2" sx={{ ml: 0.5, fontWeight: 'bold' }}>{post.commentCount}</Typography>}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <IconButton onClick={() => onQuoteClick(post)} sx={{ p: 0.5 }}><Repeat sx={{ color: 'text.primary' }} /></IconButton>
        {post.quoteCount > 0 && <Typography variant="body2" sx={{ ml: 0.5, fontWeight: 'bold' }}>{post.quoteCount}</Typography>}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <IconButton sx={{ p: 0.5 }}><SendOutlined sx={{ color: 'text.primary' }} /></IconButton>
      </Box>
    </Box>
    <Box>
      <IconButton onClick={() => onScrap(post.id, post.isScrapped)} sx={{ p: 0.5 }}>
        {post.isScrapped ? <Bookmark sx={{ color: '#1976d2' }} /> : <BookmarkBorder sx={{ color: 'text.primary' }} />}
      </IconButton>
    </Box>
  </Box>
);

// 2. 이미지 슬라이더 컴포넌트
export const ImageSlider = ({ images, height }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  if (!images || images.length === 0) return null;
  const handlePrev = (e) => { e.stopPropagation(); setCurrentIndex(prev => prev === 0 ? images.length - 1 : prev - 1); };
  const handleNext = (e) => { e.stopPropagation(); setCurrentIndex(prev => prev === images.length - 1 ? 0 : prev + 1); };

  return (
    <Box sx={{ position: 'relative', width: '100%', height: height, bgcolor: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img src={images[currentIndex]} alt="post_image" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
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

// 3. 인용게시글 상자 컴포넌트
export const QuoteBox = ({ parentPost, onOpenOriginal, onNavigateProfile }) => {
  if (!parentPost) return null;
  return (
    <Box onClick={(e) => { if (onOpenOriginal) { e.stopPropagation(); onOpenOriginal(parentPost.id); } }} sx={{ mt: 2, p: 1.5, display: 'flex', alignItems: 'center', border: '1px solid #e0e0e0', borderRadius: 2, bgcolor: '#fafafa', cursor: onOpenOriginal ? 'pointer' : 'default', '&:hover': { bgcolor: onOpenOriginal ? '#f0f0f0' : '#fafafa' }, transition: '0.2s' }}>
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

// 4. 메인 상세보기 모달 컴포넌트
const PostDetailModal = ({ open, post, onClose, currentUser, onLike, onQuoteClick, onNavigateProfile, onOpenOriginal, onCommentCountChange, onScrap, autoFocusComment, onCommentClick }) => {
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editContent, setEditContent] = useState('');
  
  const commentInputRef = useRef(null);

  useEffect(() => {
    if (open && autoFocusComment) {
      const timer = setTimeout(() => {
        if (commentInputRef.current) commentInputRef.current.focus();
      }, 300); 
      return () => clearTimeout(timer);
    }
  }, [open, autoFocusComment, post]);

  useEffect(() => {
    if (post) fetchComments(post.id);
    else { setComments([]); setReplyTo(null); setEditingCommentId(null); }
  }, [post]);

  const fetchComments = async (postId) => {
    try {
      const response = await fetchWithAuth(`http://localhost:3010/api/posts/${postId}/comments`);
      const data = await response.json();
      if (data.result) setComments(data.comments);
    } catch (error) { console.error("댓글 로딩 실패:", error); }
  };

  const handleCommentSubmit = async () => {
    if (!commentInput.trim() || !post) return;
    const bodyData = { content: commentInput };
    if (replyTo) bodyData.parentCommentId = replyTo.id;

    try {
      await fetchWithAuth(`http://localhost:3010/api/posts/${post.id}/comment`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData)
      });
      setCommentInput('');
      setReplyTo(null);
      fetchComments(post.id);
      if (onCommentCountChange) onCommentCountChange(post.id, 1);
    } catch (error) { console.error(error); }
  };

  const handleCommentEditSubmit = async (commentId) => {
    if (!editContent.trim()) return;
    try {
      const res = await fetchWithAuth(`http://localhost:3010/api/posts/comments/${commentId}`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent })
      });
      const data = await res.json();
      if (data.result) { setEditingCommentId(null); fetchComments(post.id); }
      else { alert(data.message || '수정에 실패했습니다.'); }
    } catch (error) { console.error(error); }
  };

  const handleCommentDelete = async (commentId) => {
    if (!window.confirm('댓글을 정말 삭제하시겠습니까?')) return;
    try {
      const res = await fetchWithAuth(`http://localhost:3010/api/posts/comments/${commentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`서버 응답 오류: ${res.status}`);
      const text = await res.text(); 
      const data = text ? JSON.parse(text) : { result: true };
      if (data.result) { fetchComments(post.id); if (onCommentCountChange) onCommentCountChange(post.id, -1); }
      else { alert(data.message || '삭제에 실패했습니다.'); }
    } catch (error) { console.error(error); alert('오류가 발생했습니다.'); }
  };

  if (!post) return null;
  const hasImages = post.images && post.images.length > 0;
  const viewerName = currentUser?.nickname; 

  return (
    <Dialog 
        open={open} 
        onClose={onClose} 
        disableAutoFocus 
        maxWidth="lg" // ✨ lg로 변경
        fullWidth 
        PaperProps={{ sx: { height: '80vh', maxHeight: '80vh', maxWidth: hasImages ? 1200 : 800, m: 2, borderRadius: 2 } }} // ✨ maxWidth 로직 업데이트
    >
      <Box sx={{ display: 'flex', flexDirection: hasImages ? 'row' : 'column', height: '100%' }}>
        {hasImages && <Box sx={{ flex: 1.5, position: 'relative', bgcolor: 'black' }}><ImageSlider images={post.images} height="100%" /></Box>}

        <Box sx={{ width: hasImages ? 400 : '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', height: '100%' }}>
          
          <Box sx={{ display: 'flex', alignItems: 'center', p: 2, borderBottom: '1px solid #efefef' }}>
            <Avatar src={post.authorProfileImage || undefined} sx={{ width: 32, height: 32, mr: 1.5, cursor: 'pointer' }} onClick={(e) => { onClose(); onNavigateProfile(e, post.authorName); }}>
              {!post.authorProfileImage && post.authorName?.charAt(0)}
            </Avatar>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ flexGrow: 1, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }} onClick={(e) => { onClose(); onNavigateProfile(e, post.authorName); }}>{post.authorName}</Typography>
            <IconButton size="small" onClick={onClose}><Close /></IconButton>
          </Box>

          <Box sx={{ flex: 1, overflowY: 'auto', p: 2, '&::-webkit-scrollbar': { display: 'none' } }}>
            <Box sx={{ display: 'flex', mb: 3 }}>
              <Avatar src={post.authorProfileImage || undefined} sx={{ width: 32, height: 32, mr: 1.5, cursor: 'pointer' }} onClick={(e) => { onClose(); onNavigateProfile(e, post.authorName); }}>
                {!post.authorProfileImage && post.authorName?.charAt(0)}
              </Avatar>
              <Box sx={{ width: '100%' }}>
                <Typography variant="body2"><strong style={{ cursor: 'pointer' }} onClick={(e) => { onClose(); onNavigateProfile(e, post.authorName); }}>{post.authorName}</strong> {post.content}</Typography>
                {post.hashtags && post.hashtags.length > 0 && (
                  <Stack direction="row" spacing={0.5} sx={{ mt: 1 }}>{post.hashtags.map(t => <Typography key={t} variant="caption" color="primary">#{t} </Typography>)}</Stack>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{post.createdAt}</Typography>
                <QuoteBox parentPost={post.parentPost} onOpenOriginal={onOpenOriginal} onNavigateProfile={onNavigateProfile} />
              </Box>
            </Box>

            {comments.map((comment) => (
              <Box key={comment.id} sx={{ display: 'flex', mb: 2, alignItems: 'flex-start', ml: comment.parentCommentId ? 4 : 0 }}>
                <Avatar src={comment.authorProfileImage || undefined} sx={{ width: 24, height: 24, mr: 1, mt: 0.5, cursor: 'pointer' }} onClick={(e) => { onClose(); onNavigateProfile(e, comment.authorName); }}>
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
                      <Typography variant="body2"><strong style={{ cursor: 'pointer' }} onClick={(e) => { onClose(); onNavigateProfile(e, comment.authorName); }}>{comment.authorName}</strong> {comment.content}</Typography>
                      <Stack direction="row" spacing={1.5} sx={{ mt: 0.5, alignItems: 'center' }}>
                        <Typography variant="caption" color="text.secondary">{comment.createdAt}</Typography>
                        {!comment.parentCommentId && <Typography variant="caption" sx={{ cursor: 'pointer', color: 'text.secondary', fontWeight: 'bold' }} onClick={() => { setReplyTo(comment); setCommentInput(`@${comment.authorName} `); }}>답글 달기</Typography>}
                        {viewerName === comment.authorName && (
                          <>
                            <Typography variant="caption" sx={{ cursor: 'pointer', color: 'text.secondary' }} onClick={() => { setEditingCommentId(comment.id); setEditContent(comment.content); }}>수정</Typography>
                            <Typography variant="caption" sx={{ cursor: 'pointer', color: 'error.main' }} onClick={() => handleCommentDelete(comment.id)}>삭제</Typography>
                          </>
                        )}
                      </Stack>
                    </>
                  )}
                </Box>
              </Box>
            ))}
          </Box>

          <Box sx={{ mt: 'auto', borderTop: '1px solid #efefef' }}>
            <ActionBar post={post} onLike={onLike} onQuoteClick={onQuoteClick} onScrap={onScrap} onCommentClick={onCommentClick} />
            {replyTo && (
              <Box sx={{ px: 2, py: 1, bgcolor: '#f1f1f1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">@{replyTo.authorName} 님에게 답글 남기는 중...</Typography>
                <Close sx={{ fontSize: 14, cursor: 'pointer' }} onClick={() => { setReplyTo(null); setCommentInput(''); }} />
              </Box>
            )}
            <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center' }}>
              <InputBase inputRef={commentInputRef} placeholder={replyTo ? "답글 달기..." : "댓글 달기..."} fullWidth sx={{ ml: 1, fontSize: '0.9rem' }} value={commentInput} onChange={(e) => setCommentInput(e.target.value)} onKeyPress={(e) => { if(e.key === 'Enter') handleCommentSubmit(); }} />
              <Button onClick={handleCommentSubmit} disabled={!commentInput.trim()} variant="text" size="small" sx={{ minWidth: 'auto', fontWeight: 'bold' }}>게시</Button>
            </Box>
          </Box>
        </Box>
      </Box>
    </Dialog>
  );
};

export default PostDetailModal;