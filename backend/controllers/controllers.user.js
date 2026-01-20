const Thread = require('../models/Thread');
const Comment = require('../models/Comment');
const User = require('../models/User');
const mongoose = require('mongoose');
const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');
const Persona = require('../models/Persona');
const crypto = require('crypto');

// ✅ add assertAnonConfigured (used for safety when activeMode === 'anon')
const { ensurePersonasForUser, getViewerContext, assertAnonConfigured } = require('../utils/personaContext');

// ❌ REMOVE old formatThread/formatComment that used thread.isAnonymous/comment.isAnonymous + author(User)
// Helper function to format thread
// const formatThread = (thread, userId = null) => {
//   const formatted = {
//     id: thread._id,
//     content: thread.content,
//     isAnonymous: thread.isAnonymous,
//     images: thread.images,
//     likes: thread.likes,
//     likesCount: thread.likes.length,
//     commentCount: thread.commentCount,
//     createdAt: thread.createdAt,
//     updatedAt: thread.updatedAt,
//     type: 'thread',
//   };

//   if (!thread.isAnonymous && thread.author) {
//     formatted.author = {
//       id: thread.author._id,
//       username: thread.author.username,
//       profilePic: thread.author.profilePic,
//       rollNumber: thread.author.rollNumber,
//       department: thread.author.department,
//       batch: thread.author.batch,
//     };
//   } else {
//     formatted.author = {
//       username: 'Anonymous',
//       profilePic: '',
//       department: 'COMSATS Student',
//     };
//   }

//   if (userId) {
//     formatted.isLiked = thread.likes.some(
//       (likeId) => likeId.toString() === userId.toString()
//     );
//     formatted.isOwner = thread.author && thread.author._id.toString() === userId.toString();
//   }

//   return formatted;
// };

// // Helper function to format comment
// const formatComment = (comment, userId = null) => {
//   const formatted = {
//     id: comment._id,
//     content: comment.isDeleted ? '[deleted]' : comment.content,
//     isAnonymous: comment.isAnonymous,
//     likes: comment.likes,
//     likesCount: comment.likes.length,
//     replyCount: comment.replyCount,
//     depth: comment.depth,
//     threadId: comment.threadId,
//     parentCommentId: comment.parentCommentId,
//     isDeleted: comment.isDeleted,
//     createdAt: comment.createdAt,
//     updatedAt: comment.updatedAt,
//     type: 'comment',
//   };

//   if (!comment.isDeleted && !comment.isAnonymous && comment.author) {
//     formatted.author = {
//       id: comment.author._id,
//       username: comment.author.username,
//       profilePic: comment.author.profilePic,
//       rollNumber: comment.author.rollNumber,
//       department: comment.author.department,
//       batch: comment.author.batch,
//     };
//   } else if (comment.isDeleted) {
//     formatted.author = {
//       username: '[deleted]',
//       profilePic: '',
//     };
//   } else {
//     formatted.author = {
//       username: 'Anonymous',
//       profilePic: '',
//       department: 'COMSATS Student',
//     };
//   }

//   if (comment.threadId) {
//     formatted.thread = {
//       id: comment.threadId._id,
//       content: comment.threadId.content?.substring(0, 100) + '...',
//     };
//   }

//   if (comment.parentCommentId) {
//     formatted.parentComment = {
//       id: comment.parentCommentId._id,
//       content: comment.parentCommentId.content?.substring(0, 50) + '...',
//       author: comment.parentCommentId.author?.username || 'Anonymous',
//     };
//   }

//   if (userId) {
//     formatted.isLiked = comment.likes.some(
//       (likeId) => likeId.toString() === userId.toString()
//     );
//     formatted.isOwner = comment.author && comment.author._id.toString() === userId.toString();
//   }

//   return formatted;
// };

// ✅ New: format persona for API responses (keeps frontend compatibility: author.username/profilePic/rollNumber/etc)
const formatPersona = (p) => ({
  id: p?._id,
  username: p?.handle,
  displayName: p?.displayName || '',
  profilePic: p?.profilePic || '',
  coverPhoto: p?.coverPhoto || '',
  bio: p?.bio || '',
  rollNumber: p?.rollNumber || '',
  department: p?.department || (p?.type === 'anon' ? 'COMSATS Student' : ''),
  batch: p?.batch || '',
  type: p?.type || '',
});

const formatThreadFromDoc = (thread, viewerPersonaId = null, ownedPersonaIds = []) => {
  const formatted = {
    id: thread._id,
    type: thread.type || 'thread',
    content: thread.content || '',
    images: thread.images || [],
    likes: thread.likes || [],
    likesCount: (thread.likes || []).length,
    commentCount: thread.commentCount || 0,
    repostCount: thread.repostCount || 0,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
  };

  formatted.author = formatPersona(thread.authorPersona);

  if (viewerPersonaId) {
    formatted.isLiked = (thread.likes || []).some((likeId) => likeId.toString() === viewerPersonaId.toString());
  }
  formatted.isOwner = ownedPersonaIds.includes(thread.authorPersona?._id?.toString());

  return formatted;
};

