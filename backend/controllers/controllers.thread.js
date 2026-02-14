const Thread = require('../models/Thread');
const User = require('../models/User');
const mongoose = require('mongoose');
const { deleteMultipleFromCloudinary } = require('../utils/cloudinary');
const Persona = require('../models/Persona');
const { getViewerContext, assertAnonConfigured, ensurePersonasForUser } = require('../utils/personaContext');
const { resolveMentionsFromText } = require('../utils/mentions');
const { extractHashtags } = require('../utils/hashtags'); // ✅ add

const { upsertNotification } = require('../utils/notifications'); // ✅ add

const formatPersona = (p) => ({
  id: p?._id,
  username: p?.handle, // keep key name "username" for frontend compatibility
  displayName: p?.displayName || '',
  profilePic: p?.profilePic || '',
  rollNumber: p?.rollNumber || '',
  department: p?.department || (p?.type === 'anon' ? 'COMSATS Student' : ''),
  batch: p?.batch || '',
  type: p?.type || '',
});

const formatNormalThread = (thread, viewerPersonaId, ownedPersonaIds = []) => {
  const t = {
    id: thread._id,
    type: thread.type || 'thread',
    content: thread.content,
    images: thread.images,
    likes: thread.likes,

    // ✅ use stored likesCount when present
    likesCount:
      typeof thread.likesCount === 'number'
        ? thread.likesCount
        : (thread.likes?.length || 0),

    commentCount: thread.commentCount || 0,
    repostCount: thread.repostCount || 0,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  };

  t.author = formatPersona(thread.authorPersona);

  if (viewerPersonaId) {
    t.isLiked = (thread.likes || []).some((id) => id.toString() === viewerPersonaId.toString());
  }

  t.isOwner = ownedPersonaIds.includes(thread.authorPersona?._id?.toString());

  return t;
};

const resolveDisplayThread = (t) => {
  let cur = t;
  while (cur && cur.type === 'repost' && cur.repostOf && typeof cur.repostOf === 'object') {
    cur = cur.repostOf;
  }
  return cur || t;
};

const formatFeedItem = (doc, viewerPersonaId, ownedPersonaIds, repostedTargetIdSet) => {
  const docId = doc?._id?.toString();

  if (doc.type === 'quote' && doc.repostOf) {
    const quotedDisplay = resolveDisplayThread(doc.repostOf);
    const quote = formatNormalThread(doc, viewerPersonaId, ownedPersonaIds);

    return {
      ...quote,
      type: 'quote',
      quotedThread: formatNormalThread(quotedDisplay, viewerPersonaId, ownedPersonaIds),
      isReposted: viewerPersonaId ? repostedTargetIdSet.has(docId) : false,
    };
  }

  if (doc.type === 'repost' && doc.repostOf) {
    const repost = formatNormalThread(doc, viewerPersonaId, ownedPersonaIds);
    const repostedDisplay = resolveDisplayThread(doc.repostOf);

    return {
      ...repost,
      type: 'repost',
      repostedThread: formatNormalThread(repostedDisplay, viewerPersonaId, ownedPersonaIds),
      repostedBy: formatPersona(doc.authorPersona),
      isReposted: viewerPersonaId ? repostedTargetIdSet.has(docId) : false,
    };
  }

  const base = formatNormalThread(doc, viewerPersonaId, ownedPersonaIds);
  return {
    ...base,
    isReposted: viewerPersonaId ? repostedTargetIdSet.has(docId) : false,
  };
};

