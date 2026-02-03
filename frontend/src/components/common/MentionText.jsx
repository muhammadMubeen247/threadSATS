import { Link } from 'react-router-dom';
import { tokenizeMentions } from '@/utils/mentions';

export default function MentionText({ text, className = '' }) {
  const tokens = tokenizeMentions(text);

  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {tokens.map((t, idx) => {
        if (t.type === 'mention') {
          const handle = String(t.handle || '').trim();
          return (
            <Link
              key={`${handle}-${idx}`}
              to={`/@${handle}`}
              className="text-cyan-600 dark:text-cyan-400 font-semibold hover:underline"
              onClick={(e) => e.stopPropagation?.()}
            >
              @{handle}
            </Link>
          );
        }
        return <span key={idx}>{t.value}</span>;
      })}
    </span>
  );
}