const formatCommentFromDoc = (comment, viewerPersonaId = null, ownedPersonaIds = []) => {
  const formatted = {
    id: comment._id,
    type: 'comment',
    content: comment.isDeleted ? '[deleted]' : comment.content,
    likes: comment.likes || [],
    likesCount: (comment.likes || []).length,
    replyCount: comment.replyCount || 0,
    depth: comment.depth || 0,
    threadId: comment.threadId,
    parentCommentId: comment.parentCommentId,
    isDeleted: !!comment.isDeleted,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };

  if (comment.isDeleted) {
    formatted.author = { username: '[deleted]', profilePic: '' };
  } else {
    formatted.author = formatPersona(comment.authorPersona);
  }

  if (viewerPersonaId) {
    formatted.isLiked = (comment.likes || []).some((likeId) => likeId.toString() === viewerPersonaId.toString());
  }
  formatted.isOwner = ownedPersonaIds.includes(comment.authorPersona?._id?.toString());

  // attach thread preview if populated
  if (comment.threadId && typeof comment.threadId === 'object') {
    formatted.thread = {
      id: comment.threadId._id,
      content: (comment.threadId.content || '').substring(0, 100) + '...',
    };
  }

  // attach parent preview if populated
  if (comment.parentCommentId && typeof comment.parentCommentId === 'object') {
    formatted.parentComment = {
      id: comment.parentCommentId._id,
      content: (comment.parentCommentId.content || '').substring(0, 50) + '...',
      author: comment.parentCommentId.authorPersona?.handle || 'Anonymous',
    };
  }

  return formatted;
};

// ✅ Persona-based block check (replaces User-based areUsersBlocked)
const arePersonasBlocked = async (personaId1, personaId2) => {
  const [p1, p2] = await Promise.all([
    Persona.findById(personaId1).select('blocked').lean(),
    Persona.findById(personaId2).select('blocked').lean(),
  ]);

  const p1BlockedP2 = (p1?.blocked || []).some((id) => id.toString() === personaId2.toString());
  const p2BlockedP1 = (p2?.blocked || []).some((id) => id.toString() === personaId1.toString());

  return p1BlockedP2 || p2BlockedP1;
};

// Helper to check if two users have blocked each other (still User-based for now)
// const areUsersBlocked = async (userId1, userId2) => {
//   const [user1, user2] = await Promise.all([
//     User.findById(userId1).select('blockedUsers'),
//     User.findById(userId2).select('blockedUsers'),
//   ]);

//   const user1BlockedUser2 = user1?.blockedUsers.some((id) => id.toString() === userId2);
//   const user2BlockedUser1 = user2?.blockedUsers.some((id) => id.toString() === userId1);

//   return user1BlockedUser2 || user2BlockedUser1;
// };

// @desc    Get user activity (Home tab - threads + comments)
// @route   GET /api/users/:userId/activity?type=all
// @access  Public (route currently uses protect in routes; leaving as-is)
exports.getUserActivity = async (req, res) => {
  try {
    const { userId } = req.params;
    const type = req.query.type || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const targetUser = await ensurePersonasForUser(userId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

    let viewerPersonaId = null;
    let ownedPersonaIds = [];
    if (req.user) {
      const ctx = await getViewerContext(req.user.id);
      viewerPersonaId = ctx?.activePersonaId || null;
      ownedPersonaIds = ctx?.ownedPersonaIds || [];

      if (viewerPersonaId) {
        const blocked = await arePersonasBlocked(viewerPersonaId, targetUser.publicPersonaId);
        if (blocked) return res.status(403).json({ success: false, message: 'Cannot view this profile' });
      }
    }

    const targetPublicPersonaId = targetUser.publicPersonaId;

    let activity = [];

    if (type === 'threads' || type === 'all') {
      const threads = await Thread.find({ authorPersona: targetPublicPersonaId, isDeleted: false })
        .populate('authorPersona', 'handle displayName profilePic coverPhoto bio rollNumber department batch type')
        .sort({ createdAt: -1 })
        .lean();

      activity.push(...threads.map((t) => formatThreadFromDoc(t, viewerPersonaId, ownedPersonaIds)));
    }

    if (type === 'likes') {
      const likedThreads = await Thread.find({ likes: targetPublicPersonaId, isDeleted: false })
        .populate('authorPersona', 'handle displayName profilePic coverPhoto bio rollNumber department batch type')
        .sort({ createdAt: -1 })
        .lean();

      activity.push(...likedThreads.map((t) => formatThreadFromDoc(t, viewerPersonaId, ownedPersonaIds)));
    }

    if (type === 'replies' || type === 'all') {
      const comments = await Comment.find({ authorPersona: targetPublicPersonaId, isDeleted: false })
        .populate('authorPersona', 'handle displayName profilePic rollNumber department batch type')
        .populate('threadId', 'content')
        .populate({
          path: 'parentCommentId',
          select: 'content authorPersona',
          populate: { path: 'authorPersona', select: 'handle' },
        })
        .sort({ createdAt: -1 })
        .lean();

      activity.push(...comments.map((c) => formatCommentFromDoc(c, viewerPersonaId, ownedPersonaIds)));
    }

    activity.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = activity.length;
    const paginatedActivity = activity.slice(skip, skip + limit);

    // ✅ header from public persona
    const publicPersona = await Persona.findById(targetPublicPersonaId).select(
      'handle displayName profilePic coverPhoto bio rollNumber department batch type'
    );

    return res.status(200).json({
      success: true,
      count: paginatedActivity.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      user: {
        id: userId,
        username: publicPersona?.handle || '',
        displayName: publicPersona?.displayName || '',
        profilePic: publicPersona?.profilePic || '',
        rollNumber: publicPersona?.rollNumber || '',
        department: publicPersona?.department || '',
        batch: publicPersona?.batch || '',
        bio: publicPersona?.bio || '',
      },
      activity: paginatedActivity,
    });
  } catch (error) {
    console.error('Get user activity error:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching user activity', error: error.message });
  }
};