// POST /api/threads
exports.createThread = async (req, res) => {
  try {
    const { content, images } = req.body;

    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    if (ctx.activeMode === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) {
        return res.status(409).json({
          success: false,
          setupRequired: true,
          message: 'Anonymous persona setup required',
        });
      }
    }

    // ✅ mentions (optionally restrict by mode/type if you want)
    const { personaIds: mentionedPersonaIds } = await resolveMentionsFromText(content);
    const hashtags = extractHashtags(content);

    const thread = await Thread.create({
      content,
      authorPersona: ctx.activePersonaId,
      images: images || [],
      mentions: mentionedPersonaIds,
      hashtags,
    });

    // ✅ @mention notifications (aggregate per thread)
    if (Array.isArray(mentionedPersonaIds) && mentionedPersonaIds.length) {
      const unique = [...new Set(mentionedPersonaIds.map(String))];
      Promise.allSettled(
        unique.map((pid) =>
          upsertNotification({
            recipientPersonaId: pid,
            actorPersonaId: ctx.activePersonaId,
            type: 'mention',
            groupKey: `mention:thread:${thread._id}`,
            entityType: 'thread',
            entityId: thread._id,
          })
        )
      ).catch(() => {});
    }

    await thread.populate('authorPersona', 'handle displayName profilePic coverPhoto bio rollNumber department batch type');

    return res.status(201).json({
      success: true,
      message: 'Thread created successfully',
      thread: formatNormalThread(thread, ctx.activePersonaId, ctx.ownedPersonaIds),
    });
  } catch (error) {
    console.error('Create thread error:', error);
    return res.status(500).json({ success: false, message: 'Server error while creating thread', error: error.message });
  }
};

const collectPersonaIdsInThreadDoc = (doc) => {
  const ids = new Set();

  const walk = (t) => {
    if (!t) return;
    const authorId =
      typeof t.authorPersona === 'object' ? t.authorPersona?._id : t.authorPersona;

    if (authorId) ids.add(authorId.toString());

    if (t.repostOf && typeof t.repostOf === 'object') {
      walk(t.repostOf);
    }
  };

  walk(doc);
  return ids;
};

const getBlockedPersonaIdSetForViewer = async (viewerPersonaId) => {
  if (!viewerPersonaId) return new Set();

  const [me, blockedMe] = await Promise.all([
    Persona.findById(viewerPersonaId).select('blocked').lean(),
    Persona.find({ blocked: viewerPersonaId }).select('_id').lean(),
  ]);

  const set = new Set();
  for (const id of me?.blocked || []) set.add(id.toString());
  for (const p of blockedMe || []) set.add(p._id.toString());

  // also exclude self? not required, but harmless
  // set.add(viewerPersonaId.toString());

  return set;
};

// GET /api/threads
exports.getAllThreads = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = { isDeleted: false };
    const total = await Thread.countDocuments(query);

    const threads = await Thread.find(query)
      .populate('authorPersona', 'handle displayName profilePic rollNumber department batch type')
      .populate({
        path: 'repostOf',
        match: { isDeleted: false },
        populate: [
          { path: 'authorPersona', select: 'handle displayName profilePic rollNumber department batch type' },
          {
            path: 'repostOf',
            match: { isDeleted: false },
            populate: { path: 'authorPersona', select: 'handle displayName profilePic rollNumber department batch type' },
          },
        ],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    let viewerPersonaId = null;
    let ownedPersonaIds = [];
    let blockedSet = new Set();

    if (req.user) {
      const ctx = await getViewerContext(req.user.id);
      viewerPersonaId = ctx?.activePersonaId || null;
      ownedPersonaIds = ctx?.ownedPersonaIds || [];
      blockedSet = await getBlockedPersonaIdSetForViewer(viewerPersonaId);
    }

    // ✅ filter blocked content (author + nested repost chains)
    const visible = threads.filter((t) => {
      if (!viewerPersonaId) return true;
      const involved = collectPersonaIdsInThreadDoc(t);
      for (const id of involved) {
        if (blockedSet.has(id)) return false;
      }
      return true;
    });

    const targets = visible.map((t) => t._id).filter(Boolean);

    const repostedTargetIdSet = new Set();
    if (viewerPersonaId && targets.length) {
      const myReposts = await Thread.find({
        type: 'repost',
        authorPersona: viewerPersonaId,
        repostOf: { $in: targets },
        isDeleted: false,
      })
        .select('repostOf')
        .lean();

      for (const r of myReposts) repostedTargetIdSet.add(r.repostOf.toString());
    }

    const formatted = visible
      .filter((t) => (t.type === 'thread' ? true : !!t.repostOf))
      .map((t) => formatFeedItem(t, viewerPersonaId, ownedPersonaIds, repostedTargetIdSet));

    return res.status(200).json({
      success: true,
      count: formatted.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      threads: formatted,
    });
  } catch (error) {
    console.error('Get threads error:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching threads', error: error.message });
  }
};

