import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import SuggestedUsers from '@/components/layout/SuggestedUsers';

import api from '@/api/axios';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

function initials(handle = '') {
  const h = String(handle || '').replace(/^@+/, '');
  return (h.slice(0, 2) || 'U').toUpperCase();
}

export default function SearchPage() {
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  const abortRef = useRef(null);
  const trimmedQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    if (!trimmedQuery) {
      setResults([]);
      setError('');
      setIsSearching(false);
      if (abortRef.current) abortRef.current.abort();
      return;
    }

    setIsSearching(true);
    setError('');

    const t = window.setTimeout(async () => {
      try {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const res = await api.get('/personas/search', {
          params: { q: trimmedQuery, page: 1, limit: 20 },
          signal: controller.signal,
        });

        setResults(Array.isArray(res?.results) ? res.results : []);
      } catch (e) {
        if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
        setResults([]);
        setError(e?.message || 'Search failed');
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(t);
  }, [trimmedQuery]);

  const goToPersona = (handle) => {
    const h = String(handle || '').trim().replace(/^@+/, '');
    if (!h) return;

    // ✅ close keyboard before navigation so fixed bottom nav stays visible
    const el = document.activeElement;
    if (el && typeof el.blur === 'function') el.blur();

    navigate(`/@${h}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="flex">
        {/* hide sidebar on small screens */}
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        <div className="flex-1 flex justify-center">
          <main className="flex w-full max-w-6xl gap-6 px-4 py-4 sm:px-6 sm:py-6">
            <section className="flex-1 min-w-0">
              <div className="mx-auto w-full max-w-2xl space-y-4">
                <Card>
                  <CardHeader className="space-y-3">
                    <CardTitle className="text-xl">Search</CardTitle>

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="search"
                        placeholder="Search profiles..."
                        className="pl-10"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>

                    {isSearching ? (
                      <div className="text-sm text-muted-foreground">Searching…</div>
                    ) : error ? (
                      <div className="text-sm text-red-500">{error}</div>
                    ) : trimmedQuery ? (
                      <div className="text-sm text-muted-foreground">
                        {results.length} result(s)
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Type to search profiles.
                      </div>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-2">
                    {results.map((p) => {
                      const handle = p?.handle || p?.username || '';
                      const typeLabel = p?.type === 'anon' ? 'Anon' : 'Public';
                      const displayName = p?.displayName || handle || 'Profile';
                      const rollNumber =
                        p?.type === 'public' && p?.rollNumber ? p.rollNumber : '';

                      return (
                        <button
                          key={p?.id || handle}
                          type="button"
                          onClick={() => goToPersona(handle)}
                          className="w-full rounded-md border px-3 py-2 text-left hover:bg-accent flex items-center gap-3"
                        >
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={p?.profilePic || ''} alt={handle || 'profile'} />
                            <AvatarFallback>{initials(handle)}</AvatarFallback>
                          </Avatar>

                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">
                              @{handle}{' '}
                              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground align-middle">
                                {typeLabel}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {displayName}
                              {rollNumber ? ` • ${rollNumber}` : ''}
                              {typeof p?.threadsCount === 'number' ? ` • ${p.threadsCount} posts` : ''}
                            </div>
                          </div>
                        </button>
                      );
                    })}

                    {!isSearching && trimmedQuery && results.length === 0 && !error ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        No profiles found.
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </section>

            <aside className="hidden lg:block w-80 shrink-0">
              <SuggestedUsers />
            </aside>
          </main>
        </div>
      </div>
    </div>
  );
}