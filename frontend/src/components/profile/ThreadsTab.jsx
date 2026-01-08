import { useState, useEffect } from 'react';
import InfiniteScroll from 'react-infinite-scroll-component';
import ThreadCard from '@/components/feed/ThreadCard';
import api from '@/api/axios';

export default function ThreadsTab({ username }) {
  const [threads, setThreads] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadThreads();
  }, [username]);

  const loadThreads = async () => {
    try {
      const res = await api.get(`/users/${username}/threads`, {
        params: { page, limit: 10 }
      });
      
      const newThreads = res.threads || [];
      setThreads(prev => page === 1 ? newThreads : [...prev, ...newThreads]);
      setHasMore(page < res.pages);
      setPage(prev => prev + 1);
    } catch (error) {
      console.error('Load threads error:', error);
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
        No threads yet
      </div>
    );
  }

  return (
    <InfiniteScroll
      dataLength={threads.length}
      next={loadThreads}
      hasMore={hasMore}
      loader={
        <div className="flex justify-center p-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </div>
      }
      endMessage={
        <p className="text-center text-muted-foreground p-4">
          No more threads
        </p>
      }
    >
      {threads.map((thread) => (
        <ThreadCard key={thread.id} thread={thread} />
      ))}
    </InfiniteScroll>
  );
}