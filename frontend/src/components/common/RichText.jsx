import { Link } from 'react-router-dom';
import { tokenizeRichText } from '@/utils/richText';

export default function RichText({
  text,
  className = '',
  enableMentions = true,
  enableHashtags = true,
}) {
  const tokens = tokenizeRichText(text, { enableMentions, enableHashtags });

  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {tokens.map((t, idx) => {
        if (t.type === 'mention') {
          const handle = String(t.value || '').trim();
          return (
            <Link
              key={`m-${handle}-${idx}`}
              to={`/@${handle}`}
              // className="text-blue-500 dark:text-blue-400 font-semibold hover:underline"
              className="text-sky-500 dark:text-blue-400 font-semibold hover:underline"
              onClick={(e) => e.stopPropagation?.()}
            >
              @{handle}
            </Link>
          );
        }

        if (t.type === 'hashtag') {
          const tag = String(t.value || '').trim().toLowerCase();
          return (
            <Link
              key={`h-${tag}-${idx}`}
              to={`/hashtag/${tag}`}
              className="text-blue-500 dark:text-blue-400 font-semibold hover:underline"
              onClick={(e) => e.stopPropagation?.()}
            >
              #{tag}
            </Link>
          );
        }

        return <span key={idx}>{t.value}</span>;
      })}
    </span>
  );
}