// GET /api/threads/user/:userId
exports.getUserThreads = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const user = await ensurePersonasForUser(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let viewerPersonaId = null;
    let ownedPersonaIds = [];
    let blockedSet = new Set();

    if (req.user) {
      const ctx = await getViewerContext(req.user.id);
      viewerPersonaId = ctx?.activePersonaId || null;
      ownedPersonaIds = ctx?.ownedPersonaIds || [];
      blockedSet = await getBlockedPersonaIdSetForViewer(viewerPersonaId);

      // if viewer blocks this public persona or is blocked by it, deny the profile feed
      if (viewerPersonaId && blockedSet.has(user.publicPersonaId.toString())) {
        return res.status(403).json({ success: false, message: 'Cannot view this user profile' });
      }
    }

    const publicPersona = await Persona.findById(user.publicPersonaId).select(
      'handle displayName profilePic coverPhoto bio rollNumber department batch type'
    );

    const query = {
      authorPersona: user.publicPersonaId,
      isDeleted: false,
      type: { $in: ['thread', 'repost', 'quote'] },
    };

    const total = await Thread.countDocuments(query);

    const docs = await Thread.find(query)
      .populate('authorPersona', 'handle displayName profilePic rollNumber department batch type')
      .populate({
        path: 'repostOf',
        match: { isDeleted: false },
        populate: [
          { path: 'authorPersona', select: 'handle displayName profilePic rollNumber department batch type' },
          {
            path: 'repostOf',
            match: { isDeleted: false },
            populate: { path: 'authorPersona', select: 'handle displayName profilePic rollNumber department batch type' },
          },
        ],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // (viewer-specific filtering not necessary here because author is fixed public persona,
    // but we should still hide threads that repost/quote blocked people for the viewer)
    const visible = docs.filter((t) => {
      if (!viewerPersonaId) return true;
      const involved = collectPersonaIdsInThreadDoc(t);
      for (const id of involved) if (blockedSet.has(id)) return false;
      return true;
    });

    const repostedTargetIdSet = new Set();
    if (viewerPersonaId && visible.length) {
      const targets = visible.map((t) => t._id).filter(Boolean);
      const myReposts = await Thread.find({
        type: 'repost',
        authorPersona: viewerPersonaId,
        repostOf: { $in: targets },
        isDeleted: false,
      })
        .select('repostOf')
        .lean();

      for (const r of myReposts) repostedTargetIdSet.add(r.repostOf.toString());
    }

    const formattedThreads = visible
      .filter((t) => (t.type === 'thread' ? true : !!t.repostOf))
      .map((t) => formatFeedItem(t, viewerPersonaId, ownedPersonaIds, repostedTargetIdSet));

    return res.status(200).json({
      success: true,
      count: formattedThreads.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      user: {
        id: user._id,
        username: publicPersona?.handle || user.username,
        displayName: publicPersona?.displayName || user.username,
        profilePic: publicPersona?.profilePic || '',
        coverPhoto: publicPersona?.coverPhoto || '',
        bio: publicPersona?.bio || '',
        rollNumber: publicPersona?.rollNumber || user.rollNumber,
        department: publicPersona?.department || user.department,
        batch: publicPersona?.batch || user.batch,
      },
      threads: formattedThreads,
    });
  } catch (error) {
    console.error('Get user threads error:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching user threads', error: error.message });
  }
};

