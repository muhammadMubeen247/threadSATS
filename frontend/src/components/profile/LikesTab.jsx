import { useState, useEffect } from 'react';
import InfiniteScroll from 'react-infinite-scroll-component';
import ThreadCard from '@/components/feed/ThreadCard';
import api from '@/api/axios';

export default function LikesTab({ userId }) {
  const [threads, setThreads] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!userId) return; // wait until profile loads

    setThreads([]);
    setPage(1);
    setHasMore(true);
    setLoading(true);
    setErrorMsg('');
    loadLikes(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const normalizeThread = (t) => {
    if (!t) return null;

    // backend returns formatted thread objects in `activity` already
    const id = t.id ?? t._id;
    if (!id) return null;

    return {
      ...t,
      id: String(id),
      author: t.author
        ? {
            ...t.author,
            id: t.author.id ? String(t.author.id) : t.author._id ? String(t.author._id) : t.author.id,
          }
        : t.author,
    };
  };

  const loadLikes = async (pageNum = page) => {
    try {
      setErrorMsg('');

      const res = await api.get(`/users/${userId}/activity`, {
        params: { type: 'likes', page: pageNum, limit: 10 },
      });

      // ✅ getUserActivity returns { activity: [...] }
      const activity = Array.isArray(res.activity) ? res.activity : [];
      const likedThreads = activity
        .filter((item) => item?.type === 'thread') // ensure we only render threads
        .map(normalizeThread)
        .filter(Boolean);

      setThreads((prev) => (pageNum === 1 ? likedThreads : [...prev, ...likedThreads]));
      setHasMore(pageNum < (res.pages || 0));
      setPage(pageNum + 1);
    } catch (error) {
      const status = error?.response?.status;

      // If your /activity route is protected (it is), 401 means auth/cookies/token not being sent.
      if (status === 401) {
        setErrorMsg('You must be logged in to view liked threads.');
      } else {
        setErrorMsg(error?.response?.data?.message || error?.message || 'Failed to load liked threads.');
      }

      setHasMore(false);
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

  if (errorMsg) {
    return <div className="text-center p-8 text-red-500">{errorMsg}</div>;
  }

  if (threads.length === 0) {
    return <div className="text-center p-8 text-muted-foreground">No liked threads yet</div>;
  }

  return (
    <InfiniteScroll
      dataLength={threads.length}
      next={() => loadLikes()}
      hasMore={hasMore}
      loader={
        <div className="flex justify-center p-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </div>
      }
      endMessage={<p className="text-center text-muted-foreground p-4">No more liked threads</p>}
    >
      {threads.map((thread) => (
        <ThreadCard key={thread.id} thread={thread} />
      ))}
    </InfiniteScroll>
  );
}