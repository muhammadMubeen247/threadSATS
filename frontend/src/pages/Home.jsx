import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import InfiniteScroll from 'react-infinite-scroll-component';
import { Loader2 } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import SuggestedUsers from '@/components/layout/SuggestedUsers';
import ThreadCard from '@/components/feed/ThreadCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/store/authStore';
import api from '@/api/axios';

export default function Home() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [activeTab, setActiveTab] = useState('forYou');
  const [threads, setThreads] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalThreads, setTotalThreads] = useState(0);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  // Reset and fetch threads when tab changes
  useEffect(() => {
    setThreads([]);
    setPage(1);
    setHasMore(true);
    fetchThreads(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const fetchThreads = async (pageNum = page, isInitial = false) => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      let endpoint = '/threads';
      if (activeTab === 'following') endpoint = '/threads/feed/following';
      else if (activeTab === 'yourBatch') endpoint = '/threads/feed/batch';

      const response = await api.get(`${endpoint}?page=${pageNum}&limit=10`);
      const newThreads = response.threads || [];

      setThreads((prev) => (isInitial ? newThreads : [...prev, ...newThreads]));
      setTotalThreads(response.total || 0);
      setHasMore(response.page < response.pages);
      setPage(pageNum + 1);
    } catch (error) {
      console.error('Failed to fetch threads:', error);
      if (isInitial) setThreads([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreThreads = () => {
    if (!isLoading && hasMore) fetchThreads(page);
  };

  const handleThreadCreated = (newThread) => {
    setThreads([newThread, ...threads]);
    setTotalThreads((prev) => prev + 1);
  };

  const handleThreadDeleted = (threadId) => {
    setThreads(threads.filter((t) => (t._id || t.id) !== threadId));
    setTotalThreads((prev) => Math.max(0, prev - 1));
  };

  const renderThreads = () => {
    if (isLoading && threads.length === 0) {
      return (
        <div className="p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="mt-2 text-muted-foreground">Loading threads...</p>
        </div>
      );
    }

    if (!isLoading && threads.length === 0) {
      const emptyMessage =
        activeTab === 'following'
          ? 'You are not following anyone yet. Start following users to see their threads here!'
          : activeTab === 'yourBatch'
          ? 'No threads from your batch yet. Be the first to post!'
          : 'No threads yet. Be the first to create one!';

      return <div className="p-8 text-center text-muted-foreground">{emptyMessage}</div>;
    }

    return (
      <InfiniteScroll
        dataLength={threads.length}
        next={loadMoreThreads}
        hasMore={hasMore}
        loader={
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
        endMessage={
          threads.length > 5 && (
            <p className="text-center text-sm text-muted-foreground py-6 border-t">
              You've read all threads!
            </p>
          )
        }
      >
        <div className="divide-y">
          {threads.map((thread, index) => {
            const key =
              thread?.type === 'repost'
                ? thread?.repost?.id || thread?.repost?._id || `repost-${index}`
                : thread?._id || thread?.id || `thread-${index}`;

            return (
              <ThreadCard
                key={key}
                thread={thread}
                onDelete={handleThreadDeleted}
                onUpdate={(updateKey, patch) => {
                  setThreads((prev) =>
                    prev.map((t) => {
                      const tKey =
                        t?.type === 'repost' ? t?.repost?.id : t?._id || t?.id;

                      if (tKey !== updateKey) return t;
                      return { ...t, ...patch };
                    })
                  );
                }}
              />
            );
          })}
        </div>
      </InfiniteScroll>
    );
  };

  // ✅ update feed when global modal creates a thread
  useEffect(() => {
    const onCreated = (e) => {
      const newThread = e?.detail;
      if (!newThread) return;

      setThreads((prev) => [newThread, ...prev]);
      setTotalThreads((prev) => prev + 1);
    };

    window.addEventListener('thread:created', onCreated);
    return () => window.removeEventListener('thread:created', onCreated);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto flex flex-col lg:flex-row">
        {/* Left Sidebar (desktop only) */}
        <aside className="hidden lg:block w-64 shrink-0">
          <Sidebar
            onCreateThread={() => window.dispatchEvent(new Event('thread:create'))}
          />
        </aside>

        {/* Main Feed */}
        <main className="flex-1 min-h-[calc(100vh-4rem)] lg:border-x">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start rounded-none border-b bg-background p-0 h-12 sm:h-14 sticky top-16 z-10">
              <TabsTrigger
                value="forYou"
                className="flex-1 rounded-none text-sm sm:text-base data-[state=active]:border-b-2 data-[state=active]:border-primary hover:bg-accent/60"
              >
                For You
              </TabsTrigger>
              <TabsTrigger
                value="following"
                className="flex-1 rounded-none text-sm sm:text-base data-[state=active]:border-b-2 data-[state=active]:border-primary hover:bg-accent/60"
              >
                Following
              </TabsTrigger>
              <TabsTrigger
                value="yourBatch"
                className="flex-1 rounded-none text-sm sm:text-base data-[state=active]:border-b-2 data-[state=active]:border-primary hover:bg-accent/60"
              >
                Your Batch
              </TabsTrigger>
            </TabsList>

            <TabsContent value="forYou" className="mt-0">
              {renderThreads()}
            </TabsContent>
            <TabsContent value="following" className="mt-0">
              {renderThreads()}
            </TabsContent>
            <TabsContent value="yourBatch" className="mt-0">
              {renderThreads()}
            </TabsContent>
          </Tabs>
        </main>

        {/* Right Sidebar (xl+ only) */}
        <aside className="hidden xl:block w-80 shrink-0">
          <SuggestedUsers />
        </aside>
      </div>
    </div>
  );
}