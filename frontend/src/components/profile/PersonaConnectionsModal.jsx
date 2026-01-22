import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api/axios';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const normalizeHandle = (h) => (typeof h === 'string' ? h.trim().replace(/^@+/, '') : '');

const getInitials = (handle) => {
  const s = (handle || '').trim();
  return s ? s.slice(0, 2).toUpperCase() : 'U';
};

export default function PersonaConnectionsModal({ open, onOpenChange, handle, mode }) {
  const navigate = useNavigate();

  const cleanHandle = useMemo(() => normalizeHandle(handle), [handle]);
  const title = mode === 'following' ? 'Following' : 'Followers';

  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const canLoadMore = page < pages;

  const fetchPage = async (pageNum) => {
    if (!cleanHandle || !mode) return;

    const isFirst = pageNum === 1;
    setError(isFirst ? '' : error);

    try {
      isFirst ? setLoading(true) : setLoadingMore(true);

      const res = await api.get(`/personas/${cleanHandle}/${mode}`, {
        params: { page: pageNum, limit: 20 },
      });

      const next = Array.isArray(res.results) ? res.results : [];
      setPages(Number(res.pages || 0));

      setItems((prev) => (isFirst ? next : [...prev, ...next]));
      setPage(pageNum);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load list');
      if (isFirst) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setItems([]);
    setPage(1);
    setPages(0);
    setError('');
    fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cleanHandle, mode]);

  const goToProfile = (h) => {
    const dest = normalizeHandle(h);
    if (!dest) return;
    onOpenChange?.(false);
    navigate(`/@${dest}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="py-6">
            <p className="text-sm text-red-500">{error}</p>
            <div className="mt-4">
              <Button variant="outline" onClick={() => fetchPage(1)}>
                Retry
              </Button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">No results</div>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <ul className="divide-y">
              {items.map((p) => {
                const h = p?.handle || p?.username;
                const displayName = p?.displayName || h || 'Profile';
                const roll = p?.type === 'public' ? (p?.rollNumber || '') : '';

                return (
                  <li key={p?.id} className="py-3">
                    <button
                      type="button"
                      className="w-full text-left flex items-center gap-3 hover:bg-accent/50 rounded-md px-2 py-2"
                      onClick={() => goToProfile(h)}
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={p?.profilePic} alt={h || 'profile'} />
                        <AvatarFallback>{getInitials(h)}</AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">@{h}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {displayName}
                          {roll ? ` • ${roll}` : ''}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="pt-4">
              {canLoadMore ? (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={loadingMore}
                  onClick={() => fetchPage(page + 1)}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              ) : (
                <p className="text-center text-xs text-muted-foreground">You've reached the end</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}