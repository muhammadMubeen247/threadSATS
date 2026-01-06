import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import SuggestedUsers from '@/components/layout/SuggestedUsers';
import ThreadCard from '@/components/feed/ThreadCard';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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

  useEffect(() => {
    fetchThreadAndComments();
  }, [threadId]);

  const fetchThreadAndComments = async () => {
    setIsLoading(true);
    try {
      const response = await api.get(`/threads/${threadId}`);
      setThread(response.thread);
      
      // Fetch comments if endpoint exists
      // For now, comments are in thread.comments
      setComments(response.thread?.comments || []);
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
        content: commentText,
      });

      if (response.success) {
        setComments([response.comment, ...comments]);
        setCommentText('');
      }
    } catch (error) {
      console.error('Failed to post comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getInitials = (username) => {
    return username?.substring(0, 2).toUpperCase() || 'U';
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

          {/* Thread */}
          <ThreadCard
            thread={thread}
            onDelete={() => navigate('/home')}
          />

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

          {/* Comments */}
          <div>
            {comments.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No comments yet. Be the first to reply!
              </div>
            ) : (
              comments.map((comment) => (
                <div key={comment._id || comment.id} className="border-b p-4">
                  <div className="flex space-x-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={comment.author?.profilePic}
                        alt={comment.author?.username}
                      />
                      <AvatarFallback>
                        {getInitials(comment.author?.username)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-sm">
                          @{comment.author?.username}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(comment.createdAt), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      <p className="mt-1 text-sm">{comment.content}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </main>

        <SuggestedUsers />
      </div>
    </div>
  );
}