import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import ThreadCard from '@/components/feed/ThreadCard';
import SuggestedUsers from '@/components/layout/SuggestedUsers';

import api from '@/api/axios';

export default function HashtagThreadsPage() {
  const { tag } = useParams();

  const [activeTab, setActiveTab] = useState('top'); // 'top' | 'latest'

  // Top
  const [topThreads, setTopThreads] = useState([]);
  const [topPage, setTopPage] = useState(1);
  const [topHasMore, setTopHasMore] = useState(true);
  const [topLoading, setTopLoading] = useState(false);

  // Latest
  const [latestThreads, setLatestThreads] = useState([]);
  const [latestPage, setLatestPage] = useState(1);
  const [latestHasMore, setLatestHasMore] = useState(true);
  const [latestLoading, setLatestLoading] = useState(false);

  const sentinelRef = useRef(null);

  const hashtag = useMemo(() => String(tag || '').toLowerCase(), [tag]);

  const loadPage = async (sort, nextPage) => {
    const isTop = sort === 'top';
    const isLoading = isTop ? topLoading : latestLoading;

    if (isLoading) return;
    isTop ? setTopLoading(true) : setLatestLoading(true);

    try {
      const res = await api.get(`/threads/hashtag/${encodeURIComponent(tag)}`, {
        params: {
          page: nextPage,
          limit: 10,
          sort: isTop ? 'top' : 'new',
        },
      });

      const results = Array.isArray(res?.threads) ? res.threads : [];

      const mergeUnique = (prev) => {
        const seen = new Set(prev.map((x) => String(x.id || x._id)));
        const merged = [...prev];

        for (const r of results) {
          const id = String(r.id || r._id);
          if (!seen.has(id)) merged.push(r);
        }
        return merged;
      };

      if (isTop) {
        setTopThreads(mergeUnique);
        setTopHasMore(!!res?.hasMore);
        setTopPage(nextPage);
      } else {
        setLatestThreads(mergeUnique);
        setLatestHasMore(!!res?.hasMore);
        setLatestPage(nextPage);
      }
    } catch {
      isTop ? setTopHasMore(false) : setLatestHasMore(false);
    } finally {
      isTop ? setTopLoading(false) : setLatestLoading(false);
    }
  };

  useEffect(() => {
    setActiveTab('top');

    setTopThreads([]);
    setTopPage(1);
    setTopHasMore(true);
    setTopLoading(false);

    setLatestThreads([]);
    setLatestPage(1);
    setLatestHasMore(true);
    setLatestLoading(false);

    loadPage('top', 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tag]);

  useEffect(() => {
    if (activeTab === 'top') {
      if (!topThreads.length && topHasMore && !topLoading) loadPage('top', 1);
    } else {
      if (!latestThreads.length && latestHasMore && !latestLoading) loadPage('latest', 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const hasMore = activeTab === 'top' ? topHasMore : latestHasMore;
    const loading = activeTab === 'top' ? topLoading : latestLoading;
    const page = activeTab === 'top' ? topPage : latestPage;

    if (!hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (loading) return;
        loadPage(activeTab, page + 1);
      },
      { root: null, rootMargin: '800px', threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [activeTab, topPage, topHasMore, topLoading, latestPage, latestHasMore, latestLoading]);

  const removeFromBoth = (id) => {
    setTopThreads((prev) => prev.filter((x) => (x.id || x._id) !== id));
    setLatestThreads((prev) => prev.filter((x) => (x.id || x._id) !== id));
  };

  const updateInBoth = (key, patch) => {
    setTopThreads((prev) => prev.map((x) => ((x.id || x._id) === key ? { ...x, ...patch } : x)));
    setLatestThreads((prev) =>
      prev.map((x) => ((x.id || x._id) === key ? { ...x, ...patch } : x))
    );
  };

  const threads = activeTab === 'top' ? topThreads : latestThreads;
  const loading = activeTab === 'top' ? topLoading : latestLoading;

  const TabButton = ({ tab, label }) => {
    const isActive = activeTab === tab;

    return (
      <button
        type="button"
        onClick={() => setActiveTab(tab)}
        className={[
          'relative w-full py-3 text-sm font-medium transition-colors',
          'flex items-center justify-center',
          isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        ].join(' ')}
      >
        {label}
        {isActive && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-foreground" />}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="flex">
        {/* ✅ hide on mobile/tablet */}
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {/* Center feed + right rail */}
        <div className="flex-1 flex justify-center">
          <main className="flex w-full max-w-6xl gap-6 px-4 sm:px-6">
            {/* Feed */}
            <section className="flex-1 min-w-0">
              {/* Header */}
              <header className="border-b py-5">
                <div className="mx-auto max-w-3xl space-y-1">
                  <h1 className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                    #{hashtag}
                  </h1>
                  <p className="text-sm text-muted-foreground">Threads</p>
                </div>
              </header>

              {/* Tabs */}
              <div className="border-b mt-2">
                <div className="mx-auto max-w-3xl">
                  <div className="grid grid-cols-2">
                    <TabButton tab="top" label="Top" />
                    <TabButton tab="latest" label="Latest" />
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="mx-auto max-w-3xl py-5">
                <div className="space-y-4">
                  {threads.map((thread) => (
                    <ThreadCard
                      key={thread.id || thread._id}
                      thread={thread}
                      onDelete={removeFromBoth}
                      onUpdate={updateInBoth}
                    />
                  ))}

                  {loading && (
                    <div className="py-2 text-sm text-muted-foreground">Loading…</div>
                  )}

                  {!loading && threads.length === 0 && (
                    <div className="py-12 text-center text-muted-foreground">
                      {activeTab === 'top' ? 'No top threads yet.' : 'No latest threads yet.'}
                    </div>
                  )}

                  <div ref={sentinelRef} />
                </div>
              </div>
            </section>

            {/* Right rail */}
            <aside className="hidden lg:block w-80 shrink-0">
              <SuggestedUsers />
            </aside>
          </main>
        </div>
      </div>
    </div>
  );
}
