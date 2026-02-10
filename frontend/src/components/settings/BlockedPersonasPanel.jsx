import { useEffect, useMemo, useState } from 'react';
import api from '@/api/axios';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

function initialsFrom(handle = '') {
  const h = String(handle).replace(/^@+/, '');
  return (h.slice(0, 2) || 'U').toUpperCase();
}

export default function BlockedPersonasPanel() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);

  const blockedCount = useMemo(
    () => items.filter((x) => x.isBlocked).length,
    [items]
  );

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await api.get('/personas/me/blocked');
      const list = Array.isArray(res?.results) ? res.results : [];
      setItems(list.map((p) => ({ ...p, isBlocked: true })));
    } catch (e) {
      setError(
        e?.userMessage || e?.message || 'Failed to load blocked profiles'
      );
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (p) => {
    const handle = (p?.handle || p?.username || '').replace(/^@+/, '');
    if (!handle) return;

    // optimistic flip
    setItems((prev) =>
      prev.map((x) =>
        x.id === p.id ? { ...x, isBlocked: !x.isBlocked } : x
      )
    );

    try {
      if (p.isBlocked) {
        await api.delete(`/personas/${handle}/block`);
      } else {
        await api.post(`/personas/${handle}/block`);
      }
    } catch (e) {
      // revert on failure
      setItems((prev) =>
        prev.map((x) =>
          x.id === p.id ? { ...x, isBlocked: p.isBlocked } : x
        )
      );
      setError(e?.userMessage || e?.message || 'Action failed');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Blocked profiles</CardTitle>
        <CardDescription>
          Unblock to allow interaction again. You can re-block immediately if
          needed.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {isLoading ? 'Loading…' : `${blockedCount} blocked`}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={isLoading}
          >
            Refresh
          </Button>
        </div>

        {!isLoading && items.length === 0 ? (
          <div className="rounded-md border p-4 text-sm text-muted-foreground">
            You haven’t blocked anyone.
          </div>
        ) : null}

        <div className="space-y-2">
          {items.map((p) => {
            const handle = p?.handle || p?.username || '';
            const display = p?.displayName || handle || 'Profile';
            const roll =
              p?.type === 'public' && p?.rollNumber ? p.rollNumber : '';

            return (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-md border p-3 transition hover:bg-accent/40"
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={p.profilePic} alt={handle} />
                  <AvatarFallback>{initialsFrom(handle)}</AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    @{handle}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {display}
                    {roll ? ` • ${roll}` : ''}
                  </div>
                </div>

                {/* ✅ right-side action */}
                <Button
                  size="sm"
                  onClick={() => toggle(p)}
                  className={
                    p.isBlocked
                      ? [
                          'border border-red-500 text-red-600',
                          'bg-transparent',
                          'hover:bg-red-50 dark:hover:bg-red-900/20',
                          'focus-visible:ring-red-500',
                        ].join(' ')
                      : ''
                  }
                  variant={p.isBlocked ? 'outline' : 'secondary'}
                >
                  {p.isBlocked ? 'Unblock' : 'Block'}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
