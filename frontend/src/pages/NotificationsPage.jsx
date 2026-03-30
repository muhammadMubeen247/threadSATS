import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import SuggestedUsers from '@/components/layout/SuggestedUsers';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

import api from '@/api/axios';
import { useNotificationsStore } from '@/store/notificationsStore';

function initials(handle) {
  return String(handle || 'U')
    .slice(0, 2)
    .toUpperCase();
}

function timeLabel(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '';
  }
}

function renderText(n) {
  const actor = n?.lastActorPersona?.handle
    ? `@${n.lastActorPersona.handle}`
    : 'Someone';
  const others = Math.max(0, (n?.count || 0) - 1);
  const suffix =
    others > 0 ? ` and ${others} other${others === 1 ? '' : 's'}` : '';

  switch (n?.type) {
    case 'dm':
      return `${actor} sent you a message`;
    case 'like':
      return `${actor}${suffix} liked your post`;
    case 'repost':
      return `${actor}${suffix} reposted your post`;
    case 'quote':
      return `${actor}${suffix} quote reposted your post`;
    case 'comment':
      return `${actor}${suffix} commented on your post`;
    case 'reply':
      return `${actor}${suffix} replied to your comment`;
    case 'follow':
      return `${actor}${suffix} followed you`;
    case 'mention':
      return `${actor}${suffix} mentioned you`;
    default:
      return 'New notification';
  }
}

function PreviewBox({ title, children }) {
  return (
    <div className="mt-2 rounded-md border bg-background p-3">
      {title ? <div className="mb-1 text-xs font-medium text-muted-foreground">{title}</div> : null}
      {children}
    </div>
  );
}

function PersonaLine({ p }) {
  if (!p) return null;
  return (
    <div className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">@{p.handle}</span>
      {p.type === 'public' && p.rollNumber ? <span className="ml-2">{p.rollNumber}</span> : null}
    </div>
  );
}

function ThreadPreview({ t }) {
  if (!t) return <div className="text-sm text-muted-foreground">[post unavailable]</div>;
  return (
    <div className="space-y-1">
      <PersonaLine p={t.author} />
      <div className="text-sm whitespace-pre-wrap break-words">{t.content}</div>
    </div>
  );
}

