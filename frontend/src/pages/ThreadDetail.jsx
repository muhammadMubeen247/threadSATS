import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  MoreVertical,
  Trash2,
  Heart,
  MessageCircle,
  Repeat2,
} from 'lucide-react';
import InfiniteScroll from 'react-infinite-scroll-component';
import Navbar from '@/components/layout/Navbar';
import useScrollDirection from '@/hooks/useScrollDirection';
import Sidebar from '@/components/layout/Sidebar';
import SuggestedUsers from '@/components/layout/SuggestedUsers';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/store/authStore';
import api from '@/api/axios';
import { formatDistanceToNow } from 'date-fns';
import QuoteRepostModal from '@/components/feed/QuoteRepostModal';
import MentionTextarea from '@/components/common/MentionTextarea';
import RichText from '@/components/common/RichText';

export default function ThreadDetail() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const scrollDir = useScrollDirection();

  // ✅ pull persona info too (so avatar works even when user is briefly null)
  const { user, personas, activeMode } = useAuthStore();

  // ✅ active persona (used for ownership checks)
  const activePersona = useMemo(() => {
    return (activeMode === 'anon' ? personas?.anon : personas?.public) || personas?.[activeMode] || null;
  }, [activeMode, personas]);

  // ✅ ADD THIS: fixes "commenterIdentity is not defined"
  const commenterIdentity = useMemo(() => {
    const p = activePersona;
    return {
      username: p?.handle || user?.username || user?.handle || '',
      profilePic: p?.profilePic || user?.profilePic || '',
    };
  }, [activePersona, user]);

  const [thread, setThread] = useState(null);
  const [comments, setComments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pagination for top-level comments
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalComments, setTotalComments] = useState(0);

  // Reply state - now includes parent tracking
  const [replyingTo, setReplyingTo] = useState(null); // { commentId, parentCommentId }
  const [replyText, setReplyText] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  // Loaded replies cache (per comment)
  const [loadedReplies, setLoadedReplies] = useState({});
  const [replyPages, setReplyPages] = useState({});
  const [hasMoreReplies, setHasMoreReplies] = useState({});
  const [loadingReplies, setLoadingReplies] = useState({});
  const [expandedComments, setExpandedComments] = useState({});

  const [quoteOpen, setQuoteOpen] = useState(false);

    // ✅ ADD: prevents ReferenceError + enables comment highlight from URL hash
  const [focusedCommentId, setFocusedCommentId] = useState(null);

  // ✅ ADD: when navigating to /thread/:id#comment-<commentId>, scroll + highlight
  useEffect(() => {
    const hash = String(location.hash || '');
    const m = hash.match(/^#comment-(.+)$/);

    if (!m?.[1]) {
      setFocusedCommentId(null);
      return;
    }

    const id = String(m[1]);
    setFocusedCommentId(id);

    const raf = window.requestAnimationFrame(() => {
      const el = document.getElementById(`comment-${id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const t = window.setTimeout(() => setFocusedCommentId(null), 2500);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [location.hash]);

  const threadType = thread?.type || 'thread';

  const isOwner = useMemo(() => {
    // Prefer backend truth when available
    if (thread?.isOwner === true) return true;

    const authorId = thread?.author?._id || thread?.author?.id;
    const activePersonaId = activePersona?._id || activePersona?.id;

    return !!authorId && !!activePersonaId && String(authorId) === String(activePersonaId);
  }, [thread, activePersona]);

  useEffect(() => {
    fetchThreadAndInitialComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  const getInitials = (username) => username?.substring(0, 2).toUpperCase() || 'A';

  const getTimeAgo = (date) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch {
      return 'Just now';
    }
  };

  const fetchThreadAndInitialComments = async () => {
    setIsLoading(true);
    try {
      const threadResponse = await api.get(`/threads/${threadId}`);
      setThread(threadResponse.thread);

      const commentsResponse = await api.get(`/threads/${threadId}/comments?page=1&limit=20`);
      setComments(commentsResponse.comments || []);
      setTotalComments(commentsResponse.total || 0);
      setHasMore(commentsResponse.page < commentsResponse.pages);
      setPage(2);
    } catch (error) {
      console.error('Failed to fetch thread:', error);
      setThread(null);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreComments = async () => {
    if (!hasMore || isLoading) return;
    try {
      const response = await api.get(`/threads/${threadId}/comments?page=${page}&limit=20`);
      setComments((prev) => [...prev, ...(response.comments || [])]);
      setHasMore(response.page < response.pages);
      setPage((prev) => prev + 1);
    } catch (error) {
      console.error('Failed to load more comments:', error);
    }
  };

  const handleLikeThread = async () => {
    if (!thread?.id) return;

    // Optimistic
    setThread((prev) => {
      if (!prev) return prev;
      const nextIsLiked = !prev.isLiked;
      const nextLikes = (prev.likesCount || 0) + (prev.isLiked ? -1 : 1);
      return { ...prev, isLiked: nextIsLiked, likesCount: Math.max(0, nextLikes) };
    });

    try {
      const res = await api.put(`/threads/${thread.id}/like`);
      setThread((prev) => (prev ? { ...prev, isLiked: !!res.isLiked, likesCount: res.likesCount } : prev));
    } catch (error) {
      console.error('Failed to like thread:', error);
      await fetchThreadAndInitialComments();
    }
  };

  const handleToggleRepost = async () => {
    if (!thread?.id) return;

    // Optimistic
    setThread((prev) => {
      if (!prev) return prev;
      const nextIsReposted = !prev.isReposted;
      const nextCount = (prev.repostCount || 0) + (prev.isReposted ? -1 : 1);
      return { ...prev, isReposted: nextIsReposted, repostCount: Math.max(0, nextCount) };
    });

    try {
      const res = await api.put(`/threads/${thread.id}/repost`);
      setThread((prev) => (prev ? { ...prev, isReposted: !!res.isReposted } : prev));
    } catch (error) {
      console.error('Failed to repost:', error);
      await fetchThreadAndInitialComments();
    }
  };

  const handleDeleteThread = async () => {
    if (!thread?.id) return;
    if (!window.confirm('Are you sure you want to delete this thread?')) return;

    try {
      await api.delete(`/threads/${thread.id}`);
      navigate(-1);
    } catch (error) {
      console.error('Failed to delete thread:', error);
    }
  };

  // Load replies for a specific comment
  const loadReplies = async (commentId) => {
    const currentPage = replyPages[commentId] || 1;
    setLoadingReplies((prev) => ({ ...prev, [commentId]: true }));

    try {
      const response = await api.get(`/comments/${commentId}/replies?page=${currentPage}&limit=10`);

      setLoadedReplies((prev) => ({
        ...prev,
        [commentId]: [...(prev[commentId] || []), ...(response.replies || [])],
      }));

      setReplyPages((prev) => ({ ...prev, [commentId]: currentPage + 1 }));

      setHasMoreReplies((prev) => ({ ...prev, [commentId]: response.hasMore }));

      setExpandedComments((prev) => ({ ...prev, [commentId]: true }));
    } catch (error) {
      console.error('Failed to load replies:', error);
    } finally {
      setLoadingReplies((prev) => ({ ...prev, [commentId]: false }));
    }
  };

  const toggleReplies = (commentId) => {
    setExpandedComments((prev) => ({ ...prev, [commentId]: !prev[commentId] }));
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await api.post(`/threads/${threadId}/comments`, { content: commentText.trim() });

      if (response.success) {
        setComments((prev) => [response.comment, ...prev]);
        setCommentText('');
        setTotalComments((prev) => prev + 1);
        setThread((prev) => (prev ? { ...prev, commentCount: (prev.commentCount || 0) + 1 } : prev));
      }
    } catch (error) {
      console.error('Failed to post comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateReplyInTree = (replies, targetCommentId, updater) => {
    return replies.map((reply) => {
      const replyId = reply._id || reply.id;

      if (replyId === targetCommentId) {
        return updater(reply);
      }

      const existingChildren = reply.replies || [];
      if (existingChildren.length > 0) {
        return { ...reply, replies: updateReplyInTree(existingChildren, targetCommentId, updater) };
      }

      return reply;
    });
  };

  const handleReplySubmit = async (commentId, parentCommentId) => {
    if (!replyText.trim()) return;

    setIsSubmittingReply(true);
    try {
      const response = await api.post(`/comments/${commentId}/reply`, { content: replyText.trim() });

      if (response.success) {
        const newReply = response.reply || response.comment;
        if (!newReply) {
          throw new Error('Reply payload missing from response');
        }

        if (!parentCommentId || parentCommentId === commentId) {
          setLoadedReplies((prev) => ({
            ...prev,
            [commentId]: [newReply, ...(prev[commentId] || [])],
          }));

          setComments((prev) =>
            prev.map((c) => ((c._id || c.id) === commentId ? { ...c, replyCount: (c.replyCount || 0) + 1 } : c))
          );
        } else {
          setLoadedReplies((prev) => {
            const nextRepliesForTarget = [newReply, ...(prev[commentId] || [])];

            // If loaded replies for the root parent are empty, seed from previewReplies
            // so expanding doesn't show a blank tree
            const parentLoaded = prev[parentCommentId];
            const parentBase = parentLoaded?.length
              ? parentLoaded
              : comments.find((c) => (c._id || c.id) === parentCommentId)?.previewReplies || [];

            return {
              ...prev,
              [commentId]: nextRepliesForTarget,
              [parentCommentId]: updateReplyInTree(parentBase, commentId, (reply) => ({
                ...reply,
                replyCount: (reply.replyCount || 0) + 1,
              })),
            };
          });
        }

        setReplyText('');
        setReplyingTo(null);
        setExpandedComments((prev) => ({
          ...prev,
          [commentId]: true,
          [parentCommentId || commentId]: true,
        }));
        setTotalComments((prev) => prev + 1);
        setThread((prev) => (prev ? { ...prev, commentCount: (prev.commentCount || 0) + 1 } : prev));
      }
    } catch (error) {
      console.error('Failed to post reply:', error);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const updateLikeInReplies = (replies, targetId, isLiked, likesCount) => {
    return replies.map((reply) => {
      const replyId = reply._id || reply.id;

      if (replyId === targetId) return { ...reply, isLiked, likesCount };

      if (reply.replies && reply.replies.length > 0) {
        return { ...reply, replies: updateLikeInReplies(reply.replies, targetId, isLiked, likesCount) };
      }

      return reply;
    });
  };

  const handleLikeComment = async (commentId) => {
    try {
      const toggleLike = (c) => {
        const id = c._id || c.id;
        if (id === commentId) {
          return {
            ...c,
            isLiked: !c.isLiked,
            likesCount: (c.likesCount || 0) + (c.isLiked ? -1 : 1),
          };
        }
        if (c.previewReplies?.length) {
          return { ...c, previewReplies: c.previewReplies.map(toggleLike) };
        }
        return c;
      };

      setComments((prev) => prev.map(toggleLike));

      setLoadedReplies((prev) => {
        const next = {};
        for (const key of Object.keys(prev)) {
          next[key] = prev[key].map(toggleLike);
        }
        return next;
      });

      await api.put(`/comments/${commentId}/like`);
    } catch (error) {
      console.error('Failed to like comment:', error);
      fetchThreadAndInitialComments();
    }
  };

  const deleteFromReplies = (replies, targetId) => {
    return replies
      .filter((reply) => (reply._id || reply.id) !== targetId)
      .map((reply) => {
        if (reply.replies && reply.replies.length > 0) {
          return { ...reply, replies: deleteFromReplies(reply.replies, targetId) };
        }
        return reply;
      });
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) return;

    try {
      await api.delete(`/comments/${commentId}`);

      setComments((prev) => prev.filter((c) => (c._id || c.id) !== commentId));

      setLoadedReplies((prev) => {
        const next = {};
        Object.keys(prev).forEach((key) => {
          next[key] = deleteFromReplies(prev[key], commentId);
        });
        return next;
      });

      setTotalComments((prev) => Math.max(0, prev - 1));
      setThread((prev) => (prev ? { ...prev, commentCount: Math.max(0, (prev.commentCount || 0) - 1) } : prev));
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  };

  const EmbeddedThreadPreview = ({ item, onOpen }) => {
    if (!item) return null;

    // ✅ deleted placeholder
    if (item?.isDeleted) {
      return (
        <div className="mt-3 rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
          This post was deleted.
        </div>
      );
    }

    const authorUsername = item?.author?.username;
    const authorLink = authorUsername ? `/@${authorUsername}` : null;
    const images = Array.isArray(item?.images) ? item.images : [];
    const firstImage = images?.[0]?.url || images?.[0] || '';

    return (
      <div
        className="mt-3 rounded-xl border bg-background/50 hover:bg-muted/30 transition-colors overflow-hidden cursor-pointer"
        onClick={onOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onOpen?.();
        }}
      >
        <div className="p-3">
          <div className="flex gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={item?.author?.profilePic} alt={authorUsername || 'User'} />
              <AvatarFallback>{getInitials(authorUsername)}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                {authorLink ? (
                  <Link to={authorLink} onClick={(e) => e.stopPropagation()} className="text-sm font-semibold hover:underline truncate">
                    @{authorUsername}
                  </Link>
                ) : (
                  <span className="text-sm font-semibold">Anonymous</span>
                )}

                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{getTimeAgo(item?.createdAt)}</span>
              </div>

              {item?.content ? (
                <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                  <RichText text={item.content} enableHashtags />
                </p>
              ) : null}

              {firstImage ? (
                <div className="mt-2 rounded-lg overflow-hidden border bg-muted">
                  <img
                    src={firstImage}
                    alt="Embedded media"
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
  const renderCommentItem = (comment, depth = 0, parentCommentId = null, parentAuthorUsername = null) => {
    if (!comment) return null;

    const commentId = comment._id || comment.id;
    const isCommentOwner = user?._id === (comment.author?._id || comment.author?.id);
    const rootParentId = depth === 0 ? commentId : parentCommentId;
    const commentAuthorUsername = comment.author?.username || '';
    const commentDisplayName = comment.author?.displayName || (commentAuthorUsername ? `@${commentAuthorUsername}` : 'Anonymous');
    const isExpanded = expandedComments[commentId];
    const replies = loadedReplies[commentId] || [];
    const previewReplies = comment.previewReplies || [];
    const hasLoadedReplies = replies.length > 0;
    const isLoadingReplies = loadingReplies[commentId];
    const totalReplies = comment.replyCount || 0;
    const visibleRepliesCount = isExpanded ? replies.length : previewReplies.length;
    const hiddenRepliesCount = Math.max(0, totalReplies - visibleRepliesCount);
    const hasVisibleReplies = (!isExpanded && previewReplies.length > 0) || (isExpanded && replies.length > 0);
    const showThreadLine = hasVisibleReplies || replyingTo?.commentId === commentId;

    return (
      <div
        id={`comment-${commentId}`}
        className={`relative ${focusedCommentId === String(commentId) ? 'rounded-2xl bg-sky-500/10 ring-1 ring-sky-500/40' : ''}`}
      >
        {/* Thread line: runs from avatar bottom to block bottom (connecting to child avatars) */}
        {showThreadLine ? (
          <div className="absolute left-5 top-10 bottom-0 w-px bg-border/50" />
        ) : null}

        {/* Comment row: avatar + content side by side */}
        <div className="flex gap-3">
          <div className="relative z-10 flex-shrink-0">
            <Avatar className="h-10 w-10 border border-border/70">
              <AvatarImage
                src={comment.isAnonymous ? '' : comment.author?.profilePic}
                alt={comment.isAnonymous ? 'Anonymous' : comment.author?.username}
              />
              <AvatarFallback>{comment.isAnonymous ? 'A' : getInitials(comment.author?.username)}</AvatarFallback>
            </Avatar>
          </div>

          <div className="min-w-0 flex-1 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="truncate text-sm font-semibold">{commentDisplayName}</span>
                  {commentAuthorUsername ? (
                    <span className="truncate text-sm text-muted-foreground">@{commentAuthorUsername}</span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{getTimeAgo(comment.createdAt)}</span>
                </div>
                {!comment.isAnonymous && comment.author?.rollNumber ? (
                  <div className="text-xs text-muted-foreground">{comment.author.rollNumber}</div>
                ) : null}
                {depth > 0 && parentAuthorUsername ? (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Replying to <Link to={`/@${parentAuthorUsername}`} className="text-sky-500 hover:underline">@{parentAuthorUsername}</Link>
                  </div>
                ) : null}
              </div>

              {isCommentOwner ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 -mt-1 rounded-full">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleDeleteComment(commentId)} className="text-red-600">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>

            <div className="mt-1 pr-2 text-sm leading-6 text-foreground">
              <RichText text={comment.content} enableHashtags={false} />
            </div>

            <div className="mt-3 flex items-center gap-5 text-xs text-muted-foreground">
              <button
                onClick={() => handleLikeComment(commentId)}
                className="flex items-center gap-1.5 transition-colors hover:text-red-500 group"
              >
                <Heart className={`h-4 w-4 ${comment.isLiked ? 'fill-red-500 text-red-500' : ''} group-hover:scale-110 transition-transform`} />
                <span>{comment.likesCount || 0}</span>
              </button>

              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground hover:text-primary"
                onClick={() => {
                  setReplyingTo({ commentId, parentCommentId: rootParentId });
                  setReplyText('');
                }}
              >
                <MessageCircle className="mr-1.5 h-4 w-4" />
                Reply
              </Button>
            </div>

            {replyingTo?.commentId === commentId ? (
              <div className="mt-3 rounded-2xl border border-border/70 bg-muted/10 p-3" dir="ltr">
                <div className="flex gap-3">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage
                      src={commenterIdentity.profilePic ? commenterIdentity.profilePic : undefined}
                      alt={commenterIdentity.username || 'User'}
                    />
                    <AvatarFallback>{getInitials(commenterIdentity.username)}</AvatarFallback>
                  </Avatar>

                  <div className="flex-1 space-y-3">
                    <MentionTextarea
                      placeholder="Post your reply"
                      value={replyText}
                      onValueChange={(v) => setReplyText(stripBidiControls(v))}
                      maxLength={500}
                      disabled={isSubmittingReply}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleReplySubmit(commentId, replyingTo.parentCommentId);
                        }
                      }}
                      className="min-h-[84px] resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 !text-left ![direction:ltr] ![unicode-bidi:isolate]"
                    />

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setReplyingTo(null);
                          setReplyText('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="rounded-full px-4"
                        onClick={() => handleReplySubmit(commentId, replyingTo.parentCommentId)}
                        disabled={isSubmittingReply || !replyText.trim()}
                      >
                        {isSubmittingReply ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
                        Reply
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Child replies — rendered flat (outside the flex row, same horizontal level) */}
        {!isExpanded && previewReplies.length > 0
          ? previewReplies.filter(Boolean).map((reply) => (
              <div key={reply._id || reply.id}>
                {renderCommentItem(reply, depth + 1, rootParentId, commentAuthorUsername)}
              </div>
            ))
          : null}

        {isExpanded && hasLoadedReplies
          ? replies.filter(Boolean).map((reply) => (
              <div key={reply._id || reply.id}>
                {renderCommentItem(reply, depth + 1, rootParentId, commentAuthorUsername)}
              </div>
            ))
          : null}

        {/* Show / Hide replies controls */}
        {totalReplies > 0 ? (
          <div className="ml-[52px] mt-1 pb-1 text-xs">
            {!isExpanded && hiddenRepliesCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-primary hover:underline"
                onClick={() => {
                  if (!hasLoadedReplies) loadReplies(commentId);
                  else toggleReplies(commentId);
                }}
                disabled={isLoadingReplies}
              >
                {isLoadingReplies ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Loading replies...
                  </>
                ) : (
                  'Show replies'
                )}
              </Button>
            ) : null}

            {depth === 0 && isExpanded ? (
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-xs text-muted-foreground hover:text-primary"
                  onClick={() => toggleReplies(commentId)}
                >
                  Hide replies
                </Button>

                {hasMoreReplies[commentId] ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-xs text-primary hover:underline"
                    onClick={() => loadReplies(commentId)}
                    disabled={isLoadingReplies}
                  >
                    {isLoadingReplies ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'Show more replies'
                    )}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto flex flex-col lg:flex-row">
          <aside className="hidden lg:block w-64 shrink-0">
            <Sidebar />
          </aside>
          <main className="flex-1 lg:border-x min-h-[calc(100vh-4rem)]">
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </main>
          <aside className="hidden xl:block w-80 shrink-0">
            <SuggestedUsers />
          </aside>
        </div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto flex flex-col lg:flex-row">
          <aside className="hidden lg:block w-64 shrink-0">
            <Sidebar />
          </aside>
          <main className="flex-1 lg:border-x min-h-[calc(100vh-4rem)]">
            <div className="p-8 text-center text-muted-foreground">Thread not found</div>
          </main>
          <aside className="hidden xl:block w-80 shrink-0">
            <SuggestedUsers />
          </aside>
        </div>
      </div>
    );
  }

  const embedded =
    threadType === 'quote' ? thread.quotedThread : threadType === 'repost' ? thread.repostedThread : null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto flex flex-col lg:flex-row">
        <aside className="hidden lg:block w-64 shrink-0">
          <Sidebar />
        </aside>

        <main className="flex-1 lg:border-x min-h-[calc(100vh-4rem)]">
          <div className={`sticky z-10 bg-background/95 backdrop-blur border-b p-4 flex items-center space-x-4 transition-[top] duration-300 ${scrollDir === 'down' ? 'top-0' : 'top-16'}`}>
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="font-semibold text-lg">Thread</h1>
          </div>

          <div className="border-b p-4">
            {/* Repost banner (detail) */}
            {threadType === 'repost' && thread?.repostedBy?.username ? (
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Repeat2 className="h-4 w-4" />
                <span>Reposted by</span>
                <Link to={`/@${thread.repostedBy.username}`} className="hover:underline">
                  @{thread.repostedBy.username}
                </Link>
              </div>
            ) : null}

            <div className="flex space-x-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={thread.isAnonymous ? '' : thread.author?.profilePic} alt={thread.author?.username} />
                <AvatarFallback>{thread.isAnonymous ? 'A' : getInitials(thread.author?.username)}</AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold truncate">
                        {thread.isAnonymous ? 'Anonymous' : `@${thread.author?.username}`}
                      </span>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {getTimeAgo(thread.createdAt)}
                      </span>
                    </div>
                    {!thread.isAnonymous && thread.author?.rollNumber ? (
                      <div className="text-xs text-muted-foreground">{thread.author.rollNumber}</div>
                    ) : null}
                  </div>

                  {isOwner ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleDeleteThread} className="text-red-600">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>

                {/* Main content (hide if empty, e.g. simple repost) */}
                {typeof thread.content === 'string' && thread.content.trim().length > 0 ? (
                  <p className="mt-2 text-base">
                    <RichText text={thread.content} enableHashtags />
                  </p>
                ) : null}

                {/* Embedded preview for quote/repost */}
                {embedded ? (
                  <EmbeddedThreadPreview
                    item={embedded}
                    onOpen={() => {
                      const embeddedId = embedded?.id || embedded?._id;
                      if (embeddedId) navigate(`/thread/${embeddedId}`);
                    }}
                  />
                ) : null}

                {/* Images for this thread (normal threads, or quote content images if you add later) */}
                {Array.isArray(thread.images) && thread.images.length > 0 ? (
                  <div className="mt-3 grid gap-2 grid-cols-1 sm:grid-cols-2">
                    {thread.images.map((image, index) => (
                      <img
                        key={index}
                        src={image.url || image}
                        alt={`Thread image ${index + 1}`}
                        className="w-full rounded-lg object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ))}
                  </div>
                ) : null}

                {/* Videos */}
                {Array.isArray(thread.videos) && thread.videos.length > 0 ? (
                  <div className="mt-3 grid gap-2 grid-cols-1">
                    {thread.videos.map((vid, index) => (
                      <video
                        key={index}
                        src={vid.url}
                        poster={vid.thumbnail}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full rounded-lg"
                      />
                    ))}
                  </div>
                ) : null}

                {/* Actions */}
                <div className="mt-4 flex items-center gap-6 text-sm text-muted-foreground">
                  <button
                    onClick={handleLikeThread}
                    className={`flex items-center gap-2 hover:text-red-500 transition-colors ${
                      thread.isLiked ? 'text-red-500' : ''
                    }`}
                  >
                    <Heart className={`h-5 w-5 ${thread.isLiked ? 'fill-red-500' : ''}`} />
                    <span>{thread.likesCount || 0}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-5 w-5" />
                    <span>{totalComments}</span>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={`flex items-center gap-2 hover:text-green-500 transition-colors ${
                          thread.isReposted ? 'text-green-500' : ''
                        }`}
                      >
                        <Repeat2 className="h-5 w-5" />
                        <span>{thread.repostCount || 0}</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={handleToggleRepost}>Repost</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setQuoteOpen(true)}>Quote</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <QuoteRepostModal
                  open={quoteOpen}
                  onClose={() => setQuoteOpen(false)}
                  threadId={thread.id}
                  onCreated={(created) => {
                    // backend increments repostCount on target; keep UI in sync
                    setThread((prev) => (prev ? { ...prev, repostCount: (prev.repostCount || 0) + 1 } : prev));

                    const createdId = created?.id || created?._id;
                    if (createdId) navigate(`/thread/${createdId}`);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Comment Input */}
          <div className="border-b p-4 bg-muted/20">
            <form onSubmit={handleCommentSubmit} className="space-y-3">
              <div className="flex space-x-3">
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarImage
                    // ✅ important: use undefined when missing (avoid src="")
                    src={commenterIdentity.profilePic ? commenterIdentity.profilePic : undefined}
                    alt={commenterIdentity.username || 'User'}
                  />
                  <AvatarFallback>{getInitials(commenterIdentity.username)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <MentionTextarea
                    placeholder="Add a comment..."
                    value={commentText}
                    onValueChange={(v) => setCommentText(stripBidiControls(v))}
                    maxLength={500}
                    disabled={isSubmitting}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleCommentSubmit(e);
                      }
                    }}
                    className="min-h-[80px] resize-none !text-left ![direction:ltr] ![unicode-bidi:isolate]"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting || !commentText.trim()}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Comment
                </Button>
              </div>
            </form>
          </div>

          {/* Comments */}
          <div className="p-4">
            {comments.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No comments yet. Be the first to comment!</div>
            ) : (
              <InfiniteScroll
                dataLength={comments.length}
                next={loadMoreComments}
                hasMore={hasMore}
                loader={
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                }
                endMessage={
                  <p className="text-center text-sm text-muted-foreground py-4">
                    {comments.length > 0 ? 'No more comments' : ''}
                  </p>
                }
              >
                <div className="divide-y divide-border/70">
                  {comments.filter(Boolean).map((comment) => (
                    <div key={comment._id || comment.id} className="py-4 first:pt-0 last:pb-0">
                      {renderCommentItem(comment, 0, null, null)}
                    </div>
                  ))}
                </div>
              </InfiniteScroll>
            )}
          </div>
        </main>

        <aside className="hidden xl:block w-80 shrink-0">
          <SuggestedUsers />
        </aside>
      </div>
    </div>
  );
}

const stripBidiControls = (s) =>
  (s || '').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');