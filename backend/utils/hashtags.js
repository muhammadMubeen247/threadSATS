const HASHTAG_RX = /(^|[^a-zA-Z0-9_])#([a-zA-Z0-9_]{2,30})\b/g;

function extractHashtags(text) {
  const s = typeof text === 'string' ? text : '';
  const set = new Set();

  let m;
  while ((m = HASHTAG_RX.exec(s)) !== null) {
    const tag = String(m[2] || '').toLowerCase();
    if (tag) set.add(tag);
  }

  return [...set];
}

module.exports = { extractHashtags };