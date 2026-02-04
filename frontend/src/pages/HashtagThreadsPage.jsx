import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import ThreadCard from '@/components/feed/ThreadCard';

import api from '@/api/axios';

export default function HashtagThreadsPage() {
  const { tag } = useParams();

  const [threads, setThreads] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const sentinelRef = useRef(null);

  const loadPage = async (nextPage) => {
    if (loading) return;

    setLoading(true);
    try {
      const res = await api.get(
        `/threads/hashtag/${encodeURIComponent(tag)}`,
        { params: { page: nextPage, limit: 20 } }
      );

      const results = Array.isArray(res?.threads) ? res.threads : [];

      setThreads((prev) => {
        const seen = new Set(prev.map((x) => String(x.id || x._id)));
        const merged = [...prev];

        for (const r of results) {
          const id = String(r.id || r._id);
          if (!seen.has(id)) merged.push(r);
        }

        return merged;
      });

      setHasMore(!!res?.hasMore);
      setPage(nextPage);
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setThreads([]);
    setPage(1);
    setHasMore(true);
    loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag]);

  useEffect(() => {
    if (!hasMore) return;

    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading) {
          loadPage(page + 1);
        }
      },
      {
        root: null,
        rootMargin: '800px',
        threshold: 0,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [page, hasMore, loading]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="flex">
        <Sidebar />

        <main className="flex-1">
          {/* Header */}
          <header className="border-b px-4 py-5 sm:px-6">
            <div className="mx-auto max-w-2xl">
              <h1 className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                #{String(tag || '').toLowerCase()}
              </h1>
              <p className="text-sm text-muted-foreground">Threads</p>
            </div>
          </header>

          {/* Feed */}
          <section className="mx-auto max-w-2xl">
            {threads.map((thread) => (
              <ThreadCard
                key={thread.id || thread._id}
                thread={thread}
                onDelete={(id) =>
                  setThreads((prev) =>
                    prev.filter((x) => (x.id || x._id) !== id)
                  )
                }
                onUpdate={(key, patch) =>
                  setThreads((prev) =>
                    prev.map((x) =>
                      (x.id || x._id) === key ? { ...x, ...patch } : x
                    )
                  )
                }
              />
            ))}

            {loading && (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                Loading…
              </div>
            )}

            {!loading && threads.length === 0 && (
              <div className="px-4 py-12 text-center text-muted-foreground">
                No threads for this hashtag.
              </div>
            )}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} />
          </section>
        </main>
      </div>
    </div>
  );
}