// GET /api/threads/:threadId
exports.getThreadById = async (req, res) => {
  try {
    const { threadId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ success: false, message: 'Invalid thread ID' });
    }

    const doc = await Thread.findOne({ _id: threadId, isDeleted: false })
      .populate('authorPersona', 'handle displayName profilePic rollNumber department batch type')
      .populate({
        path: 'repostOf',
        match: { isDeleted: false },
        populate: [
          { path: 'authorPersona', select: 'handle displayName profilePic rollNumber department batch type' },
          {
            path: 'repostOf',
            match: { isDeleted: false },
            populate: { path: 'authorPersona', select: 'handle displayName profilePic rollNumber department batch type' },
          },
        ],
      })
      .lean();

    if (!doc) return res.status(404).json({ success: false, message: 'Thread not found' });

    let viewerPersonaId = null;
    let ownedPersonaIds = [];
    let blockedSet = new Set();

    if (req.user) {
      const ctx = await getViewerContext(req.user.id);
      viewerPersonaId = ctx?.activePersonaId || null;
      ownedPersonaIds = ctx?.ownedPersonaIds || [];
      blockedSet = await getBlockedPersonaIdSetForViewer(viewerPersonaId);

      // ✅ deny if any involved persona is blocked
      const involved = collectPersonaIdsInThreadDoc(doc);
      for (const id of involved) {
        if (blockedSet.has(id)) {
          return res.status(403).json({ success: false, message: 'Cannot view this content' });
        }
      }
    }

    const repostedTargetIdSet = new Set();
    if (viewerPersonaId) {
      const myRepost = await Thread.findOne({
        type: 'repost',
        authorPersona: viewerPersonaId,
        repostOf: threadId,
        isDeleted: false,
      })
        .select('_id')
        .lean();

      if (myRepost) repostedTargetIdSet.add(threadId.toString());
    }

    return res.status(200).json({
      success: true,
      thread: formatFeedItem(doc, viewerPersonaId, ownedPersonaIds, repostedTargetIdSet),
    });
  } catch (error) {
    console.error('Get thread error:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching thread', error: error.message });
  }
};

// DELETE /api/threads/:threadId
exports.deleteThread = async (req, res) => {
  try {
    const { threadId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ success: false, message: 'Invalid thread ID' });
    }

    const thread = await Thread.findOne({ _id: threadId, isDeleted: false });
    if (!thread) return res.status(404).json({ success: false, message: 'Thread not found' });

    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    if (!ctx.ownedPersonaIds.includes(thread.authorPersona.toString())) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this thread' });
    }

    if (thread.images && thread.images.length > 0) {
      const publicIds = thread.images.map((img) => img.publicId);
      try {
        await deleteMultipleFromCloudinary(publicIds);
      } catch (cloudinaryError) {
        console.error('⚠️ Cloudinary deletion error:', cloudinaryError);
      }
    }

    thread.isDeleted = true;
    await thread.save();

    return res.status(200).json({ success: true, message: 'Thread deleted successfully' });
  } catch (error) {
    console.error('Delete thread error:', error);
    return res.status(500).json({ success: false, message: 'Server error while deleting thread', error: error.message });
  }
};

// PUT /api/threads/:threadId/like
exports.toggleLike = async (req, res) => {
  try {
    const { threadId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ success: false, message: 'Invalid thread ID' });
    }

    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    if (ctx.activeMode === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) {
        return res.status(409).json({
          success: false,
          setupRequired: true,
          message: 'Anonymous persona setup required',
        });
      }
    }

    const personaId = ctx.activePersonaId;

    // ✅ Try unlike first (only if currently liked) — ignore unlikes for notifications
    const unliked = await Thread.findOneAndUpdate(
      { _id: threadId, isDeleted: false, likes: personaId },
      { $pull: { likes: personaId }, $inc: { likesCount: -1 } },
      { new: true }
    ).select('likesCount');

    if (unliked) {
      return res.status(200).json({
        success: true,
        message: 'Thread unliked',
        isLiked: false,
        likesCount: Math.max(0, unliked.likesCount || 0),
      });
    }

    // ✅ Otherwise like (only if not already liked)
    const liked = await Thread.findOneAndUpdate(
      { _id: threadId, isDeleted: false, likes: { $ne: personaId } },
      { $addToSet: { likes: personaId }, $inc: { likesCount: 1 } },
      { new: true }
    ).select('likesCount authorPersona');

    if (!liked) {
      return res.status(404).json({ success: false, message: 'Thread not found' });
    }

    // ✅ notification (aggregate) — fire and forget
    upsertNotification({
      recipientPersonaId: liked.authorPersona,
      actorPersonaId: personaId,
      type: 'like',
      groupKey: `like:thread:${threadId}`,
      entityType: 'thread',
      entityId: threadId,
    }).catch((e) => console.error('notif upsert failed (like):', e));

    return res.status(200).json({
      success: true,
      message: 'Thread liked',
      isLiked: true,
      likesCount: liked.likesCount || 0,
    });
  } catch (error) {
    console.error('Toggle like error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while toggling like',
      error: error.message,
    });
  }
};

