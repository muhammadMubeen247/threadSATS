const Persona = require('../models/Persona');

const HANDLE_RX = /(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{2,30})\b/g;

function extractMentionHandles(text) {
  const s = typeof text === 'string' ? text : '';
  const set = new Set();
  let m;
  while ((m = HANDLE_RX.exec(s)) !== null) {
    set.add(m[2].toLowerCase());
  }
  return [...set];
}

async function resolveMentionsFromText(text, { allowedTypes = null } = {}) {
  const handles = extractMentionHandles(text);
  if (!handles.length) return { handles: [], personaIds: [] };

  const query = { handle: { $in: handles } };
  if (Array.isArray(allowedTypes) && allowedTypes.length) {
    query.type = { $in: allowedTypes }; // 'public' | 'anon'
  }

  const personas = await Persona.find(query).select('_id handle type').lean();
  const personaIds = personas.map((p) => p._id);

  return { handles, personaIds };
}

module.exports = { extractMentionHandles, resolveMentionsFromText };