function CommentPreview({ c }) {
  if (!c) return null;
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">@{c.author?.handle || 'unknown'}</span> commented
      </div>
      <div className="text-sm whitespace-pre-wrap break-words">{c.content}</div>
    </div>
  );
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const sentinelRef = useRef(null);

  const {
    items,
    setItems,
    markReadLocal,
    markAllReadLocal,
    setUnread,
  } = useNotificationsStore();

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadPage = async (nextPage) => {
    if (loading) return;

    setLoading(true);
    try {
      const res = await api.get('/notifications', {
        params: { page: nextPage, limit: 20 },
      });

      const results = Array.isArray(res?.results) ? res.results : [];

      if (nextPage === 1) {
        setItems(results);
      } else {
        setItems([
          ...items,
          ...results.filter(
            (r) => !items.some((x) => x?._id === r?._id)
          ),
        ]);
      }

      setHasMore(!!res?.hasMore);
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading) {
          loadPage(page + 1);
        }
      },
      { root: null, rootMargin: '800px', threshold: 0 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [page, hasMore, loading]);

  const openNotification = async (n) => {
    if (!n) return;

    if (!n.isRead) {
      markReadLocal(n._id);
      try {
        const r = await api.put(`/notifications/${n._id}/read`);
        if (typeof r?.unread === 'number') setUnread(r.unread);
      } catch {
        // ignore
      }
    }

    // DM -> open conversation
    if (n.type === 'dm' && n.entityType === 'conversation') {
      navigate(`/messages/${n.entityId}`);
      return;
    }

    // Like / Repost -> open original thread
    if ((n.type === 'like' || n.type === 'repost') && n.entityType === 'thread') {
      navigate(`/thread/${n.entityId}`);
      return;
    }

    // Quote -> open the QUOTE thread if we have it, otherwise open original
    if (n.type === 'quote' && n.entityType === 'thread') {
      const quoteId = n?.secondaryEntityId || n?.context?.quoteThread?.id;
      navigate(quoteId ? `/thread/${quoteId}` : `/thread/${n.entityId}`);
      return;
    }

    // Comment -> open parent thread and focus comment (secondaryEntityId = commentId)
    if (n.type === 'comment' && n.entityType === 'thread') {
      const threadId = n.entityId;
      const commentId = n.secondaryEntityId || n?.context?.comment?.id;
      navigate(commentId ? `/thread/${threadId}#comment-${commentId}` : `/thread/${threadId}`);
      return;
    }

    // Reply -> open the thread and focus the reply (entityId=parentCommentId, secondaryEntityId=replyId)
    if (n.type === 'reply' && n.entityType === 'comment') {
      const threadId = n?.context?.thread?.id; // comes from hydrated context
      const replyId = n.secondaryEntityId || n?.context?.reply?.id;

      if (threadId) {
        navigate(`/thread/${threadId}#comment-${replyId || n.entityId}`);
      } else {
        // fallback (if context missing)
        try {
          const c = await api.get(`/comments/${n.entityId}`);
          const tid = c?.comment?.threadId || c?.threadId;
          if (tid) navigate(`/thread/${tid}#comment-${replyId || n.entityId}`);
        } catch {
          // ignore
        }
      }
      return;
    }

    // Mention -> open thread and focus comment if available
    if (n.type === 'mention' && n.entityType === 'thread') {
      const threadId = n.entityId;
      const commentId = n.secondaryEntityId || n?.context?.comment?.id;
      navigate(commentId ? `/thread/${threadId}#comment-${commentId}` : `/thread/${threadId}`);
      return;
    }

    // Follow (already)
    if (n.type === 'follow' && n.lastActorPersona?.handle) {
      navigate(`/@${n.lastActorPersona.handle}`);
      return;
    }
  };

  const markAllRead = async () => {
    markAllReadLocal();
    setUnread(0);
    try {
      await api.put('/notifications/read-all');
    } catch {
      // ignore
    }
  };

  const content = useMemo(() => items || [], [items]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="flex">
        {/* ✅ hide app sidebar on small screens */}
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {/* Center feed + right rail */}
        <div className="flex-1 flex justify-center">
          <main className="flex w-full max-w-6xl gap-6 px-4 sm:px-6">
            {/* Notifications feed */}
            <section className="flex-1 min-w-0">
              <header className="border-b py-5">
                <div className="mx-auto max-w-2xl flex items-center justify-between gap-3">
                  <div>
                    <h1 className="text-lg font-semibold">Notifications</h1>
                    <p className="text-sm text-muted-foreground">
                      Your activity updates
                    </p>
                  </div>

                  <Button variant="secondary" onClick={markAllRead}>
                    Mark all read
                  </Button>
                </div>
              </header>

              <div className="mx-auto max-w-2xl px-4 py-5 sm:px-0">
                <div className="space-y-2">
                  {content.map((n) => {
                    const handle =
                      n?.lastActorPersona?.handle || '';
                    const pic =
                      n?.lastActorPersona?.profilePic || '';
                    const when = timeLabel(n?.createdAt);

                    return (
                      <button
                        key={n._id}
                        type="button"
                        onClick={() => openNotification(n)}
                        className={[
                          'w-full text-left rounded-lg border p-3 transition hover:bg-accent/50',
                          n?.isRead
                            ? 'opacity-80'
                            : 'bg-accent/20 border-accent',
                        ].join(' ')}
                      >
                        <div className="flex items-start gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage
                              src={pic}
                              alt={handle || 'actor'}
                            />
                            <AvatarFallback>
                              {initials(handle)}
                            </AvatarFallback>
                          </Avatar>

                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">
                              {renderText(n)}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {when}
                            </div>

                            {n?.context ? (
                              <div>
                                {n.type === 'dm' ? (
                                  <PreviewBox title="Message">
                                    <div className="text-sm whitespace-pre-wrap break-words">
                                      {n.context?.message?.text || '[message unavailable]'}
                                    </div>
                                  </PreviewBox>
                                ) : null}

                                {n.type === 'like' || n.type === 'repost' ? (
                                  <PreviewBox title="Post">
                                    <ThreadPreview t={n.context?.thread} />
                                  </PreviewBox>
                                ) : null}

                                {n.type === 'quote' ? (
                                  <PreviewBox title="Quote repost">
                                    <div className="space-y-3">
                                      <div>
                                        <div className="text-xs font-medium text-muted-foreground mb-1">Original</div>
                                        <ThreadPreview t={n.context?.originalThread} />
                                      </div>
                                      <div>
                                        <div className="text-xs font-medium text-muted-foreground mb-1">Quote</div>
                                        <ThreadPreview t={n.context?.quoteThread} />
                                      </div>
                                    </div>
                                  </PreviewBox>
                                ) : null}

                                {n.type === 'comment' ? (
                                  <PreviewBox title="Comment">
                                    <div className="space-y-3">
                                      <div>
                                        <div className="text-xs font-medium text-muted-foreground mb-1">Post</div>
                                        <ThreadPreview t={n.context?.thread} />
                                      </div>
                                      <div>
                                        <div className="text-xs font-medium text-muted-foreground mb-1">Comment</div>
                                        <CommentPreview c={n.context?.comment} />
                                      </div>
                                    </div>
                                  </PreviewBox>
                                ) : null}

                                {n.type === 'reply' ? (
                                  <PreviewBox title="Reply">
                                    <div className="space-y-3">
                                      <div>
                                        <div className="text-xs font-medium text-muted-foreground mb-1">Post</div>
                                        <ThreadPreview t={n.context?.thread} />
                                      </div>
                                      <div>
                                        <div className="text-xs font-medium text-muted-foreground mb-1">Parent</div>
                                        <CommentPreview c={n.context?.parentComment} />
                                      </div>
                                      <div>
                                        <div className="text-xs font-medium text-muted-foreground mb-1">Reply</div>
                                        <CommentPreview c={n.context?.reply} />
                                      </div>
                                    </div>
                                  </PreviewBox>
                                ) : null}

                                {n.type === 'mention' ? (
                                  <PreviewBox title="Mention">
                                    <div className="space-y-3">
                                      <div>
                                        <div className="text-xs font-medium text-muted-foreground mb-1">Post</div>
                                        <ThreadPreview t={n.context?.thread} />
                                      </div>
                                      {n.context?.comment ? (
                                        <div>
                                          <div className="text-xs font-medium text-muted-foreground mb-1">Mentioned in</div>
                                          <CommentPreview c={n.context?.comment} />
                                        </div>
                                      ) : null}
                                    </div>
                                  </PreviewBox>
                                ) : null}
                              </div>
                            ) : null}
                          </div>

                          {!n?.isRead && (
                            <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-sky-500" />
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {loading && (
                    <div className="py-3 text-sm text-muted-foreground">
                      Loading…
                    </div>
                  )}

                  {!loading && content.length === 0 && (
                    <div className="py-12 text-center text-muted-foreground">
                      No notifications yet.
                    </div>
                  )}

                  <div ref={sentinelRef} />
                </div>
              </div>
            </section>

            {/* ✅ right rail already hidden on small screens */}
            <aside className="hidden lg:block w-80 shrink-0">
              <SuggestedUsers />
            </aside>
          </main>
        </div>
      </div>
    </div>
  );
}
