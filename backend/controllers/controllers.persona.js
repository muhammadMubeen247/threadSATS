const mongoose = require('mongoose');
const Persona = require('../models/Persona');
const Thread = require('../models/Thread');
const Comment = require('../models/Comment'); // ✅ add
const { getViewerContext, assertAnonConfigured } = require('../utils/personaContext');

// helper: determine if viewer <-> target are blocked either way
const arePersonasBlockedEitherWay = async (viewerPersonaId, targetPersonaId) => {
  if (!viewerPersonaId || !targetPersonaId) return false;

  const [viewer, target] = await Promise.all([
    Persona.findById(viewerPersonaId).select('blocked').lean(),
    Persona.findById(targetPersonaId).select('blocked').lean(),
  ]);

  if (!viewer || !target) return false;

  const viewerBlocked = (viewer.blocked || []).some((id) => id.toString() === targetPersonaId.toString());
  const targetBlocked = (target.blocked || []).some((id) => id.toString() === viewerPersonaId.toString());

  return viewerBlocked || targetBlocked;
};

const normalizeHandle = (h) => (typeof h === 'string' ? h.trim().toLowerCase() : '');

const requireViewerContext = async (req, res) => {
  const ctx = await getViewerContext(req.user.id);
  if (!ctx) {
    res.status(404).json({ success: false, message: 'User not found' });
    return null;
  }

  if (ctx.activeMode === 'anon') {
    const ok = await assertAnonConfigured(ctx.user);
    if (!ok) {
      res.status(409).json({
        success: false,
        setupRequired: true,
        message: 'Anonymous persona setup required',
      });
      return null;
    }
  }

  return ctx;
};

const findPersonaByHandle = async (handle) => {
  return Persona.findOne({ handle }).select(
    '_id handle displayName profilePic coverPhoto bio type followers following blocked isConfigured rollNumber department batch'
  );
};

// ✅ viewer block set (blocked by me OR blocked me)
const getBlockedPersonaIdSetForViewer = async (viewerPersonaId) => {
  if (!viewerPersonaId) return new Set();

  const [me, blockedMe] = await Promise.all([
    Persona.findById(viewerPersonaId).select('blocked').lean(),
    Persona.find({ blocked: viewerPersonaId }).select('_id').lean(),
  ]);

  const set = new Set();
  for (const id of me?.blocked || []) set.add(id.toString());
  for (const p of blockedMe || []) set.add(p._id.toString());
  return set;
};

// ✅ collect involved persona ids in a thread doc (author + nested repost chain)
const collectPersonaIdsInThreadDoc = (doc) => {
  const ids = new Set();

  const walk = (t) => {
    if (!t) return;

    const authorId = typeof t.authorPersona === 'object' ? t.authorPersona?._id : t.authorPersona;
    if (authorId) ids.add(authorId.toString());

    if (t.repostOf && typeof t.repostOf === 'object') {
      walk(t.repostOf);
    }
  };

  walk(doc);
  return ids;
};

// ✅ minimal formatting to keep frontend stable and avoid leaking user linkage
const formatThreadItem = (t, viewerPersonaId, ownedPersonaIds, repostedTargetIdSet) => {
  const author = t.authorPersona && typeof t.authorPersona === 'object' ? t.authorPersona : null;

  const id = t._id?.toString?.() || t._id;
  const isLiked = viewerPersonaId ? (t.likes || []).some((p) => p.toString() === viewerPersonaId.toString()) : false;
  const isOwn = viewerPersonaId
    ? (author?._id?.toString?.() || author?._id) === viewerPersonaId.toString()
    : false;

  const base = {
    id,
    type: t.type || 'thread',
    content: t.content || '',
    images: t.images || [],
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,

    likesCount: (t.likes || []).length,
    commentCount: t.commentCount || 0,
    repostCount: t.repostCount || 0,

    isLiked,
    isReposted: repostedTargetIdSet ? repostedTargetIdSet.has(id.toString()) : false,
    isOwn,

    author: author
      ? {
          id: author._id,
          handle: author.handle,
          username: author.handle,
          displayName: author.displayName || author.handle,
          profilePic: author.profilePic || '',
          type: author.type,
        }
      : null,
  };

  // include repost target (already populated)
  if (t.type === 'repost' || t.type === 'quote') {
    base.repostOf = t.repostOf || null;
  }

  return base;
};