//@desc Get a user profile by username
//@route GET /api/users/:username/profile
//@access Public
exports.getUserProfile = async (req, res) => {
  try {
    const { username } = req.params;

    const user = await User.findOne({ username: username.toLowerCase() }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const ensured = await ensurePersonasForUser(user._id);

    // ✅ Persona-based block check
    if (req.user) {
      const ctx = await getViewerContext(req.user.id);
      if (ctx?.activePersonaId) {
        const blocked = await arePersonasBlocked(ctx.activePersonaId, ensured.publicPersonaId);
        if (blocked) return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    // ✅ use public persona as source-of-truth for display fields
    const publicPersona = await Persona.findById(ensured.publicPersonaId).select(
      'handle displayName profilePic coverPhoto bio rollNumber department batch type'
    );

    const threadsCount = await Thread.countDocuments({ authorPersona: ensured.publicPersonaId, isDeleted: false });

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        username: publicPersona?.handle || user.username,
        displayName: publicPersona?.displayName || user.username,
        profilePic: publicPersona?.profilePic || '',
        coverPhoto: publicPersona?.coverPhoto || null,
        bio: publicPersona?.bio || '',
        rollNumber: publicPersona?.rollNumber || user.rollNumber,
        department: publicPersona?.department || user.department,
        batch: publicPersona?.batch || user.batch,
        threadsCount,
      },
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Follow a user (now: active persona follows target user's PUBLIC persona)
// @route   POST /api/users/:userId/follow
// @access  Private
exports.followUser = async (req, res) => {
  console.log('Follow user request received');
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID',
      });
    }

    // Cannot follow yourself
    if (userId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot follow yourself',
      });
    }

    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    if (ctx.activeMode === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) return res.status(409).json({ success: false, setupRequired: true, message: 'Anonymous persona setup required' });
    }

    const targetUser = await ensurePersonasForUser(userId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

    const viewerPersonaId = ctx.activePersonaId;
    const targetPersonaId = targetUser.publicPersonaId;

    if (viewerPersonaId.toString() === targetPersonaId.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot follow yourself' });
    }

    const blocked = await arePersonasBlocked(viewerPersonaId, targetPersonaId);
    if (blocked) return res.status(403).json({ success: false, message: 'Cannot follow this user' });

    // already following?
    const viewerPersona = await Persona.findById(viewerPersonaId).select('following').lean();
    const alreadyFollowing = (viewerPersona?.following || []).some((id) => id.toString() === targetPersonaId.toString());
    if (alreadyFollowing) return res.status(400).json({ success: false, message: 'Already following this user' });

    await Promise.all([
      Persona.updateOne({ _id: viewerPersonaId }, { $addToSet: { following: targetPersonaId } }),
      Persona.updateOne({ _id: targetPersonaId }, { $addToSet: { followers: viewerPersonaId } }),
    ]);

    const updatedTarget = await Persona.findById(targetPersonaId).select('following').lean();
    const isMutual = (updatedTarget?.following || []).some((id) => id.toString() === viewerPersonaId.toString());

    return res.status(200).json({ success: true, message: 'Successfully followed', isMutual });
  } catch (error) {
    console.error('Follow user error:', error);
    return res.status(500).json({ success: false, message: 'Server error while following user', error: error.message });
  }
};

// @desc    Unfollow a user (active persona unfollows target user's PUBLIC persona)
// @route   DELETE /api/users/:userId/unfollow
// @access  Private
exports.unfollowUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID',
      });
    }

    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    const targetUser = await ensurePersonasForUser(userId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

    const viewerPersonaId = ctx.activePersonaId;
    const targetPersonaId = targetUser.publicPersonaId;

    await Promise.all([
      Persona.updateOne({ _id: viewerPersonaId }, { $pull: { following: targetPersonaId } }),
      Persona.updateOne({ _id: targetPersonaId }, { $pull: { followers: viewerPersonaId } }),
    ]);

    return res.status(200).json({ success: true, message: 'Successfully unfollowed' });
  } catch (error) {
    console.error('Unfollow user error:', error);
    return res.status(500).json({ success: false, message: 'Server error while unfollowing user', error: error.message });
  }
};

