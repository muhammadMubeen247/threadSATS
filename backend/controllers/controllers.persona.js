const mongoose = require('mongoose');
const Persona = require('../models/Persona');
const Thread = require('../models/Thread');
const Comment = require('../models/Comment'); // ✅ add
const User = require('../models/User');
const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');
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

const uploadBufferToCloudinary = async ({ buffer, folder, publicId }) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        overwrite: true,
        public_id: publicId,
      },
      (err, result) => (err ? reject(err) : resolve(result))
    );

    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

const formatPersonaListItem = (p, viewerFollowingSet) => {
  const id = p?._id?.toString?.() || p?._id;
  const isFollowing = viewerFollowingSet ? viewerFollowingSet.has(id.toString()) : false;

  return {
    id,
    type: p.type,
    handle: p.handle,
    username: p.handle, // frontend compatibility
    displayName: p.displayName || p.handle,
    profilePic: p.profilePic || '',

    // ✅ show rollNumber only for public personas
    rollNumber: p.type === 'public' ? p.rollNumber || '' : '',

    isFollowing,
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

// ✅ PUT /api/personas/me/handle
// Updates ACTIVE persona handle.
// If active persona is PUBLIC -> also sync User.username for compatibility.
exports.updateMyActivePersonaHandle = async (req, res) => {
  try {
    const ctx = await requireViewerContext(req, res);
    if (!ctx) return;

    const handle = normalizeHandle(req.body?.handle || req.body?.username);
    if (!handle) return res.status(400).json({ success: false, message: 'handle is required' });

    // enforce same rules you already use elsewhere
    if (!/^[a-z0-9_]+$/.test(handle)) {
      return res.status(400).json({ success: false, message: 'handle can only contain lowercase letters, numbers, and underscores' });
    }
    if (handle.length < 3 || handle.length > 20) {
      return res.status(400).json({ success: false, message: 'handle must be between 3 and 20 characters' });
    }

    const userId = ctx.user._id;
    const personaId = ctx.activePersonaId;

    const mePersona = await Persona.findOne({ _id: personaId, ownerUserId: userId }).select('_id type handle displayName');
    if (!mePersona) return res.status(404).json({ success: false, message: 'Persona not found' });

    // If anon is active, ensure configured (safe-guard)
    if (mePersona.type === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) return res.status(409).json({ success: false, setupRequired: true, message: 'Anonymous persona setup required' });
    }

    // unique among Personas
    const existsPersona = await Persona.findOne({ handle, _id: { $ne: mePersona._id } }).select('_id');
    if (existsPersona) return res.status(400).json({ success: false, message: 'Handle already taken' });

    // also avoid collision with User.username (keeps /@handle unambiguous and aligns with your earlier logic)
    const existsUser = await User.findOne({ username: handle, _id: { $ne: userId } }).select('_id');
    if (existsUser) return res.status(400).json({ success: false, message: 'Handle already taken' });

    mePersona.handle = handle;

    // optional: keep displayName aligned if it was identical-ish
    if (!mePersona.displayName || mePersona.displayName === mePersona.handle) {
      mePersona.displayName = handle;
    }

    await mePersona.save();

    // ✅ If this is the PUBLIC persona, also sync the actual User.username
    if (mePersona.type === 'public') {
      await User.updateOne({ _id: userId }, { $set: { username: handle } });
    }

    return res.status(200).json({
      success: true,
      message: 'Handle updated',
      persona: {
        id: mePersona._id,
        type: mePersona.type,
        handle: mePersona.handle,
        username: mePersona.handle,
        displayName: mePersona.displayName || mePersona.handle,
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: 'Handle already taken' });
    }
    console.error('updateMyActivePersonaHandle error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ✅ PUT /api/personas/me/bio
exports.updateMyActivePersonaBio = async (req, res) => {
  try {
    const ctx = await requireViewerContext(req, res);
    if (!ctx) return;

    const bioRaw = req.body?.bio;
    const bio = typeof bioRaw === 'string' ? bioRaw.trim() : '';

    if (bio.length > 150) {
      return res.status(400).json({ success: false, message: 'Bio cannot exceed 150 characters' });
    }

    const userId = ctx.user._id;
    const personaId = ctx.activePersonaId;

    const mePersona = await Persona.findOne({ _id: personaId, ownerUserId: userId }).select('_id type bio');
    if (!mePersona) return res.status(404).json({ success: false, message: 'Persona not found' });

    // anon safety
    if (mePersona.type === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) return res.status(409).json({ success: false, setupRequired: true, message: 'Anonymous persona setup required' });
    }

    mePersona.bio = bio;
    await mePersona.save();

    // keep old behavior: syncing User.bio only for public persona (optional but consistent with your existing system)
    if (mePersona.type === 'public') {
      await User.updateOne({ _id: userId }, { $set: { bio } });
    }

    return res.status(200).json({ success: true, message: 'Bio updated', bio: mePersona.bio || '' });
  } catch (error) {
    console.error('updateMyActivePersonaBio error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ✅ PUT /api/personas/me/profile-pic  (multipart/form-data: image)
exports.updateMyActivePersonaProfilePic = async (req, res) => {
  try {
    const ctx = await requireViewerContext(req, res);
    if (!ctx) return;

    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: 'No image uploaded. Send multipart/form-data with field name "image".' });
    }

    const userId = ctx.user._id;
    const personaId = ctx.activePersonaId;

    const mePersona = await Persona.findOne({ _id: personaId, ownerUserId: userId }).select('_id type profilePic');
    if (!mePersona) return res.status(404).json({ success: false, message: 'Persona not found' });

    if (mePersona.type === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) return res.status(409).json({ success: false, setupRequired: true, message: 'Anonymous persona setup required' });
    }

    const uploadResult = await uploadBufferToCloudinary({
      buffer: req.file.buffer,
      folder: 'threadsats/personas/profile_pics',
      publicId: `persona_${mePersona._id}_profile`,
    });

    mePersona.profilePic = uploadResult.secure_url;
    await mePersona.save();

    // optional sync: if public persona, also sync User.profilePic
    if (mePersona.type === 'public') {
      await User.updateOne({ _id: userId }, { $set: { profilePic: uploadResult.secure_url } });
    }

    return res.status(200).json({ success: true, message: 'Profile picture updated', profilePic: mePersona.profilePic });
  } catch (error) {
    console.error('updateMyActivePersonaProfilePic error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ✅ PUT /api/personas/me/cover-photo  (multipart/form-data: image)
exports.updateMyActivePersonaCoverPhoto = async (req, res) => {
  try {
    const ctx = await requireViewerContext(req, res);
    if (!ctx) return;

    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: 'No image uploaded. Send multipart/form-data with field name "image".' });
    }

    const userId = ctx.user._id;
    const personaId = ctx.activePersonaId;

    const mePersona = await Persona.findOne({ _id: personaId, ownerUserId: userId }).select('_id type coverPhoto');
    if (!mePersona) return res.status(404).json({ success: false, message: 'Persona not found' });

    if (mePersona.type === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) return res.status(409).json({ success: false, setupRequired: true, message: 'Anonymous persona setup required' });
    }

    const uploadResult = await uploadBufferToCloudinary({
      buffer: req.file.buffer,
      folder: 'threadsats/personas/cover_photos',
      publicId: `persona_${mePersona._id}_cover`,
    });

    mePersona.coverPhoto = uploadResult.secure_url;
    await mePersona.save();

    // optional sync: if public persona, also sync User.coverPhoto
    if (mePersona.type === 'public') {
      await User.updateOne({ _id: userId }, { $set: { coverPhoto: uploadResult.secure_url } });
    }

    return res.status(200).json({ success: true, message: 'Cover photo updated', coverPhoto: mePersona.coverPhoto });
  } catch (error) {
    console.error('updateMyActivePersonaCoverPhoto error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ✅ GET /api/personas/search?q=... (optionalAuth)
// handle prefix search using regex on indexed "handle"
exports.searchPersonas = async (req, res) => {
  try {
    const rawQ = typeof req.query.q === 'string' ? req.query.q : '';
    const qRaw = rawQ.trim().replace(/^@+/, '');
    const q = qRaw.toLowerCase();

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const skip = (page - 1) * limit;

    if (!q) {
      return res.status(200).json({ success: true, q: '', page, pages: 0, count: 0, total: 0, results: [] });
    }

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const handleRegex = new RegExp(`^${escaped}`, 'i');

    // ✅ rollNumber prefix + exact match (PUBLIC only)
    const escapedRaw = qRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rollPrefixRegex = new RegExp(`^${escapedRaw}`, 'i');
    const rollExactRegex = new RegExp(`^${escapedRaw}$`, 'i');

    // Decide when to include rollNumber search
    const enableRollSearch = qRaw.length >= 2; // adjust to 3 if you want less enumeration

    // viewer context (optional)
    let viewerPersonaId = null;
    let blockedSet = new Set();
    let viewerFollowingSet = new Set();

    if (req.user) {
      const ctx = await getViewerContext(req.user.id);
      viewerPersonaId = ctx?.activePersonaId || null;

      if (viewerPersonaId) {
        blockedSet = await getBlockedPersonaIdSetForViewer(viewerPersonaId);

        const viewer = await Persona.findById(viewerPersonaId).select('following').lean();
        for (const id of viewer?.following || []) viewerFollowingSet.add(id.toString());
      }
    }

    const baseQuery = enableRollSearch
      ? {
          $or: [
            { handle: { $regex: handleRegex } },
            { type: 'public', rollNumber: { $regex: rollPrefixRegex } },
          ],
        }
      : { handle: { $regex: handleRegex } };

    const total = await Persona.countDocuments(baseQuery);

    const personas = await Persona.find(baseQuery)
      .select('_id handle displayName profilePic type followers following rollNumber')
      .sort({ handle: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const visible = viewerPersonaId ? personas.filter((p) => !blockedSet.has(p._id.toString())) : personas;

    // threadsCount aggregation unchanged...
    const ids = visible.map((p) => p._id);
    const counts = await Thread.aggregate([
      { $match: { authorPersona: { $in: ids }, isDeleted: false } },
      { $group: { _id: '$authorPersona', threadsCount: { $sum: 1 } } },
    ]);
    const threadsCountMap = new Map(counts.map((c) => [c._id.toString(), c.threadsCount]));

    // ✅ optional: rank exact rollNumber matches first
    const results = visible
      .map((p) => {
        const roll = p.type === 'public' ? (p.rollNumber || '') : '';
        const exactRollMatch = roll ? rollExactRegex.test(roll) : false;

        return {
          _rank: exactRollMatch ? 0 : 1,
          id: p._id,
          type: p.type,
          handle: p.handle,
          username: p.handle,
          displayName: p.displayName || p.handle,
          profilePic: p.profilePic || '',
          rollNumber: p.type === 'public' ? p.rollNumber || '' : '',
          followersCount: (p.followers || []).length,
          followingCount: (p.following || []).length,
          threadsCount: threadsCountMap.get(p._id.toString()) || 0,
          isFollowing: viewerPersonaId ? viewerFollowingSet.has(p._id.toString()) : false,
        };
      })
      .sort((a, b) => a._rank - b._rank)
      .map(({ _rank, ...rest }) => rest);

    return res.status(200).json({
      success: true,
      q: qRaw,
      page,
      pages: Math.ceil(total / limit),
      count: results.length,
      total,
      results,
    });
  } catch (error) {
    console.error('searchPersonas error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ✅ GET /api/personas/:handle/followers (optionalAuth)
exports.getPersonaFollowersByHandle = async (req, res) => {
  try {
    const handle = normalizeHandle(req.params.handle);
    if (!handle) return res.status(400).json({ success: false, message: 'Handle is required' });

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const skip = (page - 1) * limit;

    const target = await Persona.findOne({ handle }).select('_id followers');
    if (!target) return res.status(404).json({ success: false, message: 'Profile not found' });

    // viewer context (optional)
    let viewerPersonaId = null;
    let blockedSet = new Set();
    let viewerFollowingSet = new Set();

    if (req.user) {
      const ctx = await getViewerContext(req.user.id);
      viewerPersonaId = ctx?.activePersonaId || null;

      if (viewerPersonaId) {
        blockedSet = await getBlockedPersonaIdSetForViewer(viewerPersonaId);

        // if target is blocked either-way, deny
        if (blockedSet.has(target._id.toString())) {
          return res.status(403).json({ success: false, message: 'Cannot view this content' });
        }

        const viewer = await Persona.findById(viewerPersonaId).select('following').lean();
        for (const id of viewer?.following || []) viewerFollowingSet.add(id.toString());
      }
    }

    const followerIds = target.followers || [];
    const total = followerIds.length;

    let docs = await Persona.find({ _id: { $in: followerIds } })
      .select('_id handle displayName profilePic type rollNumber')
      .sort({ handle: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // filter blocked (if logged in)
    if (viewerPersonaId) {
      docs = docs.filter((p) => !blockedSet.has(p._id.toString()));
    }

    const results = docs.map((p) => formatPersonaListItem(p, viewerPersonaId ? viewerFollowingSet : null));

    return res.status(200).json({
      success: true,
      handle,
      page,
      pages: Math.ceil(total / limit),
      count: results.length,
      total,
      results,
    });
  } catch (error) {
    console.error('getPersonaFollowersByHandle error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ✅ GET /api/personas/:handle/following (optionalAuth)
exports.getPersonaFollowingByHandle = async (req, res) => {
  try {
    const handle = normalizeHandle(req.params.handle);
    if (!handle) return res.status(400).json({ success: false, message: 'Handle is required' });

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const skip = (page - 1) * limit;

    const target = await Persona.findOne({ handle }).select('_id following');
    if (!target) return res.status(404).json({ success: false, message: 'Profile not found' });

    // viewer context (optional)
    let viewerPersonaId = null;
    let blockedSet = new Set();
    let viewerFollowingSet = new Set();

    if (req.user) {
      const ctx = await getViewerContext(req.user.id);
      viewerPersonaId = ctx?.activePersonaId || null;

      if (viewerPersonaId) {
        blockedSet = await getBlockedPersonaIdSetForViewer(viewerPersonaId);

        // if target is blocked either-way, deny
        if (blockedSet.has(target._id.toString())) {
          return res.status(403).json({ success: false, message: 'Cannot view this content' });
        }

        const viewer = await Persona.findById(viewerPersonaId).select('following').lean();
        for (const id of viewer?.following || []) viewerFollowingSet.add(id.toString());
      }
    }

    const followingIds = target.following || [];
    const total = followingIds.length;

    let docs = await Persona.find({ _id: { $in: followingIds } })
      .select('_id handle displayName profilePic type rollNumber')
      .sort({ handle: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // filter blocked (if logged in)
    if (viewerPersonaId) {
      docs = docs.filter((p) => !blockedSet.has(p._id.toString()));
    }

    const results = docs.map((p) => formatPersonaListItem(p, viewerPersonaId ? viewerFollowingSet : null));

    return res.status(200).json({
      success: true,
      handle,
      page,
      pages: Math.ceil(total / limit),
      count: results.length,
      total,
      results,
    });
  } catch (error) {
    console.error('getPersonaFollowingByHandle error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};