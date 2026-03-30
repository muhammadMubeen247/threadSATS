import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import SuggestedUsers from '@/components/layout/SuggestedUsers';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

import api from '@/api/axios';

export default function TrendsPage() {
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const cleanedQuery = useMemo(
    () => query.trim().replace(/^#/, '').toLowerCase(),
    [query]
  );

  const loadTrends = async () => {
    setLoading(true);
    try {
      const res = await api.get('/trends', {
        params: {
          limit: 10,
          windowDays: 7,
          ...(cleanedQuery ? { q: cleanedQuery } : {}),
        },
      });

      setItems(Array.isArray(res?.results) ? res.results : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(loadTrends, 200);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanedQuery]);

  const goToTag = (tag) => {
    const normalized = String(tag || '').trim().replace(/^#/, '').toLowerCase();
    if (!normalized) return;
    navigate(`/hashtag/${normalized}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="flex">
        {/* ✅ hide on mobile/tablet */}
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {/* Center + right rail */}
        <div className="flex-1 flex justify-center">
          <main className="flex w-full max-w-6xl gap-6 px-4 py-4 sm:px-6 sm:py-6">
            {/* Main content */}
            <section className="flex-1 min-w-0">
              <div className="mx-auto w-full max-w-2xl">
                <Card>
                  <CardHeader className="space-y-4">
                    <CardTitle className="text-xl">Trending Now</CardTitle>

                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search trends"
                    />
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {loading && (
                      <div className="text-sm text-muted-foreground">Loading…</div>
                    )}

                    {!loading && items.length === 0 && (
                      <div className="text-sm text-muted-foreground">No trends found.</div>
                    )}

                    {items.map((trend) => (
                      <button
                        key={trend.tag}
                        type="button"
                        onClick={() => goToTag(trend.tag)}
                        className="group flex w-full items-center justify-between rounded-md border px-4 py-3 text-left transition
                                   hover:bg-accent/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">
                            Trending at #{trend.rank ?? ''}
                          </div>
                          <div className="truncate font-semibold text-sky-500 dark:text-sky-500">
                            #{trend.tag}
                          </div>
                        </div>

                        <span className="text-sm text-muted-foreground">{trend.count}</span>
                      </button>
                    ))}

                    {cleanedQuery && (
                      <Button
                        variant="ghost"
                        onClick={() => setQuery('')}
                        className="mt-2 w-full"
                      >
                        Clear search
                      </Button>
                    )}
                  </CardContent>
                </Card>
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
