import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/**
 * Compact embed card rendered alongside a DM bubble when a thread has been shared.
 * Props:
 *   sharedThread: { id, content, images, type, isDeleted, author: { handle, displayName, profilePic, type } }
 *   mine: boolean — aligns border accent color
 */
export default function SharedThreadCard({ sharedThread, mine }) {
  const navigate = useNavigate();

  if (!sharedThread) return null;

  if (sharedThread.isDeleted) {
    return (
      <div className="mb-1 rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground italic">
        This post was deleted.
      </div>
    );
  }

  const { id, content, images, author } = sharedThread;
  const preview = (content || '').trim().slice(0, 140) + ((content || '').length > 140 ? '…' : '');
  const firstImage = images?.[0];

  const handleClick = (e) => {
    e.stopPropagation();
    navigate(`/thread/${id}`);
  };

  return (
    <div
      onClick={handleClick}
      className="mb-1.5 w-full rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors cursor-pointer overflow-hidden shadow-sm"
    >
      {/* Image strip */}
      {firstImage && (
        <div className="w-full h-36 overflow-hidden">
          <img
            src={firstImage.thumbnail || firstImage.url}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Left accent bar + content */}
      <div className={`flex border-l-4 ${mine ? 'border-l-primary' : 'border-l-sky-500'}`}>
        <div className="px-3 py-2.5 space-y-1.5 min-w-0">
          {/* Author row */}
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6 shrink-0">
              <AvatarImage src={author?.profilePic} />
              <AvatarFallback className="text-[10px]">
                {(author?.displayName || author?.handle || '?')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-semibold truncate text-foreground">
              {author?.displayName || author?.handle || 'Unknown'}
            </span>
            {author?.handle && (
              <span className="text-[11px] text-muted-foreground truncate">@{author.handle}</span>
            )}
          </div>

          {/* Content preview */}
          {preview && (
            <p className="text-sm text-foreground/80 whitespace-pre-wrap break-words leading-snug">
              {preview}
            </p>
          )}

          {/* Image count when no strip */}
          {!firstImage && images?.length > 0 && (
            <p className="text-xs text-muted-foreground">{images.length} image{images.length > 1 ? 's' : ''}</p>
          )}
        </div>
      </div>
    </div>
  );
}
