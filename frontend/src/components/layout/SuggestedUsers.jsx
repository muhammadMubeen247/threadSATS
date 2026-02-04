import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import api from '@/api/axios';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SuggestedUsers() {
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [followLoading, setFollowLoading] = useState({}); // id -> bool

  const topThree = useMemo(() => users.slice(0, 3), [users]);

  const getInitials = (handle) => String(handle || '').substring(0, 2).toUpperCase() || 'U';

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/personas/suggested', { params: { page: 1, limit: 3 } });
      setUsers(Array.isArray(res?.results) ? res.results : []);
    } catch (e) {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const follow = async (u) => {
    const handle = u?.handle || u?.username;
    if (!handle) return;

    setFollowLoading((p) => ({ ...p, [u.id]: true }));
    try {
      await api.post(`/personas/${handle}/follow`);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isFollowing: true } : x)));
    } catch {
      // ignore
    } finally {
      setFollowLoading((p) => ({ ...p, [u.id]: false }));
    }
  };

  const goToProfile = (u) => {
    const handle = (u?.handle || u?.username || '').trim().replace(/^@+/, '');
    if (!handle) return;
    navigate(`/@${handle}`);
  };

  return (
    <aside className="sticky top-16 h-[calc(100vh-4rem)] w-80 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Suggested Users</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}

          {!loading && topThree.length === 0 ? (
            <div className="text-sm text-muted-foreground">No suggestions right now.</div>
          ) : null}

          {topThree.map((u) => {
            const handle = u?.handle || u?.username;
            const roll = u?.type === 'public' ? u?.rollNumber : '';

            return (
              <div key={u.id} className="flex items-center justify-between gap-3">
                {/* ✅ Clickable profile area */}
                <button
                  type="button"
                  onClick={() => goToProfile(u)}
                  className="flex items-center space-x-3 min-w-0 flex-1 text-left rounded-md hover:bg-accent/60 px-2 py-1"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={u.profilePic} alt={handle} />
                    <AvatarFallback>{getInitials(handle)}</AvatarFallback>
                  </Avatar>

                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">@{handle}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {u.displayName || ''}
                      {roll ? ` • ${roll}` : ''}
                    </p>
                  </div>
                </button>

                {/* ✅ Follow button should NOT trigger navigation */}
                <Button
                  variant={u.isFollowing ? 'outline' : 'default'}
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    follow(u);
                  }}
                  disabled={u.isFollowing || !!followLoading[u.id]}
                >
                  {u.isFollowing ? 'Following' : followLoading[u.id] ? 'Following…' : 'Follow'}
                </Button>
              </div>
            );
          })}

          <Button variant="ghost" className="w-full" onClick={() => navigate('/suggested-users')}>
            See more
          </Button>
        </CardContent>
      </Card>
    </aside>
  );
}