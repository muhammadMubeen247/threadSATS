import { useState, useEffect } from 'react';
import InfiniteScroll from 'react-infinite-scroll-component';
import api from '@/api/axios';
import { MessageCircle, Heart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default function RepliesTab({ userId }) {
  const [replies, setReplies] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!userId) return;

    setReplies([]);
    setPage(1);
    setHasMore(true);
    setLoading(true);

    loadReplies(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadReplies = async (pageNum = page) => {
    try {
      // ✅ use the backend route you confirmed in Postman
      const res = await api.get(`/users/${userId}/activity`, {
        params: { type: 'replies', page: pageNum, limit: 10 },
      });

      const newReplies = res.activity || [];
      setReplies((prev) => (pageNum === 1 ? newReplies : [...prev, ...newReplies]));
      setHasMore(pageNum < (res.pages || 0));
      setPage(pageNum + 1);
    } catch (error) {
      console.error('Load replies error:', error);
      setHasMore(false);
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
    return <div className="text-center p-8 text-muted-foreground">No replies yet</div>;
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
      endMessage={<p className="text-center text-muted-foreground p-4">No more replies</p>}
    >
      {replies.map((reply) => {
        const threadId = reply.thread?.id || reply.threadId?._id;

        const me = reply.author; // from your backend: { id, username, profilePic, ... }
        const meUsername = me?.username || 'user';
        const mePic = me?.profilePic || '';

        const hasParent = Boolean(reply.parentComment?.content);

        // Context: parent comment if exists, else the thread
        const contextLabel = hasParent ? 'Replying to a comment' : 'Replying to a thread';
        const contextAuthor = hasParent ? reply.parentComment?.author : null; // backend returns string (e.g. "Anonymous")
        const contextText = hasParent
          ? reply.parentComment?.content
          : reply.thread?.content || reply.threadId?.content || '—';

        const timeText = reply.createdAt
          ? formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })
          : '';

        return (
          <div
            key={reply.id}
            className="border-b px-4 py-5 hover:bg-accent/40 transition"
            role="button"
            tabIndex={0}
            onClick={() => threadId && navigate(`/thread/${threadId}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && threadId) navigate(`/thread/${threadId}`);
            }}
          >
            <div className="flex gap-3">
              {/* Left: avatar + connector line */}
              <div className="flex flex-col items-center">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={mePic} alt={meUsername} />
                  <AvatarFallback>{meUsername[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="mt-2 w-px flex-1 bg-border" />
              </div>

              {/* Right: content */}
              <div className="min-w-0 flex-1">
                {/* Header row */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold truncate">@{meUsername}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{timeText}</span>
                </div>

                {/* “Replying to …” line */}
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {contextLabel}
                  {contextAuthor ? <span>{` · ${contextAuthor}`}</span> : null}
                </div>

                {/* Context preview (quoted) */}
                <div className="mt-3 rounded-xl border bg-muted/30 px-3 py-2">
                  <p className="text-sm text-muted-foreground line-clamp-3">{contextText}</p>
                </div>

                {/* Your reply (main text) */}
                <div className="mt-3">
                  <p className="text-sm leading-relaxed">{reply.content}</p>
                </div>

                {/* Actions row */}
                <div className="mt-4 flex items-center gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Heart className="h-4 w-4" />
                    <span>{reply.likesCount || 0}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MessageCircle className="h-4 w-4" />
                    <span>{reply.replyCount || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </InfiniteScroll>
  );
}