// PUT /api/threads/:threadId/repost
exports.toggleRepost = async (req, res) => {
  try {
    const { threadId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ success: false, message: 'Invalid thread ID' });
    }

    const original = await Thread.findOne({ _id: threadId, isDeleted: false }).select('_id repostCount type authorPersona');
    if (!original) return res.status(404).json({ success: false, message: 'Thread not found' });
    if (original.type === 'repost') return res.status(400).json({ success: false, message: 'Cannot repost a repost' });

    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    if (ctx.activeMode === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) return res.status(409).json({ success: false, setupRequired: true, message: 'Anonymous persona setup required' });
    }

    const existing = await Thread.findOne({
      type: 'repost',
      repostOf: threadId,
      authorPersona: ctx.activePersonaId,
      isDeleted: false,
    }).select('_id');

    if (existing) {
      await Thread.findByIdAndUpdate(existing._id, { isDeleted: true });
      await Thread.findByIdAndUpdate(threadId, { $inc: { repostCount: -1 } });

      return res.status(200).json({ success: true, message: 'Repost removed', isReposted: false });
    }

    const repost = await Thread.create({
      type: 'repost',
      repostOf: threadId,
      authorPersona: ctx.activePersonaId,
      content: '',
      images: [],
    });

    await Thread.findByIdAndUpdate(threadId, { $inc: { repostCount: 1 } });

    // ✅ notification (aggregate) — only when repost is created
    upsertNotification({
      recipientPersonaId: original.authorPersona,
      actorPersonaId: ctx.activePersonaId,
      type: 'repost',
      groupKey: `repost:thread:${threadId}`,
      entityType: 'thread',
      entityId: threadId,
      secondaryEntityId: repost._id,
    }).catch((e) => console.error('notif upsert failed (repost):', e));

    return res.status(201).json({ success: true, message: 'Reposted', isReposted: true, repostId: repost._id });
  } catch (error) {
    if (error?.code === 11000) return res.status(400).json({ success: false, message: 'Already reposted' });

    console.error('Toggle repost error:', error);
    return res.status(500).json({ success: false, message: 'Server error while toggling repost', error: error.message });
  }
};

// POST /api/threads/:threadId/quote
exports.createQuoteRepost = async (req, res) => {
  try {
    const { threadId } = req.params;
    const { content } = req.body;

    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ success: false, message: 'Invalid thread ID' });
    }

    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) return res.status(400).json({ success: false, message: 'Quote content is required' });

    const target = await Thread.findOne({ _id: threadId, isDeleted: false }).select('_id type authorPersona');
    if (!target) return res.status(404).json({ success: false, message: 'Thread not found' });

    if (target.type === 'repost') return res.status(400).json({ success: false, message: 'Cannot quote a repost' });

    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    if (ctx.activeMode === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) return res.status(409).json({ success: false, setupRequired: true, message: 'Anonymous persona setup required' });
    }

    const hashtags = extractHashtags(text);

    const quote = await Thread.create({
      type: 'quote',
      repostOf: threadId,
      authorPersona: ctx.activePersonaId,
      content: text,
      images: [],
      hashtags,
    });

    await Thread.findByIdAndUpdate(threadId, { $inc: { repostCount: 1 } });

    // ✅ notification (aggregate)
    upsertNotification({
      recipientPersonaId: target.authorPersona,
      actorPersonaId: ctx.activePersonaId,
      type: 'quote',
      groupKey: `quote:thread:${threadId}`,
      entityType: 'thread',
      entityId: threadId,
      secondaryEntityId: quote._id,
    }).catch((e) => console.error('notif upsert failed (quote):', e));

    await quote.populate('authorPersona', 'handle displayName profilePic rollNumber department batch type');
    await quote.populate({
      path: 'repostOf',
      match: { isDeleted: false },
      populate: [
        { path: 'authorPersona', select: 'handle displayName profilePic rollNumber department batch type' },
        {
          path: 'repostOf',
          match: { isDeleted: false },
          populate: { path: 'authorPersona', select: 'handle displayName profilePic rollNumber department batch type' },
        },
      ],
    });

    return res.status(201).json({
      success: true,
      message: 'Quote repost created',
      thread: formatFeedItem(quote, ctx.activePersonaId, ctx.ownedPersonaIds, new Set()),
    });
  } catch (error) {
    console.error('Create quote repost error:', error);
    return res.status(500).json({ success: false, message: 'Server error while creating quote repost', error: error.message });
  }
};