// @desc    Get user's followers (PUBLIC persona followers)
// @route   GET /api/users/:userId/followers
// @access  Public
exports.getFollowers = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const targetUser = await ensurePersonasForUser(userId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

    // viewer context
    let viewerPersonaId = null;
    if (req.user) {
      const ctx = await getViewerContext(req.user.id);
      viewerPersonaId = ctx?.activePersonaId || null;
      if (viewerPersonaId) {
        const blocked = await arePersonasBlocked(viewerPersonaId, targetUser.publicPersonaId);
        if (blocked) return res.status(403).json({ success: false, message: 'Cannot view this user profile' });
      }
    }

    const targetPersona = await Persona.findById(targetUser.publicPersonaId).select('followers').lean();
    const followerIds = targetPersona?.followers || [];
    const total = followerIds.length;

    const pageIds = followerIds.slice(skip, skip + limit);

    const followers = await Persona.find({ _id: { $in: pageIds } })
      .select('handle displayName profilePic rollNumber department batch followers following type')
      .lean();

    const formatted = followers.map((p) => {
      const isFollowing = viewerPersonaId
        ? (p.followers || []).some((id) => id.toString() === viewerPersonaId.toString())
        : false;

      const isMutual = viewerPersonaId && isFollowing
        ? (p.following || []).some((id) => id.toString() === viewerPersonaId.toString())
        : false;

      return {
        id: p._id,
        username: p.handle,
        displayName: p.displayName,
        profilePic: p.profilePic,
        rollNumber: p.rollNumber,
        department: p.department || (p.type === 'anon' ? 'COMSATS Student' : ''),
        batch: p.batch,
        followersCount: (p.followers || []).length,
        followingCount: (p.following || []).length,
        isFollowing,
        isMutual,
        type: p.type,
      };
    });

    return res.status(200).json({
      success: true,
      count: formatted.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      followers: formatted,
    });
  } catch (error) {
    console.error('Get followers error:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching followers', error: error.message });
  }
};

// @desc    Get user's following (PUBLIC persona following)
// @route   GET /api/users/:userId/following
// @access  Public
exports.getFollowing = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const targetUser = await ensurePersonasForUser(userId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

    let viewerPersonaId = null;
    if (req.user) {
      const ctx = await getViewerContext(req.user.id);
      viewerPersonaId = ctx?.activePersonaId || null;
      if (viewerPersonaId) {
        const blocked = await arePersonasBlocked(viewerPersonaId, targetUser.publicPersonaId);
        if (blocked) return res.status(403).json({ success: false, message: 'Cannot view this user profile' });
      }
    }

    const targetPersona = await Persona.findById(targetUser.publicPersonaId).select('following').lean();
    const followingIds = targetPersona?.following || [];
    const total = followingIds.length;

    const pageIds = followingIds.slice(skip, skip + limit);

    const following = await Persona.find({ _id: { $in: pageIds } })
      .select('handle displayName profilePic rollNumber department batch followers following type')
      .lean();

    const formatted = following.map((p) => {
      const isFollowing = viewerPersonaId
        ? (p.followers || []).some((id) => id.toString() === viewerPersonaId.toString())
        : false;

      const isMutual = viewerPersonaId && isFollowing
        ? (p.following || []).some((id) => id.toString() === viewerPersonaId.toString())
        : false;

      return {
        id: p._id,
        username: p.handle,
        displayName: p.displayName,
        profilePic: p.profilePic,
        rollNumber: p.rollNumber,
        department: p.department || (p.type === 'anon' ? 'COMSATS Student' : ''),
        batch: p.batch,
        followersCount: (p.followers || []).length,
        followingCount: (p.following || []).length,
        isFollowing,
        isMutual,
        type: p.type,
      };
    });

    return res.status(200).json({
      success: true,
      count: formatted.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      following: formatted,
    });
  } catch (error) {
    console.error('Get following error:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching following', error: error.message });
  }
};

const escapeRegExp = (s = '') => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// @desc    Search users (exclude persona-blocked relationships)
// @route   GET /api/users/search?q=query
// @access  Public
exports.searchUsers = async (req, res) => {
  try {
    const queryRaw = req.query.q || '';
    const query = queryRaw.trim();

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;

    if (!query) {
      return res.status(400).json({ success: false, message: 'Search query is required' });
    }

    const escaped = escapeRegExp(query);
    const prefixRegex = new RegExp(`^${escaped}`, 'i');

    const searchCriteria = {
      $or: [
        { username: { $regex: prefixRegex } },
        { rollNumber: { $regex: prefixRegex } },
        { department: { $regex: prefixRegex } },
      ],
    };

    // ✅ Persona-based filtering when authenticated
    if (req.user) {
      const ctx = await getViewerContext(req.user.id);
      const viewerPersonaId = ctx?.activePersonaId;

      if (viewerPersonaId) {
        const viewerPersona = await Persona.findById(viewerPersonaId).select('blocked').lean();
        const blockedByMe = (viewerPersona?.blocked || []).map((id) => id.toString());

        const blockedMe = await Persona.find({ blocked: viewerPersonaId, type: 'public' }).select('_id').lean();
        const blockedMeIds = blockedMe.map((p) => p._id.toString());

        const personaIdsToExclude = [...new Set([...blockedByMe, ...blockedMeIds])];

        if (personaIdsToExclude.length) {
          searchCriteria.publicPersonaId = { $nin: personaIdsToExclude };
        }
      }
    }

    const total = await User.countDocuments(searchCriteria);

    const users = await User.find(searchCriteria)
      .select('username profilePic rollNumber department batch followers following publicPersonaId')
      .skip(skip)
      .limit(limit)
      .lean();

    const formattedUsers = users.map((u) => ({
      id: u._id,
      username: u.username,
      profilePic: u.profilePic,
      rollNumber: u.rollNumber,
      department: u.department,
      batch: u.batch,
    }));

    return res.status(200).json({
      success: true,
      count: formattedUsers.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      users: formattedUsers,
    });
  } catch (error) {
    console.error('Search users error:', error);
    return res.status(500).json({ success: false, message: 'Server error while searching users', error: error.message });
  }
};

