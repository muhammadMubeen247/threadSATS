import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, MoreVertical, Trash2, Heart, MessageCircle } from 'lucide-react';
import InfiniteScroll from 'react-infinite-scroll-component';
import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import SuggestedUsers from '@/components/layout/SuggestedUsers';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import useAuthStore from '@/store/authStore';
import api from '@/api/axios';
import { formatDistanceToNow } from 'date-fns';

export default function ThreadDetail() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  
  const [thread, setThread] = useState(null);
  const [comments, setComments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Pagination for top-level comments
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalComments, setTotalComments] = useState(0);
  
  // Reply state - now includes parent tracking
  const [replyingTo, setReplyingTo] = useState(null); // { commentId, parentCommentId }
  const [replyText, setReplyText] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  
  // Loaded replies cache (per comment)
  const [loadedReplies, setLoadedReplies] = useState({});
  const [replyPages, setReplyPages] = useState({});
  const [hasMoreReplies, setHasMoreReplies] = useState({});
  const [loadingReplies, setLoadingReplies] = useState({});
  const [expandedComments, setExpandedComments] = useState({});

  // Initial load
  useEffect(() => {
    fetchThreadAndInitialComments();
  }, [threadId]);

  const fetchThreadAndInitialComments = async () => {
    setIsLoading(true);
    try {
      // Fetch thread details
      const threadResponse = await api.get(`/threads/${threadId}`);
      setThread(threadResponse.thread);
      
      // Fetch first page of comments
      const commentsResponse = await api.get(`/threads/${threadId}/comments?page=1&limit=20`);
      
      setComments(commentsResponse.comments || []);
      setTotalComments(commentsResponse.total || 0);
      setHasMore(commentsResponse.page < commentsResponse.pages);
      setPage(2); // Next page to load
      
    } catch (error) {
      console.error('Failed to fetch thread:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load more top-level comments (infinite scroll)
  const loadMoreComments = async () => {
    if (!hasMore || isLoading) return;

    try {
      const response = await api.get(`/threads/${threadId}/comments?page=${page}&limit=20`);
      
      setComments(prev => [...prev, ...(response.comments || [])]);
      setHasMore(response.page < response.pages);
      setPage(prev => prev + 1);
      
    } catch (error) {
      console.error('Failed to load more comments:', error);
    }
  };

  // Load replies for a specific comment
  const loadReplies = async (commentId) => {
    const currentPage = replyPages[commentId] || 1;
    
    setLoadingReplies(prev => ({ ...prev, [commentId]: true }));
    
    try {
      const response = await api.get(`/comments/${commentId}/replies?page=${currentPage}&limit=10`);
      
      // Append to existing loaded replies (CACHE)
      setLoadedReplies(prev => ({
        ...prev,
        [commentId]: [...(prev[commentId] || []), ...(response.replies || [])]
      }));
      
      setReplyPages(prev => ({
        ...prev,
        [commentId]: currentPage + 1
      }));
      
      setHasMoreReplies(prev => ({
        ...prev,
        [commentId]: response.hasMore
      }));
      
      // Mark as expanded
      setExpandedComments(prev => ({ ...prev, [commentId]: true }));
      
    } catch (error) {
      console.error('Failed to load replies:', error);
    } finally {
      setLoadingReplies(prev => ({ ...prev, [commentId]: false }));
    }
  };

  // Toggle expand/collapse replies
  const toggleReplies = (commentId) => {
    setExpandedComments(prev => ({
      ...prev,
      [commentId]: !prev[commentId]
    }));
  };

  // Create top-level comment
  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    
    if (!commentText.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await api.post(`/threads/${threadId}/comments`, {
        content: commentText.trim(),
      });

      if (response.success) {
        // Add new comment to top of list
        setComments(prev => [response.comment, ...prev]);
        setCommentText('');
        setTotalComments(prev => prev + 1);
        
        // Update thread comment count
        setThread(prev => ({
          ...prev,
          commentCount: (prev.commentCount || 0) + 1
        }));
      }
    } catch (error) {
      console.error('Failed to post comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Recursive function to add reply to nested structure in loadedReplies
  const addReplyToLoadedReplies = (replies, targetCommentId, newReply) => {
    return replies.map(reply => {
      const replyId = reply._id || reply.id;
      
      if (replyId === targetCommentId) {
        // Found the target - add to its replies (create array if doesn't exist)
        return {
          ...reply,
          replies: [newReply, ...(reply.replies || [])],
          replyCount: (reply.replyCount || 0) + 1
        };
      }
      
      // Check nested replies recursively
      if (reply.replies && reply.replies.length > 0) {
        return {
          ...reply,
          replies: addReplyToLoadedReplies(reply.replies, targetCommentId, newReply)
        };
      }
      
      return reply;
    });
  };

  // Reply to a comment (handles both top-level and nested)
  const handleReplySubmit = async (commentId, parentCommentId) => {
    if (!replyText.trim()) return;

    setIsSubmittingReply(true);
    try {
      const response = await api.post(`/comments/${commentId}/reply`, {
        content: replyText.trim(),
      });

      if (response.success) {
        const newReply = response.comment;
        
        // If replying to a top-level comment, add to its loadedReplies
        if (!parentCommentId || parentCommentId === commentId) {
          setLoadedReplies(prev => ({
            ...prev,
            [commentId]: [newReply, ...(prev[commentId] || [])]
          }));
          
          // Update reply count in top-level comments
          setComments(prev => prev.map(c => {
            if ((c._id || c.id) === commentId) {
              return { ...c, replyCount: (c.replyCount || 0) + 1 };
            }
            return c;
          }));
        } else {
          // Replying to a nested reply - need to update within the parent's loaded replies
          setLoadedReplies(prev => ({
            ...prev,
            [parentCommentId]: addReplyToLoadedReplies(prev[parentCommentId] || [], commentId, newReply)
          }));
        }
        
        setReplyText('');
        setReplyingTo(null);
        
        // Ensure parent comment is expanded
        setExpandedComments(prev => ({ ...prev, [parentCommentId || commentId]: true }));
      }
    } catch (error) {
      console.error('Failed to post reply:', error);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // Recursive function to update like status
  const updateLikeInReplies = (replies, targetId, isLiked, likesCount) => {
    return replies.map(reply => {
      const replyId = reply._id || reply.id;
      
      if (replyId === targetId) {
        return { ...reply, isLiked, likesCount };
      }
      
      if (reply.replies && reply.replies.length > 0) {
        return {
          ...reply,
          replies: updateLikeInReplies(reply.replies, targetId, isLiked, likesCount)
        };
      }
      
      return reply;
    });
  };

  // Toggle like on comment/reply
  const handleLikeComment = async (commentId) => {
    try {
      // Optimistic update
      const updateComment = (c) => {
        const id = c._id || c.id;
        if (id === commentId) {
          return {
            ...c,
            isLiked: !c.isLiked,
            likesCount: (c.likesCount || 0) + (c.isLiked ? -1 : 1)
          };
        }
        return c;
      };

      // Update in comments list
      setComments(prev => prev.map(updateComment));
      
      // Update in loaded replies recursively
      setLoadedReplies(prev => {
        const newReplies = {};
        Object.keys(prev).forEach(key => {
          const comment = prev[key];
          const updated = comment.map(updateComment);
          // Also update nested replies
          newReplies[key] = updated.map(r => {
            if (r.replies && r.replies.length > 0) {
              return {
                ...r,
                replies: updateLikeInReplies(r.replies, commentId, !r.isLiked, (r.likesCount || 0) + (r.isLiked ? -1 : 1))
              };
            }
            return r;
          });
        });
        return newReplies;
      });

      // Send to backend
      const response = await api.put(`/comments/${commentId}/like`);
      
      if (response.success) {
        // Backend confirmed - could sync here if needed
      }
      
    } catch (error) {
      console.error('Failed to like comment:', error);
      // Revert optimistic update on error
      fetchThreadAndInitialComments();
    }
  };

  // Recursive delete helper
  const deleteFromReplies = (replies, targetId) => {
    return replies
      .filter(reply => (reply._id || reply.id) !== targetId)
      .map(reply => {
        if (reply.replies && reply.replies.length > 0) {
          return {
            ...reply,
            replies: deleteFromReplies(reply.replies, targetId)
          };
        }
        return reply;
      });
  };

  // Delete comment
  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) return;

    try {
      await api.delete(`/comments/${commentId}`);
      
      // Remove from comments list
      setComments(prev => prev.filter(c => (c._id || c.id) !== commentId));
      
      // Remove from loaded replies recursively
      setLoadedReplies(prev => {
        const newReplies = {};
        Object.keys(prev).forEach(key => {
          newReplies[key] = deleteFromReplies(prev[key], commentId);
        });
        return newReplies;
      });
      
      setTotalComments(prev => Math.max(0, prev - 1));
      
      // Update thread comment count
      setThread(prev => ({
        ...prev,
        commentCount: Math.max(0, (prev.commentCount || 0) - 1)
      }));
      
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  };

  const getInitials = (username) => {
    return username?.substring(0, 2).toUpperCase() || 'A';
  };

  const getTimeAgo = (date) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch {
      return 'Just now';
    }
  };

  // Component for rendering a single comment
  const CommentItem = ({ comment, depth = 0, parentCommentId = null }) => {
    // Safety check
    if (!comment) return null;
    
    const commentId = comment._id || comment.id;
    const isCommentOwner = user?._id === (comment.author?._id || comment.author?.id);
    
    // Determine the root parent for this comment/reply
    const rootParentId = depth === 0 ? commentId : parentCommentId;
    
    const isExpanded = expandedComments[commentId];
    const replies = loadedReplies[commentId] || [];
    const previewReplies = comment.previewReplies || [];
    const hasLoadedReplies = replies.length > 0;
    const isLoadingReplies = loadingReplies[commentId];

    // Calculate hidden replies count
    const totalReplies = comment.replyCount || 0;
    const visibleRepliesCount = isExpanded 
      ? replies.length + previewReplies.length 
      : previewReplies.length;
    const hiddenRepliesCount = Math.max(0, totalReplies - visibleRepliesCount);

    return (
      <div className="relative">
        {/* Thread Line */}
        {depth > 0 && (
          <div className="absolute left-5 top-0 w-0.5 h-full bg-border -ml-0.5" />
        )}
        
        <div className={`flex gap-3 ${depth > 0 ? 'pl-12' : ''}`}>
          {/* Avatar */}
          <div className="relative z-10 flex-shrink-0">
            <Avatar className="h-10 w-10 border-2 border-background">
              <AvatarImage
                src={comment.isAnonymous ? '' : comment.author?.profilePic}
                alt={comment.isAnonymous ? 'Anonymous' : comment.author?.username}
              />
              <AvatarFallback>
                {comment.isAnonymous ? 'A' : getInitials(comment.author?.username)}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Content */}
          <div className="flex-1 pb-3">
            <div className="bg-muted/30 rounded-lg p-3">
              <div className="flex items-start justify-between mb-1">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">
                      {comment.isAnonymous ? 'Anonymous' : `@${comment.author?.username}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {getTimeAgo(comment.createdAt)}
                    </span>
                  </div>
                  {!comment.isAnonymous && comment.author?.department && (
                    <span className="text-xs text-muted-foreground">
                      {comment.author.department}
                    </span>
                  )}
                </div>
                
                {isCommentOwner && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 -mt-1">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        onClick={() => handleDeleteComment(commentId)}
                        className="text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              
              <p className="text-sm leading-relaxed">{comment.content}</p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-4 mt-2 ml-1">
              {/* Like Button */}
              <button
                onClick={() => handleLikeComment(commentId)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-500 transition-colors group"
              >
                <Heart
                  className={`h-4 w-4 ${
                    comment.isLiked ? 'fill-red-500 text-red-500' : ''
                  } group-hover:scale-110 transition-transform`}
                />
                <span>{comment.likesCount || 0}</span>
              </button>

              {/* Reply Button */}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                onClick={() => {
                  setReplyingTo({ commentId, parentCommentId: rootParentId });
                  setReplyText('');
                }}
              >
                <MessageCircle className="h-4 w-4" />
                Reply
              </Button>
            </div>

            {/* Reply Input */}
            {replyingTo?.commentId === commentId && (
              <div className="mt-3 flex gap-2">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src={user?.profilePic} alt={user?.username} />
                  <AvatarFallback>{getInitials(user?.username)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <Textarea
                    key={`reply-${commentId}`}
                    placeholder={`Reply to ${comment.isAnonymous ? 'Anonymous' : `@${comment.author?.username}`}...`}
                    value={replyText}
                    onChange={(e) => {
                      e.preventDefault();
                      const newValue = e.target.value;
                      setReplyText(newValue);
                    }}
                    className="min-h-[60px] resize-none text-sm"
                    maxLength={500}
                    autoFocus
                    dir="ltr"
                    style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setReplyingTo(null);
                        setReplyText('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleReplySubmit(commentId, replyingTo.parentCommentId)}
                      disabled={isSubmittingReply || !replyText.trim()}
                    >
                      {isSubmittingReply && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                      Reply
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Preview Replies (Always visible if exist) */}
            {!isExpanded && previewReplies && previewReplies.length > 0 && (
              <div className="mt-2 space-y-2">
                {previewReplies.filter(r => r).map((reply) => (
                  <CommentItem
                    key={reply._id || reply.id}
                    comment={reply}
                    depth={depth + 1}
                    parentCommentId={rootParentId}
                  />
                ))}
              </div>
            )}

            {/* Loaded Replies (When expanded) */}
            {isExpanded && hasLoadedReplies && (
              <div className="mt-2 space-y-2">
                {replies.filter(r => r).map((reply) => (
                  <CommentItem
                    key={reply._id || reply.id}
                    comment={reply}
                    depth={depth + 1}
                    parentCommentId={rootParentId}
                  />
                ))}
              </div>
            )}

            {/* Show/Hide Replies Buttons */}
            <div className="mt-2 ml-1">
              {totalReplies > 0 && (
                <>
                  {!isExpanded && hiddenRepliesCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs text-primary hover:underline"
                      onClick={() => {
                        if (!hasLoadedReplies) {
                          loadReplies(commentId);
                        } else {
                          toggleReplies(commentId);
                        }
                      }}
                      disabled={isLoadingReplies}
                    >
                      {isLoadingReplies ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        `Show Replies (${hiddenRepliesCount})`
                      )}
                    </Button>
                  )}

                  {isExpanded && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 text-xs text-muted-foreground hover:text-primary"
                        onClick={() => toggleReplies(commentId)}
                      >
                        Hide Replies
                      </Button>

                      {hasMoreReplies[commentId] && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto p-0 text-xs text-primary hover:underline ml-3"
                          onClick={() => loadReplies(commentId)}
                          disabled={isLoadingReplies}
                        >
                          {isLoadingReplies ? (
                            <>
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            'Show More Replies'
                          )}
                        </Button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto flex">
          <Sidebar />
          <main className="flex-1 border-x min-h-screen">
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </main>
          <SuggestedUsers />
        </div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto flex">
          <Sidebar />
          <main className="flex-1 border-x min-h-screen">
            <div className="p-8 text-center text-muted-foreground">
              Thread not found
            </div>
          </main>
          <SuggestedUsers />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto flex">
        <Sidebar />

        <main className="flex-1 border-x min-h-screen">
          {/* Header */}
          <div className="sticky top-16 z-10 bg-background/95 backdrop-blur border-b p-4 flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="font-semibold text-lg">Thread</h1>
          </div>

          {/* Original Thread */}
          <div className="border-b p-4">
            <div className="flex space-x-3">
              <Avatar className="h-12 w-12">
                <AvatarImage
                  src={thread.author?.profilePic}
                  alt={thread.author?.username}
                />
                <AvatarFallback>
                  {thread.isAnonymous ? 'A' : getInitials(thread.author?.username)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold">
                    {thread.isAnonymous ? 'Anonymous' : `@${thread.author?.username}`}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {getTimeAgo(thread.createdAt)}
                  </span>
                </div>

                <p className="mt-2 text-base whitespace-pre-wrap break-words">
                  {thread.content}
                </p>

                {thread.images && thread.images.length > 0 && (
                  <div className="mt-3 grid gap-2 grid-cols-2">
                    {thread.images.map((image, index) => (
                      <img
                        key={index}
                        src={image.url || image}
                        alt={`Thread image ${index + 1}`}
                        className="w-full rounded-lg object-cover"
                      />
                    ))}
                  </div>
                )}

                <div className="flex items-center space-x-6 mt-4 text-sm text-muted-foreground">
                  <span>❤️ {thread.likeCount || 0} likes</span>
                  <span>💬 {totalComments} comments</span>
                </div>
              </div>
            </div>
          </div>

          {/* Comment Input */}
          <div className="border-b p-4 bg-muted/20">
            <form onSubmit={handleCommentSubmit} className="space-y-3">
              <div className="flex space-x-3">
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarImage src={user?.profilePic} alt={user?.username} />
                  <AvatarFallback>{getInitials(user?.username)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <Textarea
                    placeholder="Add a comment..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="min-h-[80px] resize-none"
                    maxLength={500}
                    dir="ltr"
                    style={{ direction: 'ltr' }}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={isSubmitting || !commentText.trim()}
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Comment
                </Button>
              </div>
            </form>
          </div>

          {/* Comments with Infinite Scroll */}
          <div className="p-4" id="scrollableDiv">
            {comments.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No comments yet. Be the first to comment!
              </div>
            ) : (
              <InfiniteScroll
                dataLength={comments.length}
                next={loadMoreComments}
                hasMore={hasMore}
                loader={
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                }
                endMessage={
                  <p className="text-center text-sm text-muted-foreground py-4">
                    {comments.length > 0 ? 'No more comments' : ''}
                  </p>
                }
                scrollableTarget="scrollableDiv"
              >
                <div className="space-y-4">
                  {comments.filter(c => c).map((comment) => (
                    <CommentItem
                      key={comment._id || comment.id}
                      comment={comment}
                      depth={0}
                      parentCommentId={null}
                    />
                  ))}
                </div>
              </InfiniteScroll>
            )}
          </div>
        </main>

        <SuggestedUsers />
      </div>
    </div>
  );
}