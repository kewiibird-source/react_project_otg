import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, Avatar, Button, Stack, Dialog, InputBase, IconButton } from '@mui/material';
import { Close, NavigateBefore, NavigateNext, Favorite, FavoriteBorder, ChatBubbleOutline, SendOutlined, BookmarkBorder, Bookmark, Repeat } from '@mui/icons-material';
import { fetchWithAuth } from '../utils/api';

const renderContentWithLinks = (text, onNavigateProfile, onClose) => {
  if (!text) return null;
  const combinedRegex = /(https?:\/\/[^\s]+)|(@[a-zA-Z0-9가-힣_]+)/g;
  return text.split(combinedRegex).map((part, index) => {
    if (!part) return null;
    if (part.match(/^https?:\/\//)) {
      return (
        <a key={index} href={part} target="_blank" rel="noopener noreferrer"
          style={{ color: '#1976d2', textDecoration: 'underline', wordBreak: 'break-all' }}
          onClick={(e) => e.stopPropagation()}>
          {part}
        </a>
      );
    }
    if (part.match(/^@/)) {
      const nickname = part.slice(1);
      return (
        <span key={index}
          onClick={(e) => { e.stopPropagation(); if (onClose) onClose(); if (onNavigateProfile) onNavigateProfile(e, nickname); }}
          style={{ color: '#1976d2', fontWeight: 'bold', cursor: 'pointer' }}>
          {part}
        </span>
      );
    }
    return part;
  });
};

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
      {/* <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <IconButton sx={{ p: 0.5 }}><SendOutlined sx={{ color: 'text.primary' }} /></IconButton>
      </Box> */}
    </Box>
    <Box>
      <IconButton onClick={() => onScrap(post.id, post.isScrapped)} sx={{ p: 0.5 }}>
        {post.isScrapped ? <Bookmark sx={{ color: '#1976d2' }} /> : <BookmarkBorder sx={{ color: 'text.primary' }} />}
      </IconButton>
    </Box>
  </Box>
);