// @desc    Block a user (active persona blocks target user's PUBLIC persona)
// @route   POST /api/users/:userId/block
// @access  Private
exports.blockUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    if (ctx.activeMode === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) return res.status(409).json({ success: false, setupRequired: true, message: 'Anonymous persona setup required' });
    }

    const targetUser = await ensurePersonasForUser(userId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

    const viewerPersonaId = ctx.activePersonaId;
    const targetPersonaId = targetUser.publicPersonaId;

    if (viewerPersonaId.toString() === targetPersonaId.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot block yourself' });
    }

    // add to blocked + remove follow relations both ways (persona-specific)
    await Promise.all([
      Persona.updateOne({ _id: viewerPersonaId }, { $addToSet: { blocked: targetPersonaId }, $pull: { following: targetPersonaId, followers: targetPersonaId } }),
      Persona.updateOne({ _id: targetPersonaId }, { $pull: { following: viewerPersonaId, followers: viewerPersonaId } }),
    ]);

    return res.status(200).json({ success: true, message: 'Blocked successfully' });
  } catch (error) {
    console.error('Block user error:', error);
    return res.status(500).json({ success: false, message: 'Server error while blocking user', error: error.message });
  }
};

// @desc    Unblock a user (active persona unblocks target user's PUBLIC persona)
// @route   DELETE /api/users/:userId/unblock
// @access  Private
exports.unblockUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID' });
    }

    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    const targetUser = await ensurePersonasForUser(userId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

    await Persona.updateOne(
      { _id: ctx.activePersonaId },
      { $pull: { blocked: targetUser.publicPersonaId } }
    );

    return res.status(200).json({ success: true, message: 'Unblocked successfully' });
  } catch (error) {
    console.error('Unblock user error:', error);
    return res.status(500).json({ success: false, message: 'Server error while unblocking user', error: error.message });
  }
};

// @desc    Get blocked list (active persona blocked personas)
// @route   GET /api/users/blocked
// @access  Private
exports.getBlockedUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    const mePersona = await Persona.findById(ctx.activePersonaId).select('blocked').lean();
    const blockedIds = mePersona?.blocked || [];
    const total = blockedIds.length;

    const pageIds = blockedIds.slice(skip, skip + limit);

    const blocked = await Persona.find({ _id: { $in: pageIds } })
      .select('handle displayName profilePic rollNumber department batch type')
      .lean();

    const blockedUsers = blocked.map((p) => ({
      id: p._id,
      username: p.handle,
      displayName: p.displayName,
      profilePic: p.profilePic,
      rollNumber: p.rollNumber,
      department: p.department || (p.type === 'anon' ? 'COMSATS Student' : ''),
      batch: p.batch,
      type: p.type,
    }));

    return res.status(200).json({
      success: true,
      count: blockedUsers.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      blockedUsers,
    });
  } catch (error) {
    console.error('Get blocked users error:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching blocked users', error: error.message });
  }
};

// @desc    Update current user's profile picture (PUBLIC persona only)
// @route   PUT /api/users/me/profile-pic
exports.updateProfilePic = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No image uploaded. Send multipart/form-data with field name "image".',
      });
    }

    const userId = req.user.id;

    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'threadsats/profile_pics',
          resource_type: 'image',
          overwrite: true,
          public_id: `user_${userId}_profile`,
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );

      const readable = new Readable();
      readable.push(req.file.buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });

    const ensured = await ensurePersonasForUser(userId);
    if (!ensured) return res.status(404).json({ success: false, message: 'User not found' });

    const [updatedUser] = await Promise.all([
      User.findByIdAndUpdate(userId, { profilePic: uploadResult.secure_url }, { new: true }).select(
        'username profilePic coverPhoto rollNumber department batch bio'
      ),
      // ✅ sync PUBLIC persona only (does NOT touch anon persona)
      Persona.updateOne(
        { _id: ensured.publicPersonaId, type: 'public' },
        { $set: { profilePic: uploadResult.secure_url } }
      ),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Profile picture updated',
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        profilePic: updatedUser.profilePic,
        coverPhoto: updatedUser.coverPhoto,
        rollNumber: updatedUser.rollNumber,
        department: updatedUser.department,
        batch: updatedUser.batch,
        bio: updatedUser.bio,
      },
    });
  } catch (error) {
    console.error('Update profile picture error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating profile picture',
      error: error.message,
    });
  }
};

