import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import api from '@/api/axios';
import { useAuthStore } from '@/store/authStore';

import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import SuggestedUsers from '@/components/layout/SuggestedUsers';

import ProfileHeader from '@/components/profile/ProfileHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ThreadCard from '@/components/feed/ThreadCard';

function MyThreadsTab() {
  const [threads, setThreads] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const load = async (pageToLoad = page) => {
    const res = await api.get('/threads/me', { params: { page: pageToLoad, limit: 10 } });
    const newThreads = res.threads || [];
    setThreads((prev) => (pageToLoad === 1 ? newThreads : [...prev, ...newThreads]));
    setHasMore(pageToLoad < (res.pages || 0));
    setPage(pageToLoad + 1);
  };

  useEffect(() => {
    setThreads([]);
    setPage(1);
    setHasMore(true);
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!threads.length) return <div className="text-center p-8 text-muted-foreground">No threads yet</div>;

  return (
    <div>
      {threads.map((t) => {
        const key = t?.type === 'repost' ? t?.repost?.id : t?.id || t?._id;
        return (
          <ThreadCard
            key={key}
            thread={t}
            onDelete={(id) => setThreads((prev) => prev.filter((x) => (x?.type === 'repost' ? x?.repost?.id : x?.id || x?._id) !== id))}
          />
        );
      })}
      {!hasMore ? <p className="text-center text-muted-foreground p-4">No more threads</p> : null}
    </div>
  );
}

function MyRepliesTab() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    (async () => {
      const res = await api.get('/users/me/activity', { params: { type: 'replies', page: 1, limit: 20 } });
      setItems(res.activity || []);
    })();
  }, []);

  if (!items.length) return <div className="text-center p-8 text-muted-foreground">No replies yet</div>;
  return <div className="p-4 text-sm text-muted-foreground">Replies loaded ({items.length}). Hook your existing RepliesTab UI here.</div>;
}

function MyLikesTab() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    (async () => {
      const res = await api.get('/users/me/activity', { params: { type: 'likes', page: 1, limit: 20 } });
      setItems((res.activity || []).filter((x) => x?.type === 'thread'));
    })();
  }, []);

  if (!items.length) return <div className="text-center p-8 text-muted-foreground">No liked threads yet</div>;
  return (
    <div>
      {items.map((t) => (
        <ThreadCard
          key={t.id}
          thread={t}
          onDelete={(id) => setItems((prev) => prev.filter((x) => (x?.id || x?._id) !== id))}
        />
      ))}
    </div>
  );
}

export default function MeProfilePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [profile, setProfile] = useState(null);
  const [activeMode, setActiveMode] = useState('public');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) return;

    (async () => {
      try {
        setError('');
        const res = await api.get('/users/me/profile');
        setActiveMode(res.activeMode || 'public');
        setProfile({
          id: res.persona.id,
          username: res.persona.username,
          displayName: res.persona.displayName,
          profilePic: res.persona.profilePic,
          coverPhoto: res.persona.coverPhoto,
          bio: res.persona.bio,
          rollNumber: res.persona.rollNumber,
          department: res.persona.department,
          batch: res.persona.batch,
          followersCount: res.persona.followersCount,
          followingCount: res.persona.followingCount,
          threadsCount: res.persona.threadsCount,
          isFollowing: false,
        });
      } catch (e) {
        setError(e?.message || 'Failed to load profile');
      }
    })();
  }, [isAuthenticated]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="p-6 text-center text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="flex">
        <div className="hidden lg:block">
          <Sidebar onCreateThread={() => window.dispatchEvent(new Event('thread:create'))} />
        </div>

        <div className="flex-1 flex justify-center">
          <main className="flex w-full max-w-6xl gap-6 px-4 py-4 sm:px-6 sm:py-6">
            <section className="flex-1 min-w-0 lg:border-x">
              <ProfileHeader
                profile={profile}
                isOwnProfile={true}
                onFollowToggle={() => {}}
                onEditProfile={() => navigate('/home')}
                onProfilePicUpdated={() => {}}
              />

              <div className="px-6 pt-3 text-xs text-muted-foreground">
                Viewing:{' '}
                <span className="font-medium">{activeMode === 'anon' ? 'Anonymous' : 'Public'}</span>
              </div>

              <Tabs defaultValue="threads" className="mt-4">
                <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
                  <TabsTrigger
                    value="threads"
                    className="flex-1 sm:flex-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-4 sm:px-6 py-3"
                  >
                    Threads
                  </TabsTrigger>
                  <TabsTrigger
                    value="replies"
                    className="flex-1 sm:flex-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-4 sm:px-6 py-3"
                  >
                    Replies
                  </TabsTrigger>
                  <TabsTrigger
                    value="likes"
                    className="flex-1 sm:flex-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-4 sm:px-6 py-3"
                  >
                    Likes
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="threads" className="mt-0">
                  <MyThreadsTab />
                </TabsContent>
                <TabsContent value="replies" className="mt-0">
                  <MyRepliesTab />
                </TabsContent>
                <TabsContent value="likes" className="mt-0">
                  <MyLikesTab />
                </TabsContent>
              </Tabs>
            </section>

            <aside className="hidden xl:block w-80 shrink-0">
              <SuggestedUsers />
            </aside>
          </main>
        </div>
      </div>
    </div>
  );
}