export const ImageSlider = ({ images, height }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  if (!images || images.length === 0) return null;
  const handlePrev = (e) => { e.stopPropagation(); setCurrentIndex(prev => prev === 0 ? images.length - 1 : prev - 1); };
  const handleNext = (e) => { e.stopPropagation(); setCurrentIndex(prev => prev === images.length - 1 ? 0 : prev + 1); };
  return (
    <Box sx={{ position: 'relative', width: '100%', height: height, bgcolor: 'black', overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', height: '100%', transform: `translateX(-${currentIndex * 100}%)`, transition: 'transform 0.4s ease-in-out' }}>
        {images.map((imgSrc, idx) => (
          <Box key={idx} sx={{ minWidth: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={imgSrc} alt={`post_image_${idx}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </Box>
        ))}
      </Box>
      {images.length > 1 && (
        <>
          <IconButton onClick={handlePrev} sx={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: 8, bgcolor: 'rgba(255,255,255,0.6)', '&:hover': { bgcolor: 'white' } }}><NavigateBefore /></IconButton>
          <IconButton onClick={handleNext} sx={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: 8, bgcolor: 'rgba(255,255,255,0.6)', '&:hover': { bgcolor: 'white' } }}><NavigateNext /></IconButton>
        </>
      )}
      {images.length > 1 && (
        <Box sx={{ position: 'absolute', bottom: 8, width: '100%', display: 'flex', justifyContent: 'center', gap: 0.5 }}>
          {images.map((_, idx) => (
            <Box 
              key={idx} 
              onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); }}  // ← 추가
              sx={{ 
                width: 6, height: 6, borderRadius: '50%', cursor: 'pointer',  // ← cursor 추가
                bgcolor: idx === currentIndex ? 'white' : 'rgba(255,255,255,0.5)' 
              }} 
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

export const QuoteBox = ({ parentPost, onOpenOriginal, onNavigateProfile }) => {
  if (!parentPost) return null;
  return (
    <Box onClick={(e) => { if (onOpenOriginal) { e.stopPropagation(); onOpenOriginal(parentPost.id); } }} sx={{ mt: 2, p: 1.5, display: 'flex', alignItems: 'center', border: '1px solid #e0e0e0', borderRadius: 2, bgcolor: '#fafafa', cursor: onOpenOriginal ? 'pointer' : 'default' }}>
      {parentPost.imageUrl && <Avatar variant="rounded" src={parentPost.imageUrl} sx={{ width: 70, height: 70, mr: 1.5 }} />}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" fontWeight="bold" onClick={(e) => onNavigateProfile(e, parentPost.authorName)}>@{parentPost.authorName}</Typography>
      </Box>
    </Box>
  );
};

const PostDetailModal = ({ open, post, onClose, currentUser, onLike, onQuoteClick, onNavigateProfile, onOpenOriginal, onCommentCountChange, onScrap, autoFocusComment, onCommentClick }) => {
  const [comments, setComments] = useState([]);
  const [commentInput, setCommentInput] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editContent, setEditContent] = useState('');

  const handleCommentEditSubmit = async (commentId) => {
    if (!editContent.trim()) return;
    await fetchWithAuth(`http://localhost:3010/api/posts/comments/${commentId}`, {
      method: 'PUT',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editContent })
    });
    setEditingCommentId(null);
    setEditContent('');
    fetchComments(post.id);
  };

  const [isEditingPost, setIsEditingPost] = useState(false); 
  const [editPostData, setEditPostData] = useState({ title: '', content: '', category: '' });
  const [displayContent, setDisplayContent] = useState('');
  const commentInputRef = useRef(null);

  // 데이터 로딩 및 상태 동기화
  useEffect(() => {
    if (post) {
      setDisplayContent(post.content);
      fetchComments(post.id);
    }
  }, [post]);

  const startEditPost = () => {
    setEditPostData({ title: post.title, content: post.content, category: post.category });
    setIsEditingPost(true);
  };

  const handleUpdatePost = async () => {
    try {
      const res = await fetchWithAuth(`http://localhost:3010/api/posts/${post.id}`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editPostData)
      });
      if ((await res.json()).result) {
        setDisplayContent(editPostData.content);
        setIsEditingPost(false); 
      }
    } catch (error) { console.error("수정 실패:", error); }
  };

  const handleDeletePost = async () => {
    if (!window.confirm('삭제하시겠습니까?')) return;
    try {
      const res = await fetchWithAuth(`http://localhost:3010/api/posts/${post.id}`, { method: 'DELETE' });
      if ((await res.json()).result) { onClose(); window.location.reload(); }
    } catch (error) { console.error("삭제 실패:", error); }
  };

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
    await fetchWithAuth(`http://localhost:3010/api/posts/${post.id}/comment`, {
      method: 'POST', headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyData)
    });
    setCommentInput(''); setReplyTo(null); fetchComments(post.id);
    if (onCommentCountChange) onCommentCountChange(post.id, 1);
  };

  const handleCommentDelete = async (commentId) => {
    if (!window.confirm('삭제하시겠습니까?')) return;
    await fetchWithAuth(`http://localhost:3010/api/posts/comments/${commentId}`, { method: 'DELETE' });
    fetchComments(post.id); if (onCommentCountChange) onCommentCountChange(post.id, -1);
  };

  if (!post) return null;
  const isOwner = currentUser?.nickname === post?.authorName;
  const hasImages = post.images && post.images.length > 0;
  const viewerName = currentUser?.nickname;

  return (
    <Dialog open={open} onClose={onClose} disableAutoFocus maxWidth="lg" fullWidth PaperProps={{ sx: { height: '80vh', maxHeight: '80vh', maxWidth: hasImages ? 1200 : 800, m: 2, borderRadius: 2 }}}>
      <Box sx={{ display: 'flex', flexDirection: hasImages ? 'row' : 'column', height: '100%' }}>
        {hasImages && <Box sx={{ flex: 1.5, position: 'relative', bgcolor: 'black' }}><ImageSlider images={post.images} height="100%" /></Box>}

        <Box sx={{ width: hasImages ? 400 : '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', height: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', p: 2, borderBottom: '1px solid #efefef' }}>
            <Avatar src={post.authorProfileImage || undefined} sx={{ width: 32, height: 32, mr: 1.5, cursor: 'pointer' }} onClick={(e) => { onClose(); onNavigateProfile(e, post.authorName); }}>
              {!post.authorProfileImage && post.authorName?.charAt(0)}
            </Avatar>
            <Typography variant="subtitle2" fontWeight="bold" sx={{ flexGrow: 1, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }} onClick={(e) => { onClose(); onNavigateProfile(e, post.authorName); }}>{post.authorName}</Typography>
            {viewerName === post.authorName && !isEditingPost && (
              <>
                <Button size="small" onClick={startEditPost} sx={{ color: 'text.secondary', whiteSpace: 'nowrap', flexShrink: 0 }}>수정</Button>
                <Button size="small" onClick={handleDeletePost} sx={{ color: 'error.main', whiteSpace: 'nowrap', flexShrink: 0 }}>삭제</Button>
              </>
            )}
            <IconButton size="small" onClick={onClose}><Close /></IconButton>
          </Box>

          <Box sx={{ flex: 1, overflowY: 'auto', p: 2, '&::-webkit-scrollbar': { display: 'none' } }}>
            <Box sx={{ display: 'flex', mb: 3 }}>
              <Avatar src={post.authorProfileImage || undefined} sx={{ width: 32, height: 32, mr: 1.5, cursor: 'pointer' }} onClick={(e) => { onClose(); onNavigateProfile(e, post.authorName); }}>
                {!post.authorProfileImage && post.authorName?.charAt(0)}
              </Avatar>
              <Box sx={{ width: '100%' }}>
                {isEditingPost ? (
                    <Box sx={{ mt: 1, width: '100%' }}>
                      <InputBase 
                        fullWidth multiline minRows={3}
                        value={editPostData.content} 
                        onChange={(e) => setEditPostData({...editPostData, content: e.target.value})}
                        sx={{ border: '1px solid #ddd', p: 1, borderRadius: 1, mb: 1, fontSize: '0.875rem' }}
                        autoFocus
                      />
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button variant="contained" size="small" onClick={handleUpdatePost} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>완료</Button>
                        <Button variant="outlined" size="small" onClick={() => setIsEditingPost(false)} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>취소</Button>
                      </Box>
                    </Box>
                  ) : (
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" sx={{ mb: 0.5 }}>
                        <strong style={{ cursor: 'pointer' }} onClick={(e) => { onClose(); onNavigateProfile(e, post.authorName); }}>{post.authorName}</strong>
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {renderContentWithLinks(displayContent, onNavigateProfile, onClose)}
                      </Typography>
                    </Box>
                  )}
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
                    <Button size="small" onClick={() => handleCommentEditSubmit(comment.id)} sx={{ minWidth: 'auto', p: 0, whiteSpace: 'nowrap', flexShrink: 0 }}>완료</Button>                    
                    <Button size="small" onClick={() => setEditingCommentId(null)} sx={{ minWidth: 'auto', p: 0, color: 'text.secondary', whiteSpace: 'nowrap', flexShrink: 0 }}>취소</Button>
                  </Box>
                  ) : (
                    <>
                      <Typography variant="body2"><strong style={{ cursor: 'pointer' }} onClick={(e) => { onClose(); onNavigateProfile(e, comment.authorName); }}>{comment.authorName}</strong> {renderContentWithLinks(comment.content, onNavigateProfile, onClose)}</Typography>
                      <Stack direction="row" spacing={1.5} sx={{ mt: 0.5, alignItems: 'center' }}>
                        <Typography variant="caption" color="text.secondary">{comment.createdAt}</Typography>
                        <Typography variant="caption" sx={{ cursor: 'pointer', color: 'text.secondary', fontWeight: 'bold' }} 
                          onClick={() => {
                            // 이미 답글(대댓글)이면 원댓글 ID를 부모로 사용 → 인스타그램식 flat 구조 유지
                            const replyTarget = {
                              ...comment,
                              id: comment.parentCommentId || comment.id
                            };
                            setReplyTo(replyTarget);
                            setCommentInput(`@${comment.authorName} `);
                          }}>
                          답글 달기
                        </Typography>
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
              <Button onClick={handleCommentSubmit} disabled={!commentInput.trim()} variant="text" size="small" sx={{ minWidth: 'auto', fontWeight: 'bold', whiteSpace: 'nowrap', flexShrink: 0 }}>게시</Button>
            </Box>
          </Box>
        </Box>
      </Box>
    </Dialog>
  );
};

export default PostDetailModal;