// GET /api/threads/feed/following
exports.getFollowingFeed = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    if (ctx.activeMode === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) return res.status(409).json({ success: false, setupRequired: true, message: 'Anonymous persona setup required' });
    }

    const mePersona = await Persona.findById(ctx.activePersonaId).select('following').lean();
    const followingPersonaIds = mePersona?.following || [];

    if (!followingPersonaIds.length) {
      return res.status(200).json({
        success: true,
        count: 0,
        total: 0,
        page,
        pages: 0,
        threads: [],
        message: 'Start following to see threads here!',
      });
    }

    const blockedSet = await getBlockedPersonaIdSetForViewer(ctx.activePersonaId);

    const baseQuery = { authorPersona: { $in: followingPersonaIds }, isDeleted: false };
    const total = await Thread.countDocuments(baseQuery);

    const threads = await Thread.find(baseQuery)
      .populate('authorPersona', 'handle displayName profilePic rollNumber department batch type')
      .populate({
        path: 'repostOf',
        match: { isDeleted: false },
        populate: [
          { path: 'authorPersona', select: 'handle displayName profilePic rollNumber department batch type' },
          {
            path: 'repostOf',
            match: { isDeleted: false },
            populate: { path: 'authorPersona', select: 'handle displayName profilePic rollNumber department batch type' },
          },
        ],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // ✅ filter blocked content (author + nested repost chains)
    const visible = threads.filter((t) => {
      const involved = collectPersonaIdsInThreadDoc(t);
      for (const id of involved) {
        if (blockedSet.has(id)) return false;
      }
      return true;
    });

    const targets = visible.map((t) => t._id).filter(Boolean);

    const repostedTargetIdSet = new Set();
    if (targets.length) {
      const myReposts = await Thread.find({
        type: 'repost',
        authorPersona: ctx.activePersonaId,
        repostOf: { $in: targets },
        isDeleted: false,
      })
        .select('repostOf')
        .lean();

      for (const r of myReposts) repostedTargetIdSet.add(r.repostOf.toString());
    }

    const formatted = visible
      .filter((t) => t.type === 'thread' || !!t.repostOf)
      .map((t) => formatFeedItem(t, ctx.activePersonaId, ctx.ownedPersonaIds, repostedTargetIdSet));

    return res.status(200).json({
      success: true,
      count: formatted.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      threads: formatted,
    });
  } catch (error) {
    console.error('Get following feed error:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching feed', error: error.message });
  }
};

