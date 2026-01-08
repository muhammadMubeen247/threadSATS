import { useState, useEffect } from 'react';
import InfiniteScroll from 'react-infinite-scroll-component';
import api from '@/api/axios';
import { useNavigate } from 'react-router-dom';

export default function MediaTab({ username }) {
  const [threads, setThreads] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setThreads([]);
    setPage(1);
    setHasMore(true);
    loadMedia(1);
  }, [username]);

  const loadMedia = async (pageNum = page) => {
    try {
      const res = await api.get(`/users/${username}/threads`, {
        params: { page: pageNum, limit: 12, hasMedia: true }
      });
      
      const newThreads = res.threads || [];
      setThreads(prev => pageNum === 1 ? newThreads : [...prev, ...newThreads]);
      setHasMore(pageNum < res.pages);
      setPage(pageNum + 1);
    } catch (error) {
      console.error('Load media error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading && threads.length === 0) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        No media posts yet
      </div>
    );
  }

  return (
    <InfiniteScroll
      dataLength={threads.length}
      next={() => loadMedia()}
      hasMore={hasMore}
      loader={
        <div className="flex justify-center p-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </div>
      }
      endMessage={
        <p className="text-center text-muted-foreground p-4">
          No more media
        </p>
      }
    >
      <div className="grid grid-cols-3 gap-1 p-4">
        {threads.map((thread) =>
          thread.images?.map((image, idx) => (
            <div
              key={`${thread.id}-${idx}`}
              className="aspect-square relative group cursor-pointer overflow-hidden rounded-lg"
              onClick={() => navigate(`/thread/${thread.id}`)}
            >
              <img
                src={image}
                alt=""
                className="w-full h-full object-cover transition group-hover:scale-110"
              />
              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                <div className="text-white text-sm flex items-center gap-4">
                  <span>❤️ {thread.likeCount || 0}</span>
                  <span>💬 {thread.commentCount || 0}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </InfiniteScroll>
  );
}