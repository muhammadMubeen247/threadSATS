import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, MoreVertical, Trash2, Heart } from 'lucide-react';
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
  
  // Reply state
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  useEffect(() => {
    fetchThreadAndComments();
  }, [threadId]);

  const fetchThreadAndComments = async () => {
    setIsLoading(true);
    try {
      const threadResponse = await api.get(`/threads/${threadId}`);
      setThread(threadResponse.thread);
      
      const commentsResponse = await api.get(`/threads/${threadId}/comments`);
      setComments(commentsResponse.comments || []);
    } catch (error) {
      console.error('Failed to fetch thread:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    
    if (!commentText.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await api.post(`/threads/${threadId}/comments`, {
        content: commentText.trim(),
      });

      if (response.success) {
        setComments([response.comment, ...comments]);
        setCommentText('');
        
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

  // Recursive function to add reply to nested structure
  const addReplyToComment = (comments, parentId, newReply) => {
    return comments.map(comment => {
      const commentId = comment._id || comment.id;
      
      // If this is the parent comment, add reply to its replies array
      if (commentId === parentId) {
        return {
          ...comment,
          replies: [newReply, ...(comment.replies || [])]
        };
      }
      
      // If this comment has replies, recursively search them
      if (comment.replies && comment.replies.length > 0) {
        return {
          ...comment,
          replies: addReplyToComment(comment.replies, parentId, newReply)
        };
      }
      
      return comment;
    });
  };

  const handleReplySubmit = async (parentCommentId, targetCommentId) => {
    if (!replyText.trim()) return;

    setIsSubmittingReply(true);
    try {
      const response = await api.post(`/comments/${targetCommentId}/reply`, {
        content: replyText.trim(),
      });

      if (response.success) {
        // Use recursive function to add reply at the correct nested level
        setComments(addReplyToComment(comments, targetCommentId, response.comment));
        
        setReplyText('');
        setReplyingTo(null);
      }
    } catch (error) {
      console.error('Failed to post reply:', error);
      alert('Failed to post reply. Please try again.');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // Recursive function to update like status in nested comments
  const updateCommentLike = (comments, targetId, isLiked, likesCount) => {
    return comments.map(comment => {
      const commentId = comment._id || comment.id;
      
      if (commentId === targetId) {
        return {
          ...comment,
          isLiked,
          likesCount
        };
      }
      
      if (comment.replies && comment.replies.length > 0) {
        return {
          ...comment,
          replies: updateCommentLike(comment.replies, targetId, isLiked, likesCount)
        };
      }
      
      return comment;
    });
  };

  const handleLikeComment = async (commentId) => {
    try {
      const response = await api.put(`/comments/${commentId}/like`);

      if (response.success) {
        setComments(updateCommentLike(comments, commentId, response.isLiked, response.likesCount));
      }
    } catch (error) {
      console.error('Failed to like comment:', error);
    }
  };

  // Recursive function to delete comment from nested structure
  const deleteCommentFromTree = (comments, targetId) => {
    return comments
      .filter(comment => {
        const commentId = comment._id || comment.id;
        return commentId !== targetId;
      })
      .map(comment => {
        if (comment.replies && comment.replies.length > 0) {
          return {
            ...comment,
            replies: deleteCommentFromTree(comment.replies, targetId)
          };
        }
        return comment;
      });
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) return;

    try {
      await api.delete(`/comments/${commentId}`);
      
      setComments(deleteCommentFromTree(comments, commentId));
      
      setThread(prev => ({
        ...prev,
        commentCount: Math.max(0, (prev.commentCount || 0) - 1)
      }));
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  };

  const getInitials = (username) => {
    return username?.substring(0, 2).toUpperCase() || 'U';
  };

  const getTimeAgo = (date) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch {
      return 'Just now';
    }
  };

  // Component for rendering a single comment/reply with tree structure
  const CommentItem = ({ comment, depth = 0 }) => {
    const commentId = comment._id || comment.id;
    const isCommentOwner = user?._id === (comment.author?._id || comment.author?.id);
    const isReply = depth > 0;

    return (
      <div className="relative">
        {/* Connecting Line */}
        {isReply && (
          <div className="absolute left-5 top-0 w-0.5 h-full bg-border" />
        )}
        
        <div className={`flex gap-3 ${isReply ? 'pl-12' : ''}`}>
          {/* Avatar */}
          <div className="relative z-10">
            <Avatar className="h-10 w-10 border-2 border-background">
              <AvatarImage
                src={comment.author?.profilePic}
                alt={comment.author?.username}
              />
              <AvatarFallback>
                {getInitials(comment.author?.username)}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Content */}
          <div className="flex-1 pb-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">
                    @{comment.author?.username}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {getTimeAgo(comment.createdAt)}
                  </span>
                </div>
                
                {isCommentOwner && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
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
              
              <p className="text-sm">{comment.content}</p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-4 mt-2 ml-1">
              {/* Like Button */}
              <button
                onClick={() => handleLikeComment(commentId)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-500 transition-colors group"
              >
                <Heart
                  className={`h-3.5 w-3.5 ${
                    comment.isLiked ? 'fill-red-500 text-red-500' : ''
                  } group-hover:scale-110 transition-transform`}
                />
                <span>{comment.likesCount || 0}</span>
              </button>

              {/* Reply Button */}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground hover:text-primary"
                onClick={() => {
                  setReplyingTo(commentId);
                  setReplyText('');
                }}
              >
                Reply
              </Button>
            </div>

            {/* Reply Input */}
            {replyingTo === commentId && (
              <div className="mt-3 flex gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.profilePic} alt={user?.username} />
                  <AvatarFallback>{getInitials(user?.username)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <Textarea
                    placeholder={`Reply to @${comment.author?.username}...`}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="min-h-[60px] resize-none text-sm"
                    maxLength={500}
                    autoFocus
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
                      onClick={() => handleReplySubmit(null, commentId)}
                      disabled={isSubmittingReply || !replyText.trim()}
                    >
                      {isSubmittingReply && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                      Reply
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Nested Replies - Recursively render all replies */}
            {comment.replies && comment.replies.length > 0 && (
              <div className="mt-2">
                {comment.replies.map((reply) => (
                  <CommentItem
                    key={reply._id || reply.id}
                    comment={reply}
                    depth={depth + 1}
                  />
                ))}
              </div>
            )}
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
                  <span>{thread.likeCount || 0} likes</span>
                  <span>{thread.commentCount || 0} replies</span>
                </div>
              </div>
            </div>
          </div>

          {/* Comment Input */}
          <div className="border-b p-4">
            <form onSubmit={handleCommentSubmit} className="space-y-4">
              <div className="flex space-x-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user?.profilePic} alt={user?.username} />
                  <AvatarFallback>{getInitials(user?.username)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <Textarea
                    placeholder="Post your reply..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="min-h-[80px] resize-none"
                    maxLength={500}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={isSubmitting || !commentText.trim()}
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Reply
                </Button>
              </div>
            </form>
          </div>

          {/* Comments Tree */}
          <div className="p-4">
            {comments.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No replies yet. Be the first to reply!
              </div>
            ) : (
              <div className="space-y-0">
                {comments.map((comment) => (
                  <CommentItem
                    key={comment._id || comment.id}
                    comment={comment}
                    depth={0}
                  />
                ))}
              </div>
            )}
          </div>
        </main>

        <SuggestedUsers />
      </div>
    </div>
  );
}