// @desc    Update current user's cover photo (PUBLIC persona only)
// @route   PUT /api/users/me/cover-photo
exports.updateCoverPhoto = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No image uploaded. Send multipart/form-data with field name "image".',
      });
    }

    const userId = req.user.id;

    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'threadsats/cover_photos',
          resource_type: 'image',
          overwrite: true,
          public_id: `user_${userId}_cover`,
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );

      const readable = new Readable();
      readable.push(req.file.buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });

    const ensured = await ensurePersonasForUser(userId);
    if (!ensured) return res.status(404).json({ success: false, message: 'User not found' });

    const [updatedUser] = await Promise.all([
      User.findByIdAndUpdate(userId, { coverPhoto: uploadResult.secure_url }, { new: true }).select(
        'username profilePic coverPhoto rollNumber department batch bio'
      ),
      // ✅ sync PUBLIC persona only
      Persona.updateOne(
        { _id: ensured.publicPersonaId, type: 'public' },
        { $set: { coverPhoto: uploadResult.secure_url } }
      ),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Cover photo updated',
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        profilePic: updatedUser.profilePic,
        coverPhoto: updatedUser.coverPhoto,
        rollNumber: updatedUser.rollNumber,
        department: updatedUser.department,
        batch: updatedUser.batch,
        bio: updatedUser.bio,
      },
    });
  } catch (error) {
    console.error('Update cover photo error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating cover photo',
      error: error.message,
    });
  }
};

// @desc    Update current user's bio (PUBLIC persona only)
// @route   PUT /api/users/me/bio
exports.updateBio = async (req, res) => {
  try {
    const bioRaw = req.body?.bio;
    const bio = typeof bioRaw === 'string' ? bioRaw.trim() : '';

    const ensured = await ensurePersonasForUser(req.user.id);
    if (!ensured) return res.status(404).json({ success: false, message: 'User not found' });

    const [updatedUser] = await Promise.all([
      User.findByIdAndUpdate(req.user.id, { bio }, { new: true }).select(
        'username profilePic coverPhoto rollNumber department batch bio'
      ),
      // ✅ sync PUBLIC persona only
      Persona.updateOne(
        { _id: ensured.publicPersonaId, type: 'public' },
        { $set: { bio } }
      ),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Bio updated',
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        profilePic: updatedUser.profilePic,
        coverPhoto: updatedUser.coverPhoto,
        rollNumber: updatedUser.rollNumber,
        department: updatedUser.department,
        batch: updatedUser.batch,
        bio: updatedUser.bio || '',
      },
    });
  } catch (error) {
    console.error('Update bio error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating bio',
      error: error.message,
    });
  }
};

// @desc    Update current user's username (PUBLIC persona only)
// @route   PUT /api/users/me/username
exports.updateUsername = async (req, res) => {
  try {
    const usernameRaw = req.body?.username;
    const username = typeof usernameRaw === 'string' ? usernameRaw.trim().toLowerCase() : '';

    if (!username) {
      return res.status(400).json({ success: false, message: 'Username is required' });
    }

    const ensured = await ensurePersonasForUser(req.user.id);
    if (!ensured) return res.status(404).json({ success: false, message: 'User not found' });

    const me = await User.findById(req.user.id).select('username profilePic coverPhoto rollNumber department batch bio');
    if (!me) return res.status(404).json({ success: false, message: 'User not found' });

    if (me.username === username) {
      return res.status(200).json({
        success: true,
        message: 'Username updated',
        user: {
          id: me._id,
          username: me.username,
          profilePic: me.profilePic,
          coverPhoto: me.coverPhoto,
          rollNumber: me.rollNumber,
          department: me.department,
          batch: me.batch,
          bio: me.bio || '',
        },
      });
    }

    // unique among Users
    const existsUser = await User.findOne({ username }).select('_id');
    if (existsUser) return res.status(400).json({ success: false, message: 'Username already taken' });

    // unique among Personas (Persona.handle is globally unique)
    const existsPersona = await Persona.findOne({
      handle: username,
      _id: { $ne: ensured.publicPersonaId },
    }).select('_id');

    if (existsPersona) return res.status(400).json({ success: false, message: 'Username already taken' });

    const [updatedUser] = await Promise.all([
      User.findByIdAndUpdate(req.user.id, { username }, { new: true, runValidators: true }).select(
        'username profilePic coverPhoto rollNumber department batch bio'
      ),
      // ✅ sync PUBLIC persona only (does NOT touch anon persona)
      Persona.updateOne(
        { _id: ensured.publicPersonaId, type: 'public' },
        { $set: { handle: username, displayName: username } }
      ),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Username updated',
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        profilePic: updatedUser.profilePic,
        coverPhoto: updatedUser.coverPhoto,
        rollNumber: updatedUser.rollNumber,
        department: updatedUser.department,
        batch: updatedUser.batch,
        bio: updatedUser.bio || '',
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: 'Username already taken' });
    }
    console.error('Update username error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating username',
      error: error.message,
    });
  }
};

