import { useState, useEffect } from 'react';
import InfiniteScroll from 'react-infinite-scroll-component';
import api from '@/api/axios';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageCircle, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

export default function RepliesTab({ username }) {
  const [replies, setReplies] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setReplies([]);
    setPage(1);
    setHasMore(true);
    loadReplies(1);
  }, [username]);

  const loadReplies = async (pageNum = page) => {
    try {
      const res = await api.get(`/users/${username}/replies`, {
        params: { page: pageNum, limit: 10 }
      });
      
      const newReplies = res.replies || [];
      setReplies(prev => pageNum === 1 ? newReplies : [...prev, ...newReplies]);
      setHasMore(pageNum < res.pages);
      setPage(pageNum + 1);
    } catch (error) {
      console.error('Load replies error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading && replies.length === 0) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (replies.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        No replies yet
      </div>
    );
  }

  return (
    <InfiniteScroll
      dataLength={replies.length}
      next={() => loadReplies()}
      hasMore={hasMore}
      loader={
        <div className="flex justify-center p-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </div>
      }
      endMessage={
        <p className="text-center text-muted-foreground p-4">
          No more replies
        </p>
      }
    >
      {replies.map((reply) => (
        <div
          key={reply.id}
          className="border-b p-4 hover:bg-accent/50 transition cursor-pointer"
          onClick={() => navigate(`/thread/${reply.thread?.id}`)}
        >
          {/* Reply Content */}
          <p className="mb-2">{reply.content}</p>
          <p className="text-sm text-muted-foreground mb-3">
            Replying to @{reply.thread?.author?.username}
          </p>

          {/* Parent Thread Preview */}
          {reply.thread && (
            <div className="p-3 bg-muted/30 rounded-lg border">
              <div className="flex items-start gap-3">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={reply.thread.author?.profilePic} />
                  <AvatarFallback>
                    {reply.thread.author?.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">
                      @{reply.thread.author?.username}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(reply.thread.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm line-clamp-2">{reply.thread.content}</p>
                  
                  {/* Thread Images */}
                  {reply.thread.images?.length > 0 && (
                    <div className="mt-2 flex gap-2">
                      {reply.thread.images.slice(0, 2).map((img, idx) => (
                        <img
                          key={idx}
                          src={img}
                          alt=""
                          className="w-16 h-16 object-cover rounded"
                        />
                      ))}
                      {reply.thread.images.length > 2 && (
                        <div className="w-16 h-16 bg-muted rounded flex items-center justify-center text-xs">
                          +{reply.thread.images.length - 2}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Reply Stats */}
          <div className="flex gap-4 mt-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Heart className="w-4 h-4" />
              <span>{reply.likesCount || 0}</span>
            </div>
            <div className="flex items-center gap-1">
              <MessageCircle className="w-4 h-4" />
              <span>{reply.replyCount || 0}</span>
            </div>
            <span className="ml-auto">
              {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>
      ))}
    </InfiniteScroll>
  );
}