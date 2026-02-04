const mongoose = require('mongoose');
const Persona = require('../models/Persona');
const Thread = require('../models/Thread');
const Comment = require('../models/Comment');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
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

// ✅ helper: format author persona for thread cards (PII-safe for anon)
const formatAuthorPersonaForThread = (p) => {
  if (!p) return null;

  const isPublic = p.type === 'public';
  return {
    id: p._id,
    handle: p.handle,
    username: p.handle,
    displayName: p.displayName || p.handle,
    profilePic: p.profilePic || '',
    type: p.type,

    // show only for public personas
    rollNumber: isPublic ? p.rollNumber || '' : '',
    department: isPublic ? p.department || '' : '',
    batch: isPublic ? p.batch || '' : '',
  };
};

// ✅ helper: embed original thread for repost/quote previews (ThreadCard expects qt.author + qt.content)
const formatEmbeddedThread = (t) => {
  if (!t || typeof t !== 'object') return null;

  const author = t.authorPersona && typeof t.authorPersona === 'object' ? t.authorPersona : null;

  return {
    id: t._id,
    type: t.type || 'thread',
    content: t.content || '',
    images: t.images || [],
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,

    author: formatAuthorPersonaForThread(author),
  };
};

// ✅ minimal formatting to keep frontend stable and avoid leaking user linkage
const formatThreadItem = (t, viewerPersonaId, ownedPersonaIds, repostedTargetIdSet) => {
  const author = t.authorPersona && typeof t.authorPersona === 'object' ? t.authorPersona : null;

  const id = t._id?.toString?.() || t._id;
  const isLiked = viewerPersonaId ? (t.likes || []).some((p) => p.toString() === viewerPersonaId.toString()) : false;

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
    isOwner: ownedPersonaIds?.includes(author?._id?.toString?.()),

    author: formatAuthorPersonaForThread(author),
  };

  // ✅ IMPORTANT: match ThreadCard’s expected property names
  if (base.type === 'repost') {
    base.repostedBy = base.author; // used by ThreadCard banner (optional; it also falls back to thread.author)
    base.repostedThread = formatEmbeddedThread(t.repostOf);
  }

  if (base.type === 'quote') {
    base.quotedThread = formatEmbeddedThread(t.repostOf);
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

    // ✅ NEW: only true when the viewed persona is the currently active persona
    const isActivePersona = viewerPersonaId
      ? persona._id.toString() === viewerPersonaId.toString()
      : false;

    let isFollowing = false;
    let isBlocked = false;

    // ✅ keep follow-state even if it's your other persona (so follow/unfollow works)
    if (viewerPersonaId && !isActivePersona) {
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
        isActivePersona, // ✅ add
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
      // ✅ include rollNumber/department/batch so ThreadCard can display for public personas
      .populate('authorPersona', 'handle displayName profilePic type rollNumber department batch')
      .populate({
        path: 'repostOf',
        match: { isDeleted: false },
        populate: [
          { path: 'authorPersona', select: 'handle displayName profilePic type rollNumber department batch' },
          {
            path: 'repostOf',
            match: { isDeleted: false },
            populate: { path: 'authorPersona', select: 'handle displayName profilePic type rollNumber department batch' },
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
      .populate('authorPersona', 'handle displayName profilePic type rollNumber department batch')
      .populate({
        path: 'repostOf',
        match: { isDeleted: false },
        populate: [
          { path: 'authorPersona', select: 'handle displayName profilePic type rollNumber department batch' },
          {
            path: 'repostOf',
            match: { isDeleted: false },
            populate: { path: 'authorPersona', select: 'handle displayName profilePic type rollNumber department batch' },
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

// ✅ GET /api/personas/suggested (auth)
exports.getSuggestedPersonas = async (req, res) => {
  try {
    const ctx = await requireViewerContext(req, res);
    if (!ctx) return;

    const viewerPersonaId = ctx.activePersonaId?.toString?.() || String(ctx.activePersonaId);
    if (!viewerPersonaId) {
      return res.status(400).json({ success: false, message: 'Active persona not found' });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const windowDays = Math.min(Math.max(parseInt(req.query.windowDays) || 30, 1), 180);
    const skip = (page - 1) * limit;

    const now = Date.now();
    const windowStart = new Date(now - windowDays * 24 * 60 * 60 * 1000);
    const activeStart = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const blockedSet = await getBlockedPersonaIdSetForViewer(viewerPersonaId);

    const viewer = await Persona.findById(viewerPersonaId).select('following').lean();
    const viewerFollowing = viewer?.following || [];
    const viewerFollowingSet = new Set(viewerFollowing.map((x) => x.toString()));

    const scoreMap = new Map(); // personaId -> number
    const reasonMap = new Map(); // personaId -> [string]

    const addScore = (id, delta, reason) => {
      if (!id) return;
      const pid = id.toString();

      // exclude only the active persona itself (other owned personas are allowed)
      if (pid === viewerPersonaId) return;

      // filters
      if (blockedSet.has(pid)) return;
      if (viewerFollowingSet.has(pid)) return;

      scoreMap.set(pid, (scoreMap.get(pid) || 0) + delta);

      if (reason) {
        const arr = reasonMap.get(pid) || [];
        arr.push(reason);
        reasonMap.set(pid, arr);
      }
    };

    // 1) DM contacts (+2)
    const convs = await Conversation.find({ participants: viewerPersonaId })
      .select('participants')
      .limit(500)
      .lean();

    for (const c of convs) {
      const other = (c.participants || []).find((p) => p.toString() !== viewerPersonaId);
      if (other) addScore(other, 2, 'dm');
    }

    // 2) Mutual follows: followed-by-followed (+3 per mutual)
    if (viewerFollowing.length) {
      const mutualAgg = await Persona.aggregate([
        { $match: { _id: { $in: viewerFollowing } } },
        { $project: { following: 1 } },
        { $unwind: '$following' },
        { $group: { _id: '$following', mutualCount: { $sum: 1 } } },
        { $sort: { mutualCount: -1 } },
        { $limit: 1000 },
      ]);

      for (const r of mutualAgg) {
        const cnt = r?.mutualCount || 0;
        if (cnt > 0) addScore(r._id, cnt * 3, `mutuals:${cnt}`);
      }
    }

    // 3) Engagement overlap (+2 per shared thread)
    const likedThreads = await Thread.find({
      isDeleted: false,
      createdAt: { $gte: windowStart },
      likes: new mongoose.Types.ObjectId(viewerPersonaId),
    })
      .select('_id')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const commentedThreads = await Comment.find({
      isDeleted: false,
      createdAt: { $gte: windowStart },
      authorPersona: new mongoose.Types.ObjectId(viewerPersonaId),
    })
      .select('threadId')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const engagedThreadIdSet = new Set();
    for (const t of likedThreads) engagedThreadIdSet.add(t._id.toString());
    for (const c of commentedThreads) engagedThreadIdSet.add(c.threadId.toString());

    const engagedThreadIds = [...engagedThreadIdSet].slice(0, 200).map((id) => new mongoose.Types.ObjectId(id));

    if (engagedThreadIds.length) {
      const threads = await Thread.find({ _id: { $in: engagedThreadIds }, isDeleted: false })
        .select('_id authorPersona likes')
        .lean();

      const comments = await Comment.find({ threadId: { $in: engagedThreadIds }, isDeleted: false })
        .select('threadId authorPersona')
        .lean();

      const shared = new Map(); // pid -> Set(threadId)
      const addShared = (personaId, threadId) => {
        if (!personaId || !threadId) return;
        const pid = personaId.toString();
        const tid = threadId.toString();
        const set = shared.get(pid) || new Set();
        set.add(tid);
        shared.set(pid, set);
      };

      for (const t of threads) {
        addShared(t.authorPersona, t._id);
        for (const liker of t.likes || []) addShared(liker, t._id);
      }
      for (const c of comments) addShared(c.authorPersona, c.threadId);

      for (const [pid, set] of shared.entries()) {
        const cnt = set.size;
        if (cnt > 0) addScore(pid, cnt * 2, `engaged:${cnt}`);
      }
    }

    // 4) Trending (+1..3)
    const trendingAgg = await Thread.aggregate([
      { $match: { isDeleted: false, createdAt: { $gte: windowStart } } },
      {
        $project: {
          authorPersona: 1,
          s: {
            $add: [
              { $size: { $ifNull: ['$likes', []] } },
              { $ifNull: ['$commentCount', 0] },
              { $ifNull: ['$repostCount', 0] },
            ],
          },
        },
      },
      { $group: { _id: '$authorPersona', total: { $sum: '$s' } } },
      { $sort: { total: -1 } },
      { $limit: 100 },
    ]);

    trendingAgg.forEach((r, idx) => {
      const points = idx < 10 ? 3 : idx < 25 ? 2 : 1;
      addScore(r._id, points, `trending:${points}`);
    });

    // 5) Recency (+1)
    const recent = await Persona.find({}).select('_id createdAt').sort({ createdAt: -1 }).limit(100).lean();
    for (const p of recent) addScore(p._id, 1, 'new');

    // 6) Active recently (+1) among candidates
    const candidateIds = [...scoreMap.keys()].slice(0, 2000).map((id) => new mongoose.Types.ObjectId(id));
    if (candidateIds.length) {
      const [activeThreadAuthors, activeCommentAuthors] = await Promise.all([
        Thread.distinct('authorPersona', { authorPersona: { $in: candidateIds }, isDeleted: false, createdAt: { $gte: activeStart } }),
        Comment.distinct('authorPersona', { authorPersona: { $in: candidateIds }, isDeleted: false, createdAt: { $gte: activeStart } }),
      ]);

      const activeSet = new Set([
        ...(activeThreadAuthors || []).map((x) => x.toString()),
        ...(activeCommentAuthors || []).map((x) => x.toString()),
      ]);

      for (const id of activeSet) addScore(id, 1, 'active_recent');
    }

    // ✅ ranked list for pagination
    const rankedAll = [...scoreMap.entries()].sort((a, b) => b[1] - a[1]);
    const totalCandidates = rankedAll.length;

    const pageSlice = rankedAll.slice(skip, skip + limit);
    const hasMore = skip + limit < totalCandidates;

    const pageIds = pageSlice.map(([id]) => new mongoose.Types.ObjectId(id));
    const docs = await Persona.find({ _id: { $in: pageIds } })
      .select('_id handle displayName profilePic type rollNumber')
      .lean();

    const docMap = new Map(docs.map((d) => [d._id.toString(), d]));

    const results = pageSlice
      .map(([id, score]) => ({ id: id.toString(), score }))
      .filter((x) => docMap.has(x.id))
      .map(({ id, score }) => {
        const p = docMap.get(id);
        return {
          ...formatPersonaListItem(p, viewerFollowingSet),
          score,
          reasons: reasonMap.get(id) || [],
        };
      });

    return res.status(200).json({
      success: true,
      page,
      limit,
      hasMore,
      windowDays,
      totalCandidates,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error('getSuggestedPersonas error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};