// @desc    Get current user's personas + active mode
exports.getMyPersonas = async (req, res) => {
  try {
    const user = await ensurePersonasForUser(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const [publicPersona, anonPersona] = await Promise.all([
      Persona.findById(user.publicPersonaId).select('id type handle displayName profilePic coverPhoto bio followers following isConfigured'),
      Persona.findById(user.anonPersonaId).select('id type handle displayName profilePic coverPhoto bio followers following isConfigured'),
    ]);

    return res.status(200).json({
      success: true,
      activeMode: user.activeMode || 'public',
      personas: {
        public: publicPersona
          ? {
              id: publicPersona._id,
              type: publicPersona.type,
              handle: publicPersona.handle,
              displayName: publicPersona.displayName,
              profilePic: publicPersona.profilePic,
              coverPhoto: publicPersona.coverPhoto,
              bio: publicPersona.bio,
              isConfigured: !!publicPersona.isConfigured,
              followersCount: publicPersona.followers?.length || 0,
              followingCount: publicPersona.following?.length || 0,
            }
          : null,
        anon: anonPersona
          ? {
              id: anonPersona._id,
              type: anonPersona.type,
              handle: anonPersona.handle,
              displayName: anonPersona.displayName,
              profilePic: anonPersona.profilePic,
              coverPhoto: anonPersona.coverPhoto,
              bio: anonPersona.bio,
              isConfigured: !!anonPersona.isConfigured,
              followersCount: anonPersona.followers?.length || 0,
              followingCount: anonPersona.following?.length || 0,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Get my personas error:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching personas', error: error.message });
  }
};

// @desc    Set surf mode (public|anon)
exports.setMyMode = async (req, res) => {
  try {
    const mode = (req.body?.mode || '').toString().trim().toLowerCase();
    if (!['public', 'anon'].includes(mode)) {
      return res.status(400).json({ success: false, message: 'mode must be "public" or "anon"' });
    }

    const user = await ensurePersonasForUser(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // ✅ If switching to anon for the first time, require setup
    if (mode === 'anon') {
      const anonPersona = await Persona.findById(user.anonPersonaId).select('id type handle displayName isConfigured');
      if (!anonPersona) return res.status(404).json({ success: false, message: 'Anonymous persona not found' });

      if (!anonPersona.isConfigured) {
        return res.status(409).json({
          success: false,
          setupRequired: true,
          message: 'Anonymous persona setup required',
          activeMode: user.activeMode || 'public',
          anonPersona: {
            id: anonPersona._id,
            handle: anonPersona.handle, // placeholder (client may ignore)
            displayName: anonPersona.displayName,
            isConfigured: false,
          },
        });
      }
    }

    user.activeMode = mode;
    await user.save();

    return res.status(200).json({ success: true, activeMode: user.activeMode });
  } catch (error) {
    console.error('Set my mode error:', error);
    return res.status(500).json({ success: false, message: 'Server error while updating mode', error: error.message });
  }
};

// ✅ NEW: setup endpoint (user chooses anonymous username + profile fields)
exports.setupMyAnonPersona = async (req, res) => {
  try {
    const user = await ensurePersonasForUser(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const handle = (req.body?.handle || '').toString().trim().toLowerCase();
    const displayName = (req.body?.displayName || '').toString().trim();
    const bio = typeof req.body?.bio === 'string' ? req.body.bio.trim() : '';

    const anonPersona = await Persona.findOne({
      _id: user.anonPersonaId,
      ownerUserId: user._id,
      type: 'anon',
    }).select('id type handle displayName profilePic coverPhoto bio isConfigured');

    if (!anonPersona) return res.status(404).json({ success: false, message: 'Anonymous persona not found' });

    // Set chosen fields
    anonPersona.handle = handle;
    anonPersona.displayName = displayName;
    anonPersona.bio = bio;
    anonPersona.isConfigured = true;

    await anonPersona.save();

    return res.status(200).json({
      success: true,
      persona: {
        id: anonPersona._id,
        type: anonPersona.type,
        handle: anonPersona.handle,
        displayName: anonPersona.displayName,
        profilePic: anonPersona.profilePic,
        coverPhoto: anonPersona.coverPhoto,
        bio: anonPersona.bio,
        isConfigured: true,
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: 'Anonymous username is already taken' });
    }
    console.error('Setup anon persona error:', error);
    return res.status(500).json({ success: false, message: 'Server error while setting up anonymous persona', error: error.message });
  }
};

// ✅ NEW: upload anon profile picture
exports.updateMyAnonPersonaProfilePic = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No image uploaded. Send multipart/form-data with field name "image".' });
    }

    const user = await ensurePersonasForUser(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const anonPersona = await Persona.findOne({ _id: user.anonPersonaId, ownerUserId: user._id, type: 'anon' }).select('_id profilePic');
    if (!anonPersona) return res.status(404).json({ success: false, message: 'Anonymous persona not found' });

    const personaId = anonPersona._id.toString();

    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'threadsats/personas/profile_pics',
          resource_type: 'image',
          overwrite: true,
          public_id: `persona_${personaId}_profile`,
        },
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        }
      );

      const readable = new Readable();
      readable.push(req.file.buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });

    anonPersona.profilePic = uploadResult.secure_url;
    await anonPersona.save();

    return res.status(200).json({ success: true, profilePic: anonPersona.profilePic });
  } catch (error) {
    console.error('Update anon persona profile pic error:', error);
    return res.status(500).json({ success: false, message: 'Server error while updating anon profile pic', error: error.message });
  }
};

// ✅ NEW: upload anon cover photo
exports.updateMyAnonPersonaCoverPhoto = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No image uploaded. Send multipart/form-data with field name "image".' });
    }

    const user = await ensurePersonasForUser(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const anonPersona = await Persona.findOne({ _id: user.anonPersonaId, ownerUserId: user._id, type: 'anon' }).select('_id coverPhoto');
    if (!anonPersona) return res.status(404).json({ success: false, message: 'Anonymous persona not found' });

    const personaId = anonPersona._id.toString();

    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'threadsats/personas/cover_photos',
          resource_type: 'image',
          overwrite: true,
          public_id: `persona_${personaId}_cover`,
        },
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        }
      );

      const readable = new Readable();
      readable.push(req.file.buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });

    anonPersona.coverPhoto = uploadResult.secure_url;
    await anonPersona.save();

    return res.status(200).json({ success: true, coverPhoto: anonPersona.coverPhoto });
  } catch (error) {
    console.error('Update anon persona cover photo error:', error);
    return res.status(500).json({ success: false, message: 'Server error while updating anon cover photo', error: error.message });
  }
};