// GET /api/threads/my
exports.getMyThreads = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    if (ctx.activeMode === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) return res.status(409).json({ success: false, setupRequired: true, message: 'Anonymous persona setup required' });
    }

    const query = {
      authorPersona: ctx.activePersonaId,
      isDeleted: false,
      type: { $in: ['thread', 'repost', 'quote'] },
    };

    const total = await Thread.countDocuments(query);

    const docs = await Thread.find(query)
      .populate('authorPersona', 'handle displayName profilePic rollNumber department batch type')
      .populate({
        path: 'repostOf',
        match: { isDeleted: false },
        populate: [
          { path: 'authorPersona', select: 'handle displayName profilePic rollNumber department batch type' },
          {
            path: 'repostOf',
            match: { isDeleted: false },
            populate: { path: 'authorPersona', select: 'handle displayName profilePic rollNumber department batch type' },
          },
        ],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const mePersona = await Persona.findById(ctx.activePersonaId).select(
      'handle displayName profilePic coverPhoto bio rollNumber department batch type followers following'
    );

    // assumes your file already has formatFeedItem()
    const formatted = docs
      .filter((t) => (t.type === 'thread' ? true : !!t.repostOf))
      .map((t) => formatFeedItem(t, ctx.activePersonaId, ctx.ownedPersonaIds, new Set()));

    return res.status(200).json({
      success: true,
      activeMode: ctx.activeMode,
      count: formatted.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      persona: {
        id: mePersona?._id,
        username: mePersona?.handle,
        displayName: mePersona?.displayName,
        profilePic: mePersona?.profilePic,
        coverPhoto: mePersona?.coverPhoto,
        bio: mePersona?.bio,
        followersCount: (mePersona?.followers || []).length,
        followingCount: (mePersona?.following || []).length,
      },
      threads: formatted,
    });
  } catch (error) {
    console.error('Get my threads error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// GET /api/trends?limit=10&windowDays=7&q=cs
exports.getTrends = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const windowDays = Math.min(Math.max(parseInt(req.query.windowDays) || 7, 1), 60);

    const qRaw = typeof req.query.q === 'string' ? req.query.q : '';
    const q = qRaw.trim().replace(/^#/, '').toLowerCase();

    const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    // Safety cap: max number of unique tags we’ll rank per request
    const RANK_CAP = 5000;

    const pipeline = [
      {
        $match: {
          isDeleted: false,
          createdAt: { $gte: windowStart },
          hashtags: { $exists: true, $ne: [] },
        },
      },
      { $unwind: '$hashtags' },
      { $group: { _id: '$hashtags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },

      // ✅ compute global rank in JS after we pull a capped sorted list
      { $limit: RANK_CAP },
    ];

    const rows = await Thread.aggregate(pipeline);

    // ✅ assign global rank (within windowDays)
    const rankedAll = rows.map((r, i) => ({
      tag: r._id,
      count: r.count,
      rank: i + 1,
    }));

    // ✅ apply search filter without changing the rank
    const filtered = q ? rankedAll.filter((x) => x.tag.startsWith(q)) : rankedAll;

    const results = filtered.slice(0, limit);

    return res.status(200).json({
      success: true,
      windowDays,
      q: q || '',
      count: results.length,
      totalRanked: rankedAll.length,
      results,
    });
  } catch (error) {
    console.error('getTrends error:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Server error', error: error.message });
  }
};

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/threads/hashtag/:tag?page=1&limit=20
exports.getThreadsByHashtag = async (req, res) => {
  try {
    const tag = String(req.params.tag || '').trim().replace(/^#/, '').toLowerCase();
    if (!tag || tag.length < 2 || tag.length > 30) {
      return res.status(400).json({ success: false, message: 'Invalid hashtag' });
    }

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const skip = (page - 1) * limit;

    const sort = String(req.query.sort || 'new').toLowerCase();
    const sortSpec =
      sort === 'top'
        ? { likesCount: -1, commentCount: -1, repostCount: -1, createdAt: -1 } // ✅ include likesCount
        : { createdAt: -1 }; // ✅ "new" (default)

    const ctx = await getViewerContext(req.user.id);
    const viewerPersonaId = ctx?.activePersonaId || null;
    const ownedPersonaIds = ctx?.ownedPersonaIds || [];

    const blockedSet = await getBlockedPersonaIdSetForViewer(viewerPersonaId);

    const query = { isDeleted: false, hashtags: tag };

    const total = await Thread.countDocuments(query);

    const docs = await Thread.find(query)
      .populate('authorPersona', 'handle displayName profilePic rollNumber department batch type')
      .populate({
        path: 'repostOf',
        match: { isDeleted: false },
        populate: [
          { path: 'authorPersona', select: 'handle displayName profilePic rollNumber department batch type' },
          {
            path: 'repostOf',
            match: { isDeleted: false },
            populate: { path: 'authorPersona', select: 'handle displayName profilePic rollNumber department batch type' },
          },
        ],
      })
      .sort(sortSpec) // ✅ use sort
      .skip(skip)
      .limit(limit)
      .lean();

    const visible = docs.filter((t) => {
      const involved = collectPersonaIdsInThreadDoc(t);
      for (const id of involved) if (blockedSet.has(id)) return false;
      return true;
    });

    const targets = visible.map((t) => t._id).filter(Boolean);

    const repostedTargetIdSet = new Set();
    if (viewerPersonaId && targets.length) {
      const myReposts = await Thread.find({
        type: 'repost',
        authorPersona: viewerPersonaId,
        repostOf: { $in: targets },
        isDeleted: false,
      })
        .select('repostOf')
        .lean();

      for (const r of myReposts) repostedTargetIdSet.add(r.repostOf.toString());
    }

    const threads = visible
      .filter((t) => (t.type === 'thread' ? true : !!t.repostOf))
      .map((t) => formatFeedItem(t, viewerPersonaId, ownedPersonaIds, repostedTargetIdSet));

    const pages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      tag,
      sort, // ✅ return sort
      count: threads.length,
      total,
      page,
      pages,
      hasMore: page < pages,
      threads,
    });
  } catch (error) {
    console.error('getThreadsByHashtag error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ✅ GET /api/threads/feed/batch
// Returns threads from personas in viewer's same (batch + department), e.g. FA22-BCS
exports.getBatchFeed = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const skip = (page - 1) * limit;

    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    // keep behavior consistent with other feeds
    if (ctx.activeMode === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) {
        return res.status(409).json({
          success: false,
          setupRequired: true,
          message: 'Anonymous persona setup required',
        });
      }
    }

    // viewer's batch/department come from User
    const viewerUser =
      ctx.user?.department && ctx.user?.batch
        ? ctx.user
        : await User.findById(req.user.id).select('department batch').lean();

    const department = viewerUser?.department || '';
    const batch = viewerUser?.batch || '';

    if (!department || !batch) {
      return res.status(400).json({ success: false, message: 'Department/batch not found for viewer' });
    }

    // ✅ only public + configured personas for "your batch"
    const personaIds = await Persona.distinct('_id', {
      type: 'public',
      isConfigured: true,
      department,
      batch,
    });

    if (!personaIds.length) {
      return res.status(200).json({
        success: true,
        count: 0,
        total: 0,
        page,
        pages: 0,
        threads: [],
        message: `No threads from ${batch}-${department} yet.`,
      });
    }

    const blockedSet = await getBlockedPersonaIdSetForViewer(ctx.activePersonaId);

    const query = {
      authorPersona: { $in: personaIds },
      isDeleted: false,
      type: { $in: ['thread', 'repost', 'quote'] },
    };

    const total = await Thread.countDocuments(query);

    const docs = await Thread.find(query)
      .populate('authorPersona', 'handle displayName profilePic rollNumber department batch type')
      .populate({
        path: 'repostOf',
        match: { isDeleted: false },
        populate: [
          { path: 'authorPersona', select: 'handle displayName profilePic rollNumber department batch type' },
          {
            path: 'repostOf',
            match: { isDeleted: false },
            populate: { path: 'authorPersona', select: 'handle displayName profilePic rollNumber department batch type' },
          },
        ],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // ✅ filter blocked content (author + nested repost chains)
    const visible = docs.filter((t) => {
      const involved = collectPersonaIdsInThreadDoc(t);
      for (const id of involved) if (blockedSet.has(id)) return false;
      return true;
    });

    // ✅ compute isReposted for viewer
    const targets = visible.map((t) => t._id).filter(Boolean);
    const repostedTargetIdSet = new Set();

    if (ctx.activePersonaId && targets.length) {
      const myReposts = await Thread.find({
        type: 'repost',
        authorPersona: ctx.activePersonaId,
        repostOf: { $in: targets },
        isDeleted: false,
      })
        .select('repostOf')
        .lean();

      for (const r of myReposts) repostedTargetIdSet.add(r.repostOf.toString());
    }

    const threads = visible
      .filter((t) => (t.type === 'thread' ? true : !!t.repostOf))
      .map((t) => formatFeedItem(t, ctx.activePersonaId, ctx.ownedPersonaIds, repostedTargetIdSet));

    return res.status(200).json({
      success: true,
      department,
      batch,
      batchKey: `${batch}-${department}`,
      count: threads.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      threads,
    });
  } catch (error) {
    console.error('getBatchFeed error:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching batch feed', error: error.message });
  }
};