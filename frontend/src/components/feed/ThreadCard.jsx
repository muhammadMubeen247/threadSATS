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

export default function ThreadCard({ thread, onDelete, onUpdate }) {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Original thread id (used to like/repost/detail nav)
  const threadId = thread?.id || thread?._id;

  // ✅ repost target is ALWAYS this card's id
  const repostTargetId = threadId;

  // ✅ do not force counts to 0; use the value returned by API
  // remove: const isCountedThread = thread?.type === 'thread';

  // Unique render key (used to update correct card in lists)
  // ✅ repost items now have their own id; don't use thread.repost.id (you no longer return that)
  const updateKey = useMemo(() => threadId, [threadId]);

  const [isLiked, setIsLiked] = useState(thread.isLiked || false);
  const [likesCount, setLikesCount] = useState(thread.likesCount || 0);

  const [isReposted, setIsReposted] = useState(thread.isReposted || false);
  const [repostCount, setRepostCount] = useState(thread.repostCount || 0);

  const [isFollowing, setIsFollowing] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isQuoteOpen, setIsQuoteOpen] = useState(false); // ✅ add

  useEffect(() => {
    setIsLiked(thread.isLiked || false);
    setLikesCount(thread.likesCount || 0);
    setIsReposted(thread.isReposted || false);
    setRepostCount(thread.repostCount || 0);
  }, [thread.isLiked, thread.likesCount, thread.isReposted, thread.repostCount]);

  // ✅ Use backend-provided ownership when available (persona-aware)
  const isOwner = Boolean(thread?.isOwner || thread?.isOwn) || user?._id === thread.author?._id || user?.id === thread.author?.id;

  const getInitials = (username) => {
    return username?.substring(0, 2).toUpperCase() || 'A';
  };

  const getTimeAgo = (date) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch {
      return 'Just now';
    }
  };

  // ✅ Embedded original card for quote reposts
  const renderQuotedPreview = () => {
    if (thread?.type !== 'quote' || !thread?.quotedThread) return null;

    const qt = thread.quotedThread;
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

              {/* Original content preview */}
              <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                {qt?.content}
              </p>

              {/* Optional thumbnail (like the screenshot’s embedded card) */}
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

  const renderRepostedPreview = () => {
    if (thread?.type !== 'repost' || !thread?.repostedThread) return null;

    const qt = thread.repostedThread;
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
                {qt?.content}
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

  const handleLike = async (e) => {
    e.stopPropagation();

    if (!threadId) {
      console.error('Thread ID is missing:', thread);
      return;
    }

    try {
      await api.put(`/threads/${threadId}/like`);
      setIsLiked((v) => !v);
      setLikesCount((c) => (isLiked ? c - 1 : c + 1));

      onUpdate?.(updateKey, {
        isLiked: !isLiked,
        likesCount: isLiked ? likesCount - 1 : likesCount + 1,
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

    if (!threadId) {
      console.error('Thread ID is missing:', thread);
      return;
    }

    if (window.confirm('Are you sure you want to delete this thread?')) {
      try {
        await api.delete(`/threads/${threadId}`);
        onDelete?.(threadId);
      } catch (error) {
        console.error('Failed to delete thread:', error);
      }
    }
  };

  const handleFollow = async (e) => {
    e.stopPropagation();

    // ✅ follow by persona handle (works for public + anon)
    const handle = thread?.author?.username || thread?.author?.handle;

    if (!handle) {
      console.error('Author handle is missing:', thread);
      return;
    }

    try {
      if (isFollowing) {
        await api.delete(`/personas/${handle}/follow`);
      } else {
        await api.post(`/personas/${handle}/follow`);
      }
      setIsFollowing(!isFollowing);
    } catch (error) {
      console.error('Failed to follow/unfollow:', error);
    }
  };

  const handleThreadClick = () => {
    if (threadId) navigate(`/thread/${threadId}`);
  };

  const handleImageClick = (e, index) => {
    e.stopPropagation();
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const imageUrls = thread.images?.map((img) => img.url || img) || [];

  // ✅ ADD THESE (they are currently missing, causing "authorLink is not defined")
  const authorHandle = thread?.author?.username || thread?.author?.handle;
  const authorLink = authorHandle ? `/@${authorHandle}` : null;

  return (
    <>
      <div
        className="border-b p-4 hover:bg-muted/50 cursor-pointer transition-colors"
        onClick={() => {
          if (threadId) navigate(`/thread/${threadId}`);
        }}
      >
        {/* Repost banner */}
        {thread?.type === 'repost' && thread?.repostedBy?.username ? (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Repeat2 className="h-4 w-4" />
            <span>Reposted by</span>
            <Link
              to={`/@${thread.repostedBy.username}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:underline"
            >
              @{thread.repostedBy.username}
            </Link>
          </div>
        ) : null}

        <div className="flex space-x-3">
          {/* Avatar */}
          {authorLink ? (
            <Link to={authorLink} onClick={(e) => e.stopPropagation()}>
              <Avatar className="h-10 w-10">
                <AvatarImage src={thread.author?.profilePic} alt={authorHandle || 'User'} />
                <AvatarFallback>{getInitials(authorHandle)}</AvatarFallback>
              </Avatar>
            </Link>
          ) : (
            <Avatar className="h-10 w-10">
              <AvatarImage src={thread.author?.profilePic} alt="User" />
              <AvatarFallback>{getInitials(authorHandle)}</AvatarFallback>
            </Avatar>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-start justify-between">
              {/* Left (name/time + roll number below) */}
              <div className="min-w-0 flex flex-col">
                {/* Row 1: name + time + follow */}
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
                    {getTimeAgo(thread.createdAt)}
                  </span>

                  {/* ✅ follow button visibility now shouldn’t depend on "isAnonymous"
                      (optional: you can keep/adjust follow behavior separately) */}
                  {!isOwner && authorHandle ? (
                    <>
                      <span className="text-sm text-muted-foreground">•</span>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-sm"
                        onClick={handleFollow}
                      >
                        {isFollowing ? 'Following' : 'Follow'}
                      </Button>
                    </>
                  ) : null}
                </div>

                {/* Row 2: roll number (only if backend provided it) */}
                {thread.author?.rollNumber ? (
                  <div className="text-xs text-muted-foreground truncate">
                    {thread.author.rollNumber}
                  </div>
                ) : null}
              </div>

              {/* Three-dot menu */}
              {isOwner && (
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
              )}
            </div>

            {/* Thread Content (don't render if empty, e.g. simple reposts) */}
            {typeof thread.content === 'string' && thread.content.trim().length > 0 ? (
              <p className="mt-2 text-sm whitespace-pre-wrap break-words">{thread.content}</p>
            ) : null}

            {/* ✅ Embedded preview for quote repost */}
            {renderQuotedPreview()}

            {/* ✅ Embedded preview for simple repost */}
            {renderRepostedPreview()}

            {/* Images (for normal thread / quote content images if you add later) */}
            {thread.images && Array.isArray(thread.images) && thread.images.length > 0 && (
              <div
                className={`mt-3 grid gap-2 ${
                  thread.images.length === 1
                    ? 'grid-cols-1'
                    : thread.images.length === 2
                      ? 'grid-cols-2'
                      : thread.images.length === 3
                        ? 'grid-cols-3'
                        : 'grid-cols-2'
                }`}
              >
                {thread.images.map((image, index) => (
                  <div
                    key={index}
                    className="relative overflow-hidden rounded-lg border bg-muted cursor-zoom-in"
                    onClick={(e) => handleImageClick(e, index)}
                  >
                    <img
                      src={image.url || image}
                      alt={`Thread image ${index + 1}`}
                      className="w-full h-full object-cover aspect-square hover:opacity-90 transition-opacity"
                      onError={(e) => {
                        console.error('Image failed to load:', image);
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center space-x-6 mt-3">
              {/* Like */}
              <button
                onClick={handleLike}
                className="flex items-center space-x-2 text-muted-foreground hover:text-red-500 transition-colors group"
              >
                <Heart
                  className={`h-5 w-5 ${
                    isLiked ? 'fill-red-500 text-red-500' : ''
                  } group-hover:scale-110 transition-transform`}
                />
                <span className="text-sm">{likesCount}</span>
              </button>

              {/* Comment */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (threadId) navigate(`/thread/${threadId}`);
                }}
                className="flex items-center space-x-2 text-muted-foreground hover:text-blue-500 transition-colors group"
              >
                <MessageCircle className="h-5 w-5 group-hover:scale-110 transition-transform" />
                <span className="text-sm">{thread.commentCount || 0}</span>
              </button>

              {/* Repost menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <button
                    className={`flex items-center space-x-2 transition-colors group ${
                      isReposted ? 'text-green-500' : 'text-muted-foreground hover:text-green-500'
                    }`}
                  >
                    <Repeat2 className="h-5 w-5 group-hover:scale-110 transition-transform" />
                    {/* ✅ show 0 on repost/quote cards */}
                    <span className="text-sm">{repostCount}</span>
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onClick={(e) => handleRepost(e)}
                    className="cursor-pointer"
                  >
                    Repost
                  </DropdownMenuItem>

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

      {/* Quote Repost Modal */}
      <QuoteRepostModal
        open={isQuoteOpen}
        onClose={() => setIsQuoteOpen(false)}
        threadId={threadId}   // ✅ quote THIS card, not the embedded original
        onCreated={(created) => {
          setRepostCount((c) => c + 1);
          onUpdate?.(updateKey, { repostCount: repostCount + 1 });

          const createdId = created?.id || created?._id;
          if (createdId) navigate(`/thread/${createdId}`);
        }}
      />

      {/* Image Lightbox */}
      {lightboxOpen && (
        <ImageLightbox
          images={imageUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}