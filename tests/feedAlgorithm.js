const DEFAULT_BASE_URL = 'http://localhost:5000/api';

const ACCOUNTS = [
  {
    email: 'fa22-bcs-112@cuilahore.edu.pk',
    password: 'pottypottypotty',
    anonHandle: 'seed_anon_112',
    anonDisplayName: 'Seed Anon 112',
  },
  {
    email: 'fa22-bcs-128@cuilahore.edu.pk',
    password: 'pottypottypotty',
    anonHandle: 'seed_anon_128',
    anonDisplayName: 'Seed Anon 128',
  },
  {
    email: 'fa22-bcs-116@cuilahore.edu.pk',
    password: 'pottypottypotty',
    anonHandle: 'seed_anon_116',
    anonDisplayName: 'Seed Anon 116',
  },
];

const TOPICS = [
  {
    slug: 'algorithms',
    title: 'algorithm lab prep',
    hashtags: ['#algorithms', '#comsats', '#studygroup'],
    details: [
      'sharing quick notes for recursion and greedy questions',
      'trying to tighten problem-solving speed before the quiz',
      'collecting the patterns that keep repeating in practice sets',
    ],
  },
  {
    slug: 'webdev',
    title: 'frontend iteration',
    hashtags: ['#webdev', '#frontend', '#threadsats'],
    details: [
      'checking responsive layouts on smaller devices tonight',
      'comparing interaction ideas for cleaner mobile navigation',
      'testing a couple of UI tweaks before finalizing the flow',
    ],
  },
  {
    slug: 'backend',
    title: 'backend cleanup',
    hashtags: ['#backend', '#nodejs', '#mongodb'],
    details: [
      'reviewing controller paths and response shapes for consistency',
      'making sure the indexes line up with the main feed queries',
      'double-checking edge cases around deletes and repost previews',
    ],
  },
  {
    slug: 'campus',
    title: 'campus routine',
    hashtags: ['#campus', '#studentlife', '#fa22'],
    details: [
      'the library feels unusually productive this week',
      'trying to balance project work with regular course prep',
      'looking for the quietest window to get solid work done',
    ],
  },
  {
    slug: 'ai',
    title: 'ai practice',
    hashtags: ['#ai', '#machinelearning', '#datascience'],
    details: [
      'reviewing feature ideas before training another baseline',
      'writing down the cases where the current ranking feels noisy',
      'comparing simple heuristics before adding more signals',
    ],
  },
  {
    slug: 'database',
    title: 'database review',
    hashtags: ['#database', '#sql', '#systems'],
    details: [
      'summarizing indexing tradeoffs from today\'s practice session',
      'cleaning up notes on joins, aggregation, and query plans',
      'keeping a shortlist of patterns that are worth memorizing',
    ],
  },
];

const COMMENT_TEMPLATES = [
  'That is a useful angle. I am adding it to my notes.',
  'This matches what I have been seeing as well.',
  'Good call. The main tradeoff here is worth testing properly.',
  'I would keep this approach, especially for a first pass.',
  'This seems stable enough for a seeded test run.',
  'I like the direction. It gives the feed better variation.',
];

const REPLY_TEMPLATES = [
  'Agreed. The signal is clearer once the noisy cases are filtered out.',
  'That is fair. I would keep it simple until real usage exposes gaps.',
  'Makes sense. A small tuning pass later should be enough.',
  'I tested a similar flow before and the simpler version held up better.',
  'That is probably the right tradeoff for this stage.',
  'Good point. We can validate it with a few more runs after seeding.',
];

function getBaseUrl() {
  const cliValue = process.argv[2];
  const envValue = process.env.FEED_SEED_BASE_URL;
  const raw = (cliValue || envValue || DEFAULT_BASE_URL).trim();
  return raw.replace(/\/+$/, '');
}

function getRunLabel() {
  const iso = new Date().toISOString().replace(/[.:]/g, '-');
  return `seed-${iso}`;
}

function getHandleSuffix() {
  return Date.now().toString().slice(-6);
}

function normalizeError(error) {
  if (error instanceof Error) return error;
  return new Error(String(error));
}

class ApiClient {
  constructor(baseUrl, email, password) {
    this.baseUrl = baseUrl;
    this.email = email;
    this.password = password;
    this.token = null;
    this.user = null;
    this.personas = null;
    this.activeMode = 'public';
  }

