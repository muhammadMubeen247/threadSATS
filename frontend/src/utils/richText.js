const MENTION_RX = /(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{2,30})\b/g;
const HASHTAG_RX = /(^|[^a-zA-Z0-9_])#([a-zA-Z0-9_]{2,30})\b/g;

function tokenizeWithRegex(text, rx, type) {
  const s = typeof text === 'string' ? text : '';
  const out = [];
  let lastIndex = 0;
  let m;

  while ((m = rx.exec(s)) !== null) {
    const full = m[0]; // includes prefix + token
    const prefix = m[1] || '';
    const value = m[2];

    const matchStart = m.index;
    const matchEnd = matchStart + full.length;

    if (matchStart > lastIndex) out.push({ type: 'text', value: s.slice(lastIndex, matchStart) });
    if (prefix) out.push({ type: 'text', value: prefix });

    out.push({ type, value });
    lastIndex = matchEnd;
  }

  if (lastIndex < s.length) out.push({ type: 'text', value: s.slice(lastIndex) });
  return out;
}

// ✅ ADD: mention-only tokenizer (used by MentionTextarea highlight layer)
export function tokenizeMentions(text) {
  const s = typeof text === 'string' ? text : '';
  return tokenizeWithRegex(s, new RegExp(MENTION_RX), 'mention');
}

// ✅ ADD: find active "@query" at caret (used by MentionTextarea autocomplete)
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

export function tokenizeRichText(text, { enableMentions = true, enableHashtags = true } = {}) {
  const s = typeof text === 'string' ? text : '';

  // Start with a single text token, then progressively tokenize
  let tokens = [{ type: 'text', value: s }];

  if (enableMentions) {
    tokens = tokens.flatMap((t) =>
      t.type === 'text' ? tokenizeWithRegex(t.value, new RegExp(MENTION_RX), 'mention') : [t]
    );
  }

  if (enableHashtags) {
    tokens = tokens.flatMap((t) =>
      t.type === 'text' ? tokenizeWithRegex(t.value, new RegExp(HASHTAG_RX), 'hashtag') : [t]
    );
  }

  return tokens;
}

export function findActiveHashtagAtCaret(text, caretIndex) {
  const s = typeof text === 'string' ? text : '';
  const caret = Math.max(0, Math.min(caretIndex ?? s.length, s.length));

  const before = s.slice(0, caret);
  const hash = before.lastIndexOf('#');
  if (hash === -1) return null;

  // Must be start or preceded by non [a-zA-Z0-9_]
  const prev = hash === 0 ? '' : before[hash - 1];
  const prevOk = hash === 0 || /[^a-zA-Z0-9_]/.test(prev);
  if (!prevOk) return null;

  const query = before.slice(hash + 1);

  // query must be only [a-zA-Z0-9_], allow empty while typing
  if (!/^[a-zA-Z0-9_]{0,30}$/.test(query)) return null;

  return { start: hash, end: caret, query };
}