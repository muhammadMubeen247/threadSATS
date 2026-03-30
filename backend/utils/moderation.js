/**
 * Content moderation using OpenAI omni-moderation-latest.
 *
 * Severity tiers:
 *   Hard-reject (400, content NOT saved):
 *     sexual/minors, violence/graphic, self-harm/intent, self-harm/instructions
 *
 *   Soft-flag (content saved with flagged: true):
 *     harassment, harassment/threatening, hate, hate/threatening,
 *     sexual, self-harm, violence, illicit, illicit/violent
 */

const HARD_REJECT_CATEGORIES = new Set([
  'sexual/minors',
  'violence/graphic',
  'self-harm/intent',
  'self-harm/instructions',
  'harassment/threatening',
  'hate/threatening',
  'sexual',
]);

/**
 * Moderate text and/or images via OpenAI Moderation API.
 *
 * @param {Object} opts
 * @param {string}   [opts.text]           - Text content to moderate
 * @param {Buffer[]} [opts.imageBuffers]   - Array of image Buffers
 * @param {string[]} [opts.imageMimeTypes] - Corresponding MIME types (e.g. 'image/jpeg')
 * @returns {Promise<{ flagged: boolean, hardReject: boolean, softFlag: boolean, categories: object, rejectedCategories: string[] }>}
 */
async function moderate({ text, imageBuffers, imageMimeTypes } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[moderation] OPENAI_API_KEY not set — skipping moderation');
    return { flagged: false, hardReject: false, softFlag: false, categories: {}, rejectedCategories: [] };
  }

  // Build multi-modal input array
  const input = [];

  if (text && typeof text === 'string' && text.trim()) {
    input.push({ type: 'text', text: text.trim() });
  }

  if (Array.isArray(imageBuffers)) {
    for (let i = 0; i < imageBuffers.length; i++) {
      const buf = imageBuffers[i];
      const mime = imageMimeTypes?.[i] || 'image/jpeg';
      const base64 = buf.toString('base64');
      input.push({
        type: 'image_url',
        image_url: { url: `data:${mime};base64,${base64}` },
      });
    }
  }

  if (input.length === 0) {
    return { flagged: false, hardReject: false, softFlag: false, categories: {}, rejectedCategories: [] };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'omni-moderation-latest',
        input: input.length === 1 && input[0].type === 'text' ? input[0].text : input,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[moderation] OpenAI API error ${response.status}: ${errText}`);
      // Fail-open: don't block content if API is unhealthy
      return { flagged: false, hardReject: false, softFlag: false, categories: {}, rejectedCategories: [] };
    }

    const data = await response.json();
    const result = data.results?.[0];

    if (!result) {
      console.warn('[moderation] No results returned from OpenAI');
      return { flagged: false, hardReject: false, softFlag: false, categories: {}, rejectedCategories: [] };
    }

    if (!result.flagged) {
        console.log('[moderation] Content passed moderation');
      return { flagged: false, hardReject: false, softFlag: false, categories: result.categories, rejectedCategories: [] };
    }
    console.log('[moderation] Content flagged:', result.categories);

    // Content is flagged — determine severity
    const flaggedCategories = Object.entries(result.categories)
      .filter(([, v]) => v === true)
      .map(([k]) => k);

    const rejectedCategories = flaggedCategories.filter((c) => HARD_REJECT_CATEGORIES.has(c));
    const hardReject = rejectedCategories.length > 0;
    const softFlag = !hardReject;

    return {
      flagged: true,
      hardReject,
      softFlag,
      categories: result.categories,
      rejectedCategories,
    };
  } catch (err) {
    // Network error, timeout, etc. — fail-open
    console.error('[moderation] Moderation call failed:', err.message);
    return { flagged: false, hardReject: false, softFlag: false, categories: {}, rejectedCategories: [] };
  }
}

module.exports = { moderate };