  async request(path, options = {}) {
    if (typeof fetch !== 'function') {
      throw new Error('Global fetch is not available. Run this script with Node 18 or newer.');
    }

    const method = options.method || 'GET';
    const headers = {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok || data.success === false) {
      const message = data.message || `${method} ${path} failed with ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = data;
      throw error;
    }

    return data;
  }

  async login() {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: {
        email: this.email,
        password: this.password,
      },
    });

    this.token = data.token;
    this.user = data.user;
    return data;
  }

  async fetchPersonas() {
    const data = await this.request('/users/me/personas');
    this.personas = data.personas;
    this.activeMode = data.activeMode || this.activeMode;
    return data.personas;
  }

  async setupAnonPersona({ handle, displayName, bio }) {
    const data = await this.request('/users/me/personas/anon/setup', {
      method: 'PUT',
      body: { handle, displayName, bio },
    });
    await this.fetchPersonas();
    return data.persona;
  }

  async setMode(mode) {
    if (this.activeMode === mode) return;

    await this.request('/users/me/mode', {
      method: 'PUT',
      body: { mode },
    });

    this.activeMode = mode;
  }

  async createThread(content) {
    const data = await this.request('/threads', {
      method: 'POST',
      body: { content },
    });
    return data.thread;
  }

  async likeThread(threadId) {
    return this.request(`/threads/${threadId}/like`, { method: 'PUT' });
  }

  async repostThread(threadId) {
    return this.request(`/threads/${threadId}/repost`, { method: 'PUT' });
  }

  async commentOnThread(threadId, content) {
    const data = await this.request(`/threads/${threadId}/comments`, {
      method: 'POST',
      body: { content },
    });
    return data.comment;
  }

  async replyToComment(commentId, content) {
    const data = await this.request(`/comments/${commentId}/reply`, {
      method: 'POST',
      body: { content },
    });
    return data.reply;
  }
}

function makeAnonBio(accountIndex, runLabel) {
  return `Anon persona for seeded feed interactions (${accountIndex + 1}, ${runLabel}).`;
}

function buildActorList(clients) {
  return clients.flatMap((client, accountIndex) => {
    const publicHandle = client.personas?.public?.handle || `public_${accountIndex + 1}`;
    const anonHandle = client.personas?.anon?.handle || `anon_${accountIndex + 1}`;

    return [
      {
        key: `account-${accountIndex + 1}-public`,
        label: `${publicHandle} [public]`,
        mode: 'public',
        accountIndex,
        client,
      },
      {
        key: `account-${accountIndex + 1}-anon`,
        label: `${anonHandle} [anon]`,
        mode: 'anon',
        accountIndex,
        client,
      },
    ];
  });
}

function buildThreadPlan(actors, runLabel) {
  const plan = [];

  for (let i = 0; i < actors.length; i += 1) {
    for (let variant = 0; variant < 3; variant += 1) {
      const topic = TOPICS[(i + variant) % TOPICS.length];
      const detail = topic.details[(i + variant) % topic.details.length];

      plan.push({
        actor: actors[i],
        content: [
          `${runLabel} ${topic.title} from ${actors[i].label}.`,
          detail,
          `${topic.hashtags.join(' ')} #feedseed #testrun`,
        ].join(' '),
      });
    }
  }

  return plan;
}

async function runAs(actor, action) {
  await actor.client.setMode(actor.mode);
  return action(actor.client);
}

async function ensureClientsReady(baseUrl, runLabel) {
  const clients = [];

  for (let index = 0; index < ACCOUNTS.length; index += 1) {
    const account = ACCOUNTS[index];
    const client = new ApiClient(baseUrl, account.email, account.password);

    await client.login();
    await client.fetchPersonas();

    if (!client.personas?.anon?.isConfigured) {
      const desiredHandle = `${account.anonHandle}_${getHandleSuffix()}`;
      try {
        await client.setupAnonPersona({
          handle: desiredHandle,
          displayName: account.anonDisplayName,
          bio: makeAnonBio(index, runLabel),
        });
      } catch (error) {
        if (error.status !== 400) throw error;

        await client.setupAnonPersona({
          handle: `${account.anonHandle}_${Date.now().toString().slice(-6)}`,
          displayName: account.anonDisplayName,
          bio: makeAnonBio(index, runLabel),
        });
      }
    }

    clients.push(client);
  }

  return clients;
}

