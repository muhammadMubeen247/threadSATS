import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Repeat2, MoreVertical, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import api from '@/api/axios';
import ImageLightbox from './ImageLightbox';
import QuoteRepostModal from './QuoteRepostModal';
import RichText from '@/components/common/RichText';

export default function ThreadCard({ thread, onDelete, onUpdate }) {
  const navigate = useNavigate();

  const { personas, activeMode } = useAuthStore();

  const activePersona = useMemo(() => {
    return (activeMode === 'anon' ? personas?.anon : personas?.public) || personas?.[activeMode] || null;
  }, [personas, activeMode]);

  const threadId = thread?.id || thread?._id;
  const repostTargetId = threadId;

  const updateKey = useMemo(() => threadId, [threadId]);

  const [isLiked, setIsLiked] = useState(thread.isLiked || false);
  const [likesCount, setLikesCount] = useState(thread.likesCount || 0);

  const [isReposted, setIsReposted] = useState(thread.isReposted || false);
  const [repostCount, setRepostCount] = useState(thread.repostCount || 0);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isQuoteOpen, setIsQuoteOpen] = useState(false);

  useEffect(() => {
    setIsLiked(thread.isLiked || false);
    setLikesCount(thread.likesCount || 0);
    setIsReposted(thread.isReposted || false);
    setRepostCount(thread.repostCount || 0);
  }, [thread.isLiked, thread.likesCount, thread.isReposted, thread.repostCount]);

  const authorHandle = thread?.author?.username || thread?.author?.handle;
  const authorLink = authorHandle ? `/@${authorHandle}` : null;

  // ✅ owner should come from backend (now active-persona based),
  // but keep a safe fallback
  const authorId = thread?.author?._id || thread?.author?.id;
  const activePersonaId = activePersona?.id || activePersona?._id;
  const isOwner =
    Boolean(thread?.isOwner) ||
    (activePersonaId && authorId && String(activePersonaId) === String(authorId));

  const getInitials = (username) => username?.substring(0, 2).toUpperCase() || 'A';

  const getTimeAgo = (date) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch {
      return 'Just now';
    }
  };

  // ✅ repost banner support
  const reposterPersona =
    thread?.repostedBy ||
    thread?.reposter ||
    (thread?.type === 'repost' ? thread?.author : null);

  const repostedThread =
    thread?.repostedThread ||
    thread?.repost?.originalThread ||
    thread?.repost?.thread ||
    thread?.repost ||
    thread?.originalThread ||
    null;

  const imageUrls = thread?.images?.map((img) => img?.url || img).filter(Boolean) || [];

  const handleLike = async (e) => {
    e.stopPropagation();
    if (!threadId) return;

    try {
      await api.put(`/threads/${threadId}/like`);
      setIsLiked((v) => !v);
      setLikesCount((c) => (isLiked ? Math.max(0, c - 1) : c + 1));

      onUpdate?.(updateKey, {
        isLiked: !isLiked,
        likesCount: isLiked ? Math.max(0, likesCount - 1) : likesCount + 1,
      });
    } catch (error) {
      console.error('Failed to like thread:', error);
    }
  };

  const handleRepost = async (e) => {
    e.stopPropagation();
    if (!repostTargetId) return;

    try {
      const res = await api.put(`/threads/${repostTargetId}/repost`);
      const nextIsReposted = !!res?.isReposted;
      const nextCount = nextIsReposted ? repostCount + 1 : Math.max(0, repostCount - 1);

      setIsReposted(nextIsReposted);
      setRepostCount(nextCount);
      onUpdate?.(updateKey, { isReposted: nextIsReposted, repostCount: nextCount });
    } catch (error) {
      console.error('Failed to repost:', error);
    }
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!threadId) return;

    if (window.confirm('Are you sure you want to delete this thread?')) {
      try {
        await api.delete(`/threads/${threadId}`);
        onDelete?.(threadId);
      } catch (error) {
        console.error('Failed to delete thread:', error);
      }
    }
  };

  const handleImageClick = (e, index) => {
    e.stopPropagation();
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const renderQuotedPreview = () => {
    if (thread?.type !== 'quote' || !thread?.quotedThread) return null;

    const qt = thread.quotedThread;

    // ✅ deleted placeholder
    if (qt?.isDeleted) {
      return (
        <div className="mt-3 rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
          This post was deleted.
        </div>
      );
    }

    const originalId = qt?.id || qt?._id;

    // ✅ persona handle (works for public + anon)
    const originalAuthorHandle = qt?.author?.username || qt?.author?.handle;
    const originalAuthorLink = originalAuthorHandle ? `/@${originalAuthorHandle}` : null;

    const originalImages = Array.isArray(qt?.images) ? qt.images : [];
    const firstImageUrl = originalImages?.[0]?.url || originalImages?.[0] || '';

    return (
      <div
        className="mt-3 rounded-xl border bg-background/50 hover:bg-muted/30 transition-colors overflow-hidden"
        onClick={(e) => {
          e.stopPropagation();
          if (originalId) navigate(`/thread/${originalId}`);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            if (originalId) navigate(`/thread/${originalId}`);
          }
        }}
      >
        <div className="p-3">
          <div className="flex gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={qt?.author?.profilePic} alt={originalAuthorHandle || 'User'} />
              <AvatarFallback>{getInitials(originalAuthorHandle)}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                {originalAuthorLink ? (
                  <Link
                    to={originalAuthorLink}
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm font-semibold hover:underline truncate"
                  >
                    @{originalAuthorHandle}
                  </Link>
                ) : (
                  <span className="text-sm font-semibold">Anonymous</span>
                )}

                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {getTimeAgo(qt?.createdAt)}
                </span>
              </div>

              <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                <RichText text={qt?.content} enableHashtags />
              </p>

              {firstImageUrl ? (
                <div className="mt-2 rounded-lg overflow-hidden border bg-muted">
                  <img
                    src={firstImageUrl}
                    alt="Quoted thread media"
                    className="w-full max-h-56 object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderRepostedPreview = (t) => {
    if (!t || typeof t !== 'object') return null;

    const originalId = t?.id || t?._id;

    // ✅ deleted placeholder
    if (t?.isDeleted) {
      return (
        <div className="mt-3 rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
          This post was deleted.
        </div>
      );
    }

    const originalAuthorHandle = t?.author?.username || t?.author?.handle;
    const originalAuthorLink = originalAuthorHandle ? `/@${originalAuthorHandle}` : null;

    const originalImages = Array.isArray(t?.images) ? t.images : [];
    const firstImageUrl = originalImages?.[0]?.url || originalImages?.[0] || '';

    return (
      <div
        className="mt-3 rounded-xl border bg-background/50 hover:bg-muted/30 transition-colors overflow-hidden"
        onClick={(e) => {
          e.stopPropagation();
          if (originalId) navigate(`/thread/${originalId}`);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            if (originalId) navigate(`/thread/${originalId}`);
          }
        }}
      >
        <div className="p-3">
          <div className="flex gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={t?.author?.profilePic} alt={originalAuthorHandle || 'User'} />
              <AvatarFallback>{getInitials(originalAuthorHandle)}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                {originalAuthorLink ? (
                  <Link
                    to={originalAuthorLink}
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm font-semibold hover:underline truncate"
                  >
                    @{originalAuthorHandle}
                  </Link>
                ) : (
                  <span className="text-sm font-semibold">Anonymous</span>
                )}

                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {getTimeAgo(t?.createdAt)}
                </span>
              </div>

              <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                <RichText text={t?.content} enableHashtags />
              </p>

              {firstImageUrl ? (
                <div className="mt-2 rounded-lg overflow-hidden border bg-muted">
                  <img
                    src={firstImageUrl}
                    alt="Reposted thread media"
                    className="w-full max-h-56 object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div
        className="border-b p-4 hover:bg-muted/50 cursor-pointer transition-colors"
        onClick={() => threadId && navigate(`/thread/${threadId}`)}
      >
        {/* ✅ Repost banner */}
        {thread?.type === 'repost' && (reposterPersona?.username || reposterPersona?.handle) ? (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Repeat2 className="h-4 w-4" />
            <span>Reposted by</span>
            <Link
              to={`/@${reposterPersona.username || reposterPersona.handle}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:underline"
            >
              @{reposterPersona.username || reposterPersona.handle}
            </Link>
          </div>
        ) : null}

        <div className="flex gap-3">
          {/* Avatar */}
          {authorLink ? (
            <Link to={authorLink} onClick={(e) => e.stopPropagation()}>
              <Avatar className="h-10 w-10">
                <AvatarImage src={thread?.author?.profilePic} alt={authorHandle || 'User'} />
                <AvatarFallback>{getInitials(authorHandle)}</AvatarFallback>
              </Avatar>
            </Link>
          ) : (
            <Avatar className="h-10 w-10">
              <AvatarImage src={thread?.author?.profilePic} alt="User" />
              <AvatarFallback>{getInitials(authorHandle)}</AvatarFallback>
            </Avatar>
          )}

          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  {authorLink ? (
                    <Link
                      to={authorLink}
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold hover:underline truncate"
                    >
                      @{authorHandle}
                    </Link>
                  ) : (
                    <span className="font-semibold">Unknown</span>
                  )}

                  <span className="text-sm text-muted-foreground">•</span>
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {getTimeAgo(thread?.createdAt)}
                  </span>

                  {/* ✅ removed Follow button */}
                </div>

                {thread?.author?.rollNumber ? (
                  <div className="text-xs text-muted-foreground truncate">{thread.author.rollNumber}</div>
                ) : null}
              </div>

              {/* Menu (delete only if active persona authored) */}
              {isOwner ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleDelete} className="text-red-600">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>

            {/* ✅ Body content (this was missing) */}
            {typeof thread?.content === 'string' && thread.content.trim().length > 0 ? (
              <div className="mt-2 text-sm whitespace-pre-wrap break-words">
                <RichText text={thread.content} enableHashtags />
              </div>
            ) : null}

            {/* ✅ Quote / Repost preview */}
            {thread?.type === 'quote' ? renderQuotedPreview() : null}
            {thread?.type === 'repost' ? renderRepostedPreview(repostedThread) : null}

            {/* ✅ Images */}
            {imageUrls.length > 0 ? (
              <div className="mt-3 grid gap-2 grid-cols-1 sm:grid-cols-2">
                {imageUrls.map((src, idx) => (
                  <img
                    key={src + idx}
                    src={src}
                    alt={`Thread image ${idx + 1}`}
                    className="w-full rounded-lg object-cover"
                    onClick={(e) => handleImageClick(e, idx)}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ))}
              </div>
            ) : null}

            {/* Videos */}
            {Array.isArray(thread?.videos) && thread.videos.length > 0 ? (
              <div className="mt-3 grid gap-2 grid-cols-1">
                {thread.videos.map((vid, idx) => (
                  <video
                    key={vid.url + idx}
                    src={vid.url}
                    poster={vid.thumbnail}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full rounded-lg"
                    onClick={(e) => e.stopPropagation()}
                  />
                ))}
              </div>
            ) : null}

            {/* Actions row */}
            <div className="mt-4 flex items-center gap-6 text-muted-foreground">
              <button onClick={handleLike} className="flex items-center gap-2 hover:text-red-500 transition-colors group">
                <Heart className={`h-5 w-5 ${isLiked ? 'fill-red-500 text-red-500' : ''} group-hover:scale-110 transition-transform`} />
                <span className="text-sm">{likesCount}</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  threadId && navigate(`/thread/${threadId}`);
                }}
                className="flex items-center gap-2 hover:text-blue-500 transition-colors group"
              >
                <MessageCircle className="h-5 w-5 group-hover:scale-110 transition-transform" />
                <span className="text-sm">{thread?.commentCount || 0}</span>
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <button
                    className={`flex items-center gap-2 transition-colors group ${
                      isReposted ? 'text-green-500' : 'hover:text-green-500'
                    }`}
                  >
                    <Repeat2 className="h-5 w-5 group-hover:scale-110 transition-transform" />
                    <span className="text-sm">{repostCount}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {!isReposted ? (
                    <DropdownMenuItem onClick={handleRepost} className="cursor-pointer">
                      Repost
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsQuoteOpen(true);
                    }}
                    className="cursor-pointer"
                  >
                    Quote
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      <QuoteRepostModal
        open={isQuoteOpen}
        onClose={() => setIsQuoteOpen(false)}
        threadId={threadId}
        onCreated={(created) => {
          setRepostCount((c) => c + 1);
          onUpdate?.(updateKey, { repostCount: repostCount + 1 });

          const createdId = created?.id || created?._id;
          if (createdId) navigate(`/thread/${createdId}`);
        }}
      />

      {lightboxOpen ? (
        <ImageLightbox images={imageUrls} initialIndex={lightboxIndex} onClose={() => setLightboxOpen(false)} />
      ) : null}
    </>
  );
}