import { useEffect, useRef, useState } from 'react';
import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import api from '@/api/axios';
import { useNavigate } from 'react-router-dom';

export default function SuggestedUsersPage() {
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [followLoading, setFollowLoading] = useState({}); // id -> bool

  const sentinelRef = useRef(null);

  const getInitials = (handle) => String(handle || '').substring(0, 2).toUpperCase() || 'U';

  const goToProfile = (u) => {
    const handle = (u?.handle || u?.username || '').trim().replace(/^@+/, '');
    if (!handle) return;
    navigate(`/@${handle}`);
  };

  const loadPage = async (nextPage) => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await api.get('/personas/suggested', {
        params: { page: nextPage, limit: 15 },
      });

      const results = Array.isArray(res?.results) ? res.results : [];

      setItems((prev) => {
        const seen = new Set(prev.map((x) => String(x.id)));
        const merged = [...prev];
        for (const r of results) {
          if (!seen.has(String(r.id))) merged.push(r);
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
    loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasMore) return;

    const el = sentinelRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting && !loading) loadPage(page + 1);
      },
      { root: null, rootMargin: '600px', threshold: 0 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [page, hasMore, loading]);

  const follow = async (u) => {
    const handle = u?.handle || u?.username;
    if (!handle) return;

    setFollowLoading((p) => ({ ...p, [u.id]: true }));
    try {
      await api.post(`/personas/${handle}/follow`);
      setItems((prev) => prev.map((x) => (x.id === u.id ? { ...x, isFollowing: true } : x)));
    } catch {
      // ignore
    } finally {
      setFollowLoading((p) => ({ ...p, [u.id]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="flex">
        {/* ✅ hide sidebar on mobile/tablet */}
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        <div className="flex-1 flex justify-center">
          <main className="w-full max-w-4xl px-3 py-4 sm:px-6 sm:py-6">
            <Card className="mx-auto w-full max-w-2xl">
              <CardHeader>
                <CardTitle>Suggested Users</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {items.map((u) => {
                  const handle = u?.handle || u?.username;
                  const roll = u?.type === 'public' ? u?.rollNumber : '';

                  return (
                    <div key={u.id} className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => goToProfile(u)}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-md hover:bg-accent/60 px-2 py-2"
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={u.profilePic} alt={handle} />
                          <AvatarFallback>{getInitials(handle)}</AvatarFallback>
                        </Avatar>

                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">@{handle}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {u.displayName || ''}
                            {roll ? ` • ${roll}` : ''}
                          </div>
                        </div>
                      </button>

                      <Button
                        size="sm"
                        variant={u.isFollowing ? 'outline' : 'default'}
                        disabled={u.isFollowing || !!followLoading[u.id]}
                        onClick={(e) => {
                          e.stopPropagation();
                          follow(u);
                        }}
                      >
                        {u.isFollowing ? 'Following' : followLoading[u.id] ? 'Following…' : 'Follow'}
                      </Button>
                    </div>
                  );
                })}

                {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}

                {!hasMore && items.length > 0 ? (
                  <div className="text-sm text-muted-foreground">No more suggestions.</div>
                ) : null}

                {!loading && items.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No suggestions right now.</div>
                ) : null}

                <div ref={sentinelRef} />
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    </div>
  );
}