async function seedThreads(actors, runLabel) {
  const plan = buildThreadPlan(actors, runLabel);
  const created = [];

  for (const item of plan) {
    const thread = await runAs(item.actor, (client) => client.createThread(item.content));
    created.push({
      id: thread.id,
      author: item.actor,
      content: thread.content,
    });
  }

  return created;
}

async function seedLikes(actors, threads) {
  let likes = 0;

  for (let i = 0; i < threads.length; i += 1) {
    const thread = threads[i];
    const candidates = [
      actors[(i + 1) % actors.length],
      actors[(i + 2) % actors.length],
      ...(i % 2 === 0 ? [actors[(i + 3) % actors.length]] : []),
    ].filter((actor, index, list) => {
      if (actor.key === thread.author.key) return false;
      return list.findIndex((entry) => entry.key === actor.key) === index;
    });

    for (const actor of candidates) {
      await runAs(actor, (client) => client.likeThread(thread.id));
      likes += 1;
    }
  }

  return likes;
}

async function seedComments(actors, threads, runLabel) {
  const createdComments = [];

  for (let i = 0; i < Math.min(12, threads.length); i += 1) {
    const thread = threads[i];
    const commenters = [actors[(i + 2) % actors.length], actors[(i + 4) % actors.length]].filter(
      (actor, index, list) =>
        actor.key !== thread.author.key && list.findIndex((entry) => entry.key === actor.key) === index
    );

    for (let j = 0; j < commenters.length; j += 1) {
      const template = COMMENT_TEMPLATES[(i + j) % COMMENT_TEMPLATES.length];
      const content = `${runLabel} ${template}`;
      const comment = await runAs(commenters[j], (client) => client.commentOnThread(thread.id, content));

      createdComments.push({
        id: comment.id,
        threadId: thread.id,
        actor: commenters[j],
      });
    }
  }

  return createdComments;
}

async function seedReplies(actors, comments, runLabel) {
  let replies = 0;

  for (let i = 0; i < Math.min(12, comments.length); i += 1) {
    const comment = comments[i];
    const replier = actors.find((actor, actorIndex) => {
      if (actor.key === comment.actor.key) return false;
      return actorIndex === (i + 3) % actors.length || actorIndex === (i + 5) % actors.length;
    }) || actors.find((actor) => actor.key !== comment.actor.key);

    const content = `${runLabel} ${REPLY_TEMPLATES[i % REPLY_TEMPLATES.length]}`;
    await runAs(replier, (client) => client.replyToComment(comment.id, content));
    replies += 1;
  }

  return replies;
}

async function seedReposts(actors, threads) {
  let reposts = 0;

  for (let i = 0; i < Math.min(9, threads.length); i += 1) {
    const thread = threads[i];
    const reposter = actors.find((actor, actorIndex) => {
      if (actor.key === thread.author.key) return false;
      return actorIndex === (i + 1) % actors.length || actorIndex === (i + 4) % actors.length;
    });

    if (!reposter) continue;

    await runAs(reposter, (client) => client.repostThread(thread.id));

    reposts += 1;
  }

  return reposts;
}

async function main() {
  const baseUrl = getBaseUrl();
  const runLabel = getRunLabel();

  console.log(`Using API base URL: ${baseUrl}`);
  console.log(`Run label: ${runLabel}`);

  const clients = await ensureClientsReady(baseUrl, runLabel);
  const actors = buildActorList(clients);

  const threads = await seedThreads(actors, runLabel);
  const likes = await seedLikes(actors, threads);
  const comments = await seedComments(actors, threads, runLabel);
  const replies = await seedReplies(actors, comments, runLabel);
  const reposts = await seedReposts(actors, threads);

  console.log('Seed complete.');
  console.log(JSON.stringify({
    accounts: clients.length,
    personas: actors.length,
    threads: threads.length,
    likes,
    comments: comments.length,
    replies,
    reposts,
    runLabel,
  }, null, 2));
}

main().catch((error) => {
  const normalized = normalizeError(error);
  console.error('Feed seed failed:', normalized.message);

  if (normalized.payload) {
    console.error(JSON.stringify(normalized.payload, null, 2));
  }

  process.exitCode = 1;
});