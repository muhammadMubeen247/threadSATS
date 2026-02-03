// Same handle rules as backend
const MENTION_RX = /(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{2,30})\b/g;

/**
 * Tokenize text into pieces: plain text + mentions.
 * Keeps the prefix char (space/punctuation) as plain text.
 */
export function tokenizeMentions(text) {
  const s = typeof text === 'string' ? text : '';
  const out = [];

  let lastIndex = 0;
  let m;

  while ((m = MENTION_RX.exec(s)) !== null) {
    const full = m[0]; // includes prefix + @handle
    const prefix = m[1] || '';
    const handle = m[2];

    const matchStart = m.index;
    const matchEnd = matchStart + full.length;

    // text before match
    if (matchStart > lastIndex) {
      out.push({ type: 'text', value: s.slice(lastIndex, matchStart) });
    }

    // prefix as text
    if (prefix) out.push({ type: 'text', value: prefix });

    // mention link
    out.push({ type: 'mention', handle });

    lastIndex = matchEnd;
  }

  if (lastIndex < s.length) {
    out.push({ type: 'text', value: s.slice(lastIndex) });
  }

  return out;
}

/**
 * Find active mention query at caret.
 * Returns { start, end, query } where start points to '@' and end is caret.
 */
export function findActiveMentionAtCaret(text, caretIndex) {
  const s = typeof text === 'string' ? text : '';
  const caret = Math.max(0, Math.min(caretIndex ?? s.length, s.length));

  const before = s.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;

  // Must be start or preceded by non [a-zA-Z0-9_]
  const prev = at === 0 ? '' : before[at - 1];
  const prevOk = at === 0 || /[^a-zA-Z0-9_]/.test(prev);
  if (!prevOk) return null;

  const query = before.slice(at + 1);

  // query must be only [a-zA-Z0-9_]
  if (!/^[a-zA-Z0-9_]{0,30}$/.test(query)) return null;

  return { start: at, end: caret, query };
}