import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/**
 * Compact embed card rendered inside a DM bubble when a thread has been shared.
 * Props:
 *   sharedThread: { id, content, images, type, isDeleted, author: { handle, displayName, profilePic, type } }
 */
export default function SharedThreadCard({ sharedThread }) {
  const navigate = useNavigate();

  if (!sharedThread) return null;

  if (sharedThread.isDeleted) {
    return (
      <div className="mt-1 mb-1 rounded-xl border bg-muted/20 px-3 py-2 text-sm text-muted-foreground italic">
        This post was deleted.
      </div>
    );
  }

  const { id, content, images, author } = sharedThread;
  const preview = (content || '').trim().slice(0, 120) + ((content || '').length > 120 ? '…' : '');
  const firstImage = images?.[0];

  const handleClick = (e) => {
    e.stopPropagation();
    navigate(`/thread/${id}`);
  };

  return (
    <div
      onClick={handleClick}
      className="mt-1 mb-1 rounded-xl border bg-background/60 hover:bg-muted/30 transition-colors cursor-pointer overflow-hidden"
    >
      {firstImage && (
        <div className="w-full h-28 overflow-hidden">
          <img
            src={firstImage.thumbnail || firstImage.url}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="px-3 py-2 space-y-1">
        {/* Author row */}
        <div className="flex items-center gap-1.5">
          <Avatar className="h-5 w-5 shrink-0">
            {author?.type === 'anon' ? (
              <AvatarFallback className="text-[10px]">?</AvatarFallback>
            ) : (
              <>
                <AvatarImage src={author?.profilePic} />
                <AvatarFallback className="text-[10px]">
                  {(author?.displayName || author?.handle || '?')[0].toUpperCase()}
                </AvatarFallback>
              </>
            )}
          </Avatar>
          <span className="text-xs font-semibold truncate">
            {author?.type === 'anon' ? 'Anonymous' : (author?.displayName || `@${author?.handle}`)}
          </span>
          {author?.type !== 'anon' && author?.handle && (
            <span className="text-xs text-muted-foreground truncate">@{author.handle}</span>
          )}
        </div>

        {/* Content preview */}
        {preview && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words leading-snug">
            {preview}
          </p>
        )}

        {/* Image count badge when no single thumbnail shown */}
        {!firstImage && images?.length > 0 && (
          <p className="text-xs text-muted-foreground">{images.length} image{images.length > 1 ? 's' : ''}</p>
        )}
      </div>
    </div>
  );
}
