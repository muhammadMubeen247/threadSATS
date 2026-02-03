const Thread = require('../models/Thread');
const User = require('../models/User');
const mongoose = require('mongoose');
const { deleteMultipleFromCloudinary } = require('../utils/cloudinary');
const Persona = require('../models/Persona');
const { getViewerContext, assertAnonConfigured, ensurePersonasForUser } = require('../utils/personaContext');
const { resolveMentionsFromText } = require('../utils/mentions');

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
    likesCount: thread.likes?.length || 0,
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

    const thread = await Thread.create({
      content,
      authorPersona: ctx.activePersonaId,
      images: images || [],
      mentions: mentionedPersonaIds,
    });

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

    const thread = await Thread.findOne({ _id: threadId, isDeleted: false });
    if (!thread) return res.status(404).json({ success: false, message: 'Thread not found' });

    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    if (ctx.activeMode === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) return res.status(409).json({ success: false, setupRequired: true, message: 'Anonymous persona setup required' });
    }

    const personaId = ctx.activePersonaId.toString();
    const idx = (thread.likes || []).findIndex((id) => id.toString() === personaId);

    if (idx > -1) {
      thread.likes.splice(idx, 1);
      await thread.save();
      return res.status(200).json({ success: true, message: 'Thread unliked', isLiked: false, likesCount: thread.likes.length });
    }

    thread.likes.push(ctx.activePersonaId);
    await thread.save();
    return res.status(200).json({ success: true, message: 'Thread liked', isLiked: true, likesCount: thread.likes.length });
  } catch (error) {
    console.error('Toggle like error:', error);
    return res.status(500).json({ success: false, message: 'Server error while toggling like', error: error.message });
  }
};

// PUT /api/threads/:threadId/repost
exports.toggleRepost = async (req, res) => {
  try {
    const { threadId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ success: false, message: 'Invalid thread ID' });
    }

    const original = await Thread.findOne({ _id: threadId, isDeleted: false }).select('_id repostCount type');
    if (!original) return res.status(404).json({ success: false, message: 'Thread not found' });
    if (original.type==='repost') return res.status(400).json({success: false, message: 'Cannot repost a repost'});

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

    const target = await Thread.findOne({ _id: threadId, isDeleted: false }).select('_id');
    if (!target) return res.status(404).json({ success: false, message: 'Thread not found' });
    
    if (target.type==='repost') return res.status(400).json({success:false, message: 'Cannot quote a repost'});

    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    if (ctx.activeMode === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) return res.status(409).json({ success: false, setupRequired: true, message: 'Anonymous persona setup required' });
    }

    const quote = await Thread.create({
      type: 'quote',
      repostOf: threadId,
      authorPersona: ctx.activePersonaId,
      content: text,
      images: [],
    });

    await Thread.findByIdAndUpdate(threadId, { $inc: { repostCount: 1 } });

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