// ✅ Get my profile for ACTIVE persona (public or anon)
exports.getMyProfile = async (req, res) => {
  try {
    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    if (ctx.activeMode === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) {
        return res.status(409).json({
          success: false,
          setupRequired: true,
          message: 'Anonymous persona setup required',
          activeMode: ctx.activeMode,
        });
      }
    }

    const mePersona = await Persona.findById(ctx.activePersonaId).select(
      'handle displayName profilePic coverPhoto bio rollNumber department batch type followers following isConfigured'
    );

    if (!mePersona) return res.status(404).json({ success: false, message: 'Persona not found' });

    const threadsCount = await Thread.countDocuments({
      authorPersona: ctx.activePersonaId,
      isDeleted: false,
    });

    return res.status(200).json({
      success: true,
      activeMode: ctx.activeMode,
      persona: {
        id: mePersona._id,
        type: mePersona.type,
        username: mePersona.handle,
        displayName: mePersona.displayName,
        profilePic: mePersona.profilePic,
        coverPhoto: mePersona.coverPhoto,
        bio: mePersona.bio,
        rollNumber: mePersona.rollNumber,
        department: mePersona.department || (mePersona.type === 'anon' ? 'COMSATS Student' : ''),
        batch: mePersona.batch,
        isConfigured: !!mePersona.isConfigured,
        followersCount: (mePersona.followers || []).length,
        followingCount: (mePersona.following || []).length,
        threadsCount,
        isOwnProfile: true,
      },
    });
  } catch (error) {
    console.error('Get my profile error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ✅ Get my activity for ACTIVE persona (public or anon)
exports.getMyActivity = async (req, res) => {
  try {
    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    if (ctx.activeMode === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) {
        return res.status(409).json({
          success: false,
          setupRequired: true,
          message: 'Anonymous persona setup required',
          activeMode: ctx.activeMode,
        });
      }
    }

    const type = req.query.type || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const targetPersonaId = ctx.activePersonaId;

    let activity = [];

    if (type === 'threads' || type === 'all') {
      const threads = await Thread.find({ authorPersona: targetPersonaId, isDeleted: false })
        .populate('authorPersona', 'handle displayName profilePic coverPhoto bio rollNumber department batch type')
        .sort({ createdAt: -1 })
        .lean();

      activity.push(...threads.map((t) => formatThreadFromDoc(t, targetPersonaId, ctx.ownedPersonaIds)));
    }

    if (type === 'likes') {
      const likedThreads = await Thread.find({ likes: targetPersonaId, isDeleted: false })
        .populate('authorPersona', 'handle displayName profilePic coverPhoto bio rollNumber department batch type')
        .sort({ createdAt: -1 })
        .lean();

      activity.push(...likedThreads.map((t) => formatThreadFromDoc(t, targetPersonaId, ctx.ownedPersonaIds)));
    }

    if (type === 'replies' || type === 'all') {
      const comments = await Comment.find({ authorPersona: targetPersonaId, isDeleted: false })
        .populate('authorPersona', 'handle displayName profilePic rollNumber department batch type')
        .populate('threadId', 'content')
        .populate({
          path: 'parentCommentId',
          select: 'content authorPersona',
          populate: { path: 'authorPersona', select: 'handle' },
        })
        .sort({ createdAt: -1 })
        .lean();

      activity.push(...comments.map((c) => formatCommentFromDoc(c, targetPersonaId, ctx.ownedPersonaIds)));
    }

    activity.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = activity.length;
    const paginatedActivity = activity.slice(skip, skip + limit);

    const mePersona = await Persona.findById(targetPersonaId).select(
      'handle displayName profilePic coverPhoto bio rollNumber department batch type'
    );

    return res.status(200).json({
      success: true,
      activeMode: ctx.activeMode,
      count: paginatedActivity.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      user: {
        id: targetPersonaId,
        username: mePersona?.handle || '',
        displayName: mePersona?.displayName || '',
        profilePic: mePersona?.profilePic || '',
        rollNumber: mePersona?.rollNumber || '',
        department: mePersona?.department || (mePersona?.type === 'anon' ? 'COMSATS Student' : ''),
        batch: mePersona?.batch || '',
        bio: mePersona?.bio || '',
      },
      activity: paginatedActivity,
    });
  } catch (error) {
    console.error('Get my activity error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};