const formatCommentItem = (c, viewerPersonaId) => {
  const author = c.authorPersona && typeof c.authorPersona === 'object' ? c.authorPersona : null;

  return {
    id: c._id,
    type: 'reply',
    content: c.content || '',
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,

    likesCount: (c.likes || []).length,
    isLiked: viewerPersonaId ? (c.likes || []).some((p) => p.toString() === viewerPersonaId.toString()) : false,

    thread: c.threadId && typeof c.threadId === 'object' ? { id: c.threadId._id, content: c.threadId.content || '' } : null,

    parentComment: c.parentCommentId && typeof c.parentCommentId === 'object'
      ? {
          id: c.parentCommentId._id,
          content: c.parentCommentId.content || '',
          authorHandle:
            c.parentCommentId.authorPersona && typeof c.parentCommentId.authorPersona === 'object'
              ? c.parentCommentId.authorPersona.handle
              : null,
        }
      : null,

    author: author
      ? {
          id: author._id,
          handle: author.handle,
          username: author.handle,
          displayName: author.displayName || author.handle,
          profilePic: author.profilePic || '',
          type: author.type,
        }
      : null,
  };
};

// GET /api/personas/:handle/profile  (optionalAuth)
exports.getPersonaProfileByHandle = async (req, res) => {
  try {
    const handle = normalizeHandle(req.params.handle);
    if (!handle) return res.status(400).json({ success: false, message: 'Handle is required' });

    const persona = await findPersonaByHandle(handle);
    if (!persona) return res.status(404).json({ success: false, message: 'Profile not found' });

    // viewer context (optional)
    let viewerPersonaId = null;
    let ownedPersonaIds = [];

    if (req.user) {
      const ctx = await getViewerContext(req.user.id);
      viewerPersonaId = ctx?.activePersonaId || null;
      ownedPersonaIds = ctx?.ownedPersonaIds || [];

      if (viewerPersonaId) {
        const blocked = await arePersonasBlockedEitherWay(viewerPersonaId, persona._id);
        if (blocked) return res.status(403).json({ success: false, message: 'Cannot view this profile' });
      }
    }

    const threadsCount = await Thread.countDocuments({ authorPersona: persona._id, isDeleted: false });

    const isOwnProfile = ownedPersonaIds.some((id) => id.toString() === persona._id.toString());

    let isFollowing = false;
    let isBlocked = false;

    if (viewerPersonaId && !isOwnProfile) {
      const viewer = await Persona.findById(viewerPersonaId).select('following blocked').lean();
      if (viewer) {
        isFollowing = (viewer.following || []).some((id) => id.toString() === persona._id.toString());
        isBlocked = (viewer.blocked || []).some((id) => id.toString() === persona._id.toString());
      }
    }

    const safePII =
      persona.type === 'anon'
        ? { rollNumber: '', department: '', batch: '' }
        : {
            rollNumber: persona.rollNumber || '',
            department: persona.department || '',
            batch: persona.batch || '',
          };

    return res.status(200).json({
      success: true,
      persona: {
        id: persona._id,
        type: persona.type,
        username: persona.handle,
        handle: persona.handle,
        displayName: persona.displayName || persona.handle,
        profilePic: persona.profilePic || '',
        coverPhoto: persona.coverPhoto || '',
        bio: persona.bio || '',
        ...safePII,

        followersCount: (persona.followers || []).length,
        followingCount: (persona.following || []).length,
        threadsCount,

        isOwnProfile,
        isFollowing,
        isBlocked,
      },
    });
  } catch (error) {
    console.error('getPersonaProfileByHandle error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// POST /api/personas/:handle/follow
exports.followPersonaByHandle = async (req, res) => {
  try {
    const ctx = await requireViewerContext(req, res);
    if (!ctx) return;

    const handle = normalizeHandle(req.params.handle);
    if (!handle) return res.status(400).json({ success: false, message: 'Handle is required' });

    const target = await Persona.findOne({ handle }).select('_id');
    if (!target) return res.status(404).json({ success: false, message: 'Profile not found' });

    const viewerPersonaId = ctx.activePersonaId;

    if (target._id.toString() === viewerPersonaId.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot follow yourself' });
    }

    const blocked = await arePersonasBlockedEitherWay(viewerPersonaId, target._id);
    if (blocked) return res.status(403).json({ success: false, message: 'Cannot follow this profile' });

    await Promise.all([
      Persona.updateOne({ _id: viewerPersonaId }, { $addToSet: { following: target._id } }),
      Persona.updateOne({ _id: target._id }, { $addToSet: { followers: viewerPersonaId } }),
    ]);

    return res.status(200).json({ success: true, message: 'Followed successfully', isFollowing: true });
  } catch (error) {
    console.error('followPersonaByHandle error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// DELETE /api/personas/:handle/follow
exports.unfollowPersonaByHandle = async (req, res) => {
  try {
    const ctx = await requireViewerContext(req, res);
    if (!ctx) return;

    const handle = normalizeHandle(req.params.handle);
    if (!handle) return res.status(400).json({ success: false, message: 'Handle is required' });

    const target = await Persona.findOne({ handle }).select('_id');
    if (!target) return res.status(404).json({ success: false, message: 'Profile not found' });

    const viewerPersonaId = ctx.activePersonaId;

    if (target._id.toString() === viewerPersonaId.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot unfollow yourself' });
    }

    await Promise.all([
      Persona.updateOne({ _id: viewerPersonaId }, { $pull: { following: target._id } }),
      Persona.updateOne({ _id: target._id }, { $pull: { followers: viewerPersonaId } }),
    ]);

    return res.status(200).json({ success: true, message: 'Unfollowed successfully', isFollowing: false });
  } catch (error) {
    console.error('unfollowPersonaByHandle error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// POST /api/personas/:handle/block
exports.blockPersonaByHandle = async (req, res) => {
  try {
    const ctx = await requireViewerContext(req, res);
    if (!ctx) return;

    const handle = normalizeHandle(req.params.handle);
    if (!handle) return res.status(400).json({ success: false, message: 'Handle is required' });

    const target = await Persona.findOne({ handle }).select('_id');
    if (!target) return res.status(404).json({ success: false, message: 'Profile not found' });

    const viewerPersonaId = ctx.activePersonaId;

    if (target._id.toString() === viewerPersonaId.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot block yourself' });
    }

    // ✅ add to my blocked + remove any follow relationship BOTH ways
    await Promise.all([
      Persona.updateOne(
        { _id: viewerPersonaId },
        {
          $addToSet: { blocked: target._id },
          $pull: { following: target._id, followers: target._id },
        }
      ),
      Persona.updateOne(
        { _id: target._id },
        {
          $pull: { following: viewerPersonaId, followers: viewerPersonaId },
        }
      ),
    ]);

    return res.status(200).json({ success: true, message: 'Blocked successfully', isBlocked: true });
  } catch (error) {
    console.error('blockPersonaByHandle error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// DELETE /api/personas/:handle/block
exports.unblockPersonaByHandle = async (req, res) => {
  try {
    const ctx = await requireViewerContext(req, res);
    if (!ctx) return;

    const handle = normalizeHandle(req.params.handle);
    if (!handle) return res.status(400).json({ success: false, message: 'Handle is required' });

    const target = await Persona.findOne({ handle }).select('_id');
    if (!target) return res.status(404).json({ success: false, message: 'Profile not found' });

    await Persona.updateOne({ _id: ctx.activePersonaId }, { $pull: { blocked: target._id } });

    return res.status(200).json({ success: true, message: 'Unblocked successfully', isBlocked: false });
  } catch (error) {
    console.error('unblockPersonaByHandle error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ✅ GET /api/personas/:handle/threads (optionalAuth)
exports.getPersonaThreadsByHandle = async (req, res) => {
  try {
    const handle = normalizeHandle(req.params.handle);
    if (!handle) return res.status(400).json({ success: false, message: 'Handle is required' });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const targetPersona = await Persona.findOne({ handle }).select('_id type');
    if (!targetPersona) return res.status(404).json({ success: false, message: 'Profile not found' });

    let viewerPersonaId = null;
    let ownedPersonaIds = [];
    let blockedSet = new Set();

    if (req.user) {
      const ctx = await getViewerContext(req.user.id);
      viewerPersonaId = ctx?.activePersonaId || null;
      ownedPersonaIds = ctx?.ownedPersonaIds || [];
      blockedSet = await getBlockedPersonaIdSetForViewer(viewerPersonaId);

      if (viewerPersonaId && blockedSet.has(targetPersona._id.toString())) {
        return res.status(403).json({ success: false, message: 'Cannot view this content' });
      }
    }

    const query = {
      authorPersona: targetPersona._id,
      isDeleted: false,
      type: { $in: ['thread', 'repost', 'quote'] },
    };

    const total = await Thread.countDocuments(query);

    const docs = await Thread.find(query)
      .populate('authorPersona', 'handle displayName profilePic type')
      .populate({
        path: 'repostOf',
        match: { isDeleted: false },
        populate: [
          { path: 'authorPersona', select: 'handle displayName profilePic type' },
          {
            path: 'repostOf',
            match: { isDeleted: false },
            populate: { path: 'authorPersona', select: 'handle displayName profilePic type' },
          },
        ],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // viewer-specific: hide repost/quote chains that include blocked personas
    const visible = viewerPersonaId
      ? docs.filter((t) => {
          const involved = collectPersonaIdsInThreadDoc(t);
          for (const id of involved) if (blockedSet.has(id)) return false;
          return true;
        })
      : docs;

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
      .map((t) => formatThreadItem(t, viewerPersonaId, ownedPersonaIds, repostedTargetIdSet));

    return res.status(200).json({
      success: true,
      count: threads.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      threads,
    });
  } catch (error) {
    console.error('getPersonaThreadsByHandle error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ✅ GET /api/personas/:handle/likes (optionalAuth)
exports.getPersonaLikedThreadsByHandle = async (req, res) => {
  try {
    const handle = normalizeHandle(req.params.handle);
    if (!handle) return res.status(400).json({ success: false, message: 'Handle is required' });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const targetPersona = await Persona.findOne({ handle }).select('_id');
    if (!targetPersona) return res.status(404).json({ success: false, message: 'Profile not found' });

    let viewerPersonaId = null;
    let ownedPersonaIds = [];
    let blockedSet = new Set();

    if (req.user) {
      const ctx = await getViewerContext(req.user.id);
      viewerPersonaId = ctx?.activePersonaId || null;
      ownedPersonaIds = ctx?.ownedPersonaIds || [];
      blockedSet = await getBlockedPersonaIdSetForViewer(viewerPersonaId);

      if (viewerPersonaId && blockedSet.has(targetPersona._id.toString())) {
        return res.status(403).json({ success: false, message: 'Cannot view this content' });
      }
    }

    const query = { likes: targetPersona._id, isDeleted: false };
    const total = await Thread.countDocuments(query);

    const docs = await Thread.find(query)
      .populate('authorPersona', 'handle displayName profilePic type')
      .populate({
        path: 'repostOf',
        match: { isDeleted: false },
        populate: [
          { path: 'authorPersona', select: 'handle displayName profilePic type' },
          {
            path: 'repostOf',
            match: { isDeleted: false },
            populate: { path: 'authorPersona', select: 'handle displayName profilePic type' },
          },
        ],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const visible = viewerPersonaId
      ? docs.filter((t) => {
          const involved = collectPersonaIdsInThreadDoc(t);
          for (const id of involved) if (blockedSet.has(id)) return false;
          return true;
        })
      : docs;

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
      .map((t) => formatThreadItem(t, viewerPersonaId, ownedPersonaIds, repostedTargetIdSet));

    return res.status(200).json({
      success: true,
      count: threads.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      threads,
    });
  } catch (error) {
    console.error('getPersonaLikedThreadsByHandle error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ✅ GET /api/personas/:handle/replies (optionalAuth)
exports.getPersonaRepliesByHandle = async (req, res) => {
  try {
    const handle = normalizeHandle(req.params.handle);
    if (!handle) return res.status(400).json({ success: false, message: 'Handle is required' });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const targetPersona = await Persona.findOne({ handle }).select('_id');
    if (!targetPersona) return res.status(404).json({ success: false, message: 'Profile not found' });

    let viewerPersonaId = null;
    let blockedSet = new Set();

    if (req.user) {
      const ctx = await getViewerContext(req.user.id);
      viewerPersonaId = ctx?.activePersonaId || null;
      blockedSet = await getBlockedPersonaIdSetForViewer(viewerPersonaId);

      if (viewerPersonaId && blockedSet.has(targetPersona._id.toString())) {
        return res.status(403).json({ success: false, message: 'Cannot view this content' });
      }
    }

    const query = { authorPersona: targetPersona._id, isDeleted: false };
    const total = await Comment.countDocuments(query);

    let docs = await Comment.find(query)
      .populate('authorPersona', 'handle displayName profilePic type')
      .populate('threadId', 'content isDeleted')
      .populate({
        path: 'parentCommentId',
        select: 'content authorPersona',
        populate: { path: 'authorPersona', select: 'handle' },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // hide replies on deleted threads or threads where thread author is blocked (best-effort)
    docs = docs.filter((c) => c.threadId && c.threadId.isDeleted !== true);

    if (viewerPersonaId) {
      docs = docs.filter((c) => !blockedSet.has(c.authorPersona?._id?.toString()));
    }

    const replies = docs.map((c) => formatCommentItem(c, viewerPersonaId));

    return res.status(200).json({
      success: true,
      count: replies.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      replies,
    });
  } catch (error) {
    console.error('getPersonaRepliesByHandle error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};