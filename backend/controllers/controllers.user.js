const Thread = require('../models/Thread');
const Comment = require('../models/Comment');
const User = require('../models/User');
const mongoose = require('mongoose');

// Helper function to format thread
const formatThread = (thread, userId = null) => {
  const formatted = {
    id: thread._id,
    content: thread.content,
    isAnonymous: thread.isAnonymous,
    images: thread.images,
    likes: thread.likes,
    likesCount: thread.likes.length,
    commentCount: thread.commentCount,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    type: 'thread',
  };

  if (!thread.isAnonymous && thread.author) {
    formatted.author = {
      id: thread.author._id,
      username: thread.author.username,
      profilePic: thread.author.profilePic,
      rollNumber: thread.author.rollNumber,
      department: thread.author.department,
      batch: thread.author.batch,
    };
  } else {
    formatted.author = {
      username: 'Anonymous',
      profilePic: '',
      department: 'COMSATS Student',
    };
  }

  if (userId) {
    formatted.isLiked = thread.likes.some(
      (likeId) => likeId.toString() === userId.toString()
    );
    formatted.isOwner = thread.author && thread.author._id.toString() === userId.toString();
  }

  return formatted;
};

// Helper function to format comment
const formatComment = (comment, userId = null) => {
  const formatted = {
    id: comment._id,
    content: comment.isDeleted ? '[deleted]' : comment.content,
    isAnonymous: comment.isAnonymous,
    likes: comment.likes,
    likesCount: comment.likes.length,
    replyCount: comment.replyCount,
    depth: comment.depth,
    threadId: comment.threadId,
    parentCommentId: comment.parentCommentId,
    isDeleted: comment.isDeleted,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    type: 'comment',
  };

  if (!comment.isDeleted && !comment.isAnonymous && comment.author) {
    formatted.author = {
      id: comment.author._id,
      username: comment.author.username,
      profilePic: comment.author.profilePic,
      rollNumber: comment.author.rollNumber,
      department: comment.author.department,
      batch: comment.author.batch,
    };
  } else if (comment.isDeleted) {
    formatted.author = {
      username: '[deleted]',
      profilePic: '',
    };
  } else {
    formatted.author = {
      username: 'Anonymous',
      profilePic: '',
      department: 'COMSATS Student',
    };
  }

  if (comment.threadId) {
    formatted.thread = {
      id: comment.threadId._id,
      content: comment.threadId.content?.substring(0, 100) + '...',
    };
  }

  if (comment.parentCommentId) {
    formatted.parentComment = {
      id: comment.parentCommentId._id,
      content: comment.parentCommentId.content?.substring(0, 50) + '...',
      author: comment.parentCommentId.author?.username || 'Anonymous',
    };
  }

  if (userId) {
    formatted.isLiked = comment.likes.some(
      (likeId) => likeId.toString() === userId.toString()
    );
    formatted.isOwner = comment.author && comment.author._id.toString() === userId.toString();
  }

  return formatted;
};

// Helper to check if two users have blocked each other
const areUsersBlocked = async (userId1, userId2) => {
  const [user1, user2] = await Promise.all([
    User.findById(userId1).select('blockedUsers'),
    User.findById(userId2).select('blockedUsers'),
  ]);

  const user1BlockedUser2 = user1?.blockedUsers.some((id) => id.toString() === userId2);
  const user2BlockedUser1 = user2?.blockedUsers.some((id) => id.toString() === userId1);

  return user1BlockedUser2 || user2BlockedUser1;
};

// @desc    Get user activity (Home tab - threads + comments)
// @route   GET /api/users/:userId/activity?type=all
// @access  Public
exports.getUserActivity = async (req, res) => {
  try {
    const { userId } = req.params;
    const type = req.query.type || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID',
      });
    }

    // Check if users have blocked each other
    if (req.user) {
      const isBlocked = await areUsersBlocked(req.user.id, userId);
      if (isBlocked) {
        return res.status(403).json({
          success: false,
          message: 'Cannot view this user profile',
        });
      }
    }

    const user = await User.findById(userId).select(
      'username profilePic rollNumber department batch bio followers following'
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    let activity = [];
    let total = 0;

    if (type === 'threads' || type === 'all') {
      const threads = await Thread.find({
        author: userId,
        isAnonymous: false,
        isDeleted: false,
      })
        .populate('author', 'username profilePic rollNumber department batch')
        .sort({ createdAt: -1 })
        .lean();

      activity.push(...threads.map((t) => formatThread(t, req.user?.id)));
    }

    // ✅ NEW: liked threads
    if (type === 'likes') {
      const likedThreads = await Thread.find({
        likes: userId,          // user has liked this thread
        isDeleted: false,
      })
        .populate('author', 'username profilePic rollNumber department batch')
        .sort({ createdAt: -1 })
        .lean();

      activity.push(...likedThreads.map((t) => formatThread(t, req.user?.id)));
    }

    if (type === 'replies' || type === 'all') {
      const comments = await Comment.find({
        author: userId,
        isDeleted: false,
      })
        .populate('author', 'username profilePic rollNumber department batch')
        .populate('threadId', 'content')
        .populate('parentCommentId', 'content author')
        .sort({ createdAt: -1 })
        .lean();

      activity.push(...comments.map((c) => formatComment(c, req.user?.id)));
    }

    activity.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    total = activity.length;
    const paginatedActivity = activity.slice(skip, skip + limit);

    const isFollowing = req.user
      ? user.followers.some((f) => f.toString() === req.user.id)
      : false;

    const isMutual =
      req.user && isFollowing
        ? user.following.some((f) => f.toString() === req.user.id)
        : false;

    res.status(200).json({
      success: true,
      count: paginatedActivity.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      user: {
        id: user._id,
        username: user.username,
        profilePic: user.profilePic,
        rollNumber: user.rollNumber,
        department: user.department,
        batch: user.batch,
        bio: user.bio,
        followersCount: user.followers.length,
        followingCount: user.following.length,
        isFollowing,
        isMutual,
      },
      activity: paginatedActivity,
    });
  } catch (error) {
    console.error('Get user activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user activity',
      error: error.message,
    });
  }
};

// @desc    Follow a user
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

    // Check if users have blocked each other
    const isBlocked = await areUsersBlocked(currentUserId, userId);
    if (isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Cannot follow this user',
      });
    }

    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(userId),
    ]);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if already following
    const alreadyFollowing = currentUser.following.includes(userId);

    if (alreadyFollowing) {
      return res.status(400).json({
        success: false,
        message: 'Already following this user',
      });
    }

    // Add to following and followers
    currentUser.following.push(userId);
    targetUser.followers.push(currentUserId);

    await Promise.all([currentUser.save(), targetUser.save()]);

    // Check if mutual
    const isMutual = targetUser.following.includes(currentUserId);

    res.status(200).json({
      success: true,
      message: 'Successfully followed user',
      isMutual,
    });
  } catch (error) {
    console.error('Follow user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while following user',
      error: error.message,
    });
  }
};

// @desc    Unfollow a user
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

    if (userId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot unfollow yourself',
      });
    }

    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(userId),
    ]);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if following
    const isFollowing = currentUser.following.includes(userId);

    if (!isFollowing) {
      return res.status(400).json({
        success: false,
        message: 'Not following this user',
      });
    }

    // Remove from following and followers
    currentUser.following = currentUser.following.filter(
      (id) => id.toString() !== userId
    );
    targetUser.followers = targetUser.followers.filter(
      (id) => id.toString() !== currentUserId
    );

    await Promise.all([currentUser.save(), targetUser.save()]);

    res.status(200).json({
      success: true,
      message: 'Successfully unfollowed user',
    });
  } catch (error) {
    console.error('Unfollow user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while unfollowing user',
      error: error.message,
    });
  }
};

// @desc    Get user's followers
// @route   GET /api/users/:userId/followers
// @access  Public
exports.getFollowers = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID',
      });
    }

    // Check if blocked
    if (req.user) {
      const isBlocked = await areUsersBlocked(req.user.id, userId);
      if (isBlocked) {
        return res.status(403).json({
          success: false,
          message: 'Cannot view this user profile',
        });
      }
    }

    const user = await User.findById(userId)
      .select('followers')
      .populate({
        path: 'followers',
        select: 'username profilePic rollNumber department batch followers following',
        options: {
          skip,
          limit,
        },
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Format followers with follow status
    const followers = user.followers.map((follower) => {
      const isFollowing = req.user
        ? follower.followers.some((id) => id.toString() === req.user.id)
        : false;

      const isMutual = req.user && isFollowing
        ? follower.following.some((id) => id.toString() === req.user.id)
        : false;

      return {
        id: follower._id,
        username: follower.username,
        profilePic: follower.profilePic,
        rollNumber: follower.rollNumber,
        department: follower.department,
        batch: follower.batch,
        followersCount: follower.followers.length,
        followingCount: follower.following.length,
        isFollowing,
        isMutual,
      };
    });

    const total = await User.findById(userId).select('followers');
    const totalCount = total.followers.length;

    res.status(200).json({
      success: true,
      count: followers.length,
      total: totalCount,
      page,
      pages: Math.ceil(totalCount / limit),
      followers,
    });
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching followers',
      error: error.message,
    });
  }
};

// @desc    Get user's following
// @route   GET /api/users/:userId/following
// @access  Public
exports.getFollowing = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID',
      });
    }

    // Check if blocked
    if (req.user) {
      const isBlocked = await areUsersBlocked(req.user.id, userId);
      if (isBlocked) {
        return res.status(403).json({
          success: false,
          message: 'Cannot view this user profile',
        });
      }
    }

    const user = await User.findById(userId)
      .select('following')
      .populate({
        path: 'following',
        select: 'username profilePic rollNumber department batch followers following',
        options: {
          skip,
          limit,
        },
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const following = user.following.map((followedUser) => {
      const isFollowing = req.user
        ? followedUser.followers.some((id) => id.toString() === req.user.id)
        : false;

      const isMutual = req.user && isFollowing
        ? followedUser.following.some((id) => id.toString() === req.user.id)
        : false;

      return {
        id: followedUser._id,
        username: followedUser.username,
        profilePic: followedUser.profilePic,
        rollNumber: followedUser.rollNumber,
        department: followedUser.department,
        batch: followedUser.batch,
        followersCount: followedUser.followers.length,
        followingCount: followedUser.following.length,
        isFollowing,
        isMutual,
      };
    });

    const total = await User.findById(userId).select('following');
    const totalCount = total.following.length;

    res.status(200).json({
      success: true,
      count: following.length,
      total: totalCount,
      page,
      pages: Math.ceil(totalCount / limit),
      following,
    });
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching following',
      error: error.message,
    });
  }
};

const escapeRegExp = (s = '') => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// @desc    Search users
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
      return res.status(400).json({
        success: false,
        message: 'Search query is required',
      });
    }

    // ✅ PREFIX match: starts with query
    const escaped = escapeRegExp(query);
    const prefixRegex = new RegExp(`^${escaped}`, 'i');

    const searchCriteria = {
      $or: [
        { username: { $regex: prefixRegex } },
        { rollNumber: { $regex: prefixRegex } },
        { department: { $regex: prefixRegex } },
      ],
    };

    // If user is authenticated, exclude blocked users
    if (req.user) {
      const currentUser = await User.findById(req.user.id).select('blockedUsers');
      const blockedByCurrentUser = currentUser.blockedUsers;

      const usersWhoBlockedMe = await User.find({
        blockedUsers: req.user.id,
      }).select('_id');

      const blockedUserIds = [
        ...blockedByCurrentUser,
        ...usersWhoBlockedMe.map((u) => u._id),
      ];

      if (blockedUserIds.length > 0) {
        searchCriteria._id = { $nin: blockedUserIds };
      }
    }

    const total = await User.countDocuments(searchCriteria);

    const users = await User.find(searchCriteria)
      .select('username profilePic rollNumber department batch followers following')
      .skip(skip)
      .limit(limit)
      .lean();

    const formattedUsers = users.map((user) => {
      const isFollowing = req.user
        ? user.followers.some((id) => id.toString() === req.user.id)
        : false;

      const isMutual = req.user && isFollowing
        ? user.following.some((id) => id.toString() === req.user.id)
        : false;

      const isCurrentUser = req.user ? user._id.toString() === req.user.id : false;

      return {
        id: user._id,
        username: user.username,
        profilePic: user.profilePic,
        rollNumber: user.rollNumber,
        department: user.department,
        batch: user.batch,
        followersCount: user.followers.length,
        followingCount: user.following.length,
        isFollowing,
        isMutual,
        isCurrentUser,
      };
    });

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
    return res.status(500).json({
      success: false,
      message: 'Server error while searching users',
      error: error.message,
    });
  }
};

// @desc    Block a user
// @route   POST /api/users/:userId/block
// @access  Private
exports.blockUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID',
      });
    }

    if (userId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot block yourself',
      });
    }

    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(userId),
    ]);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if already blocked
    const alreadyBlocked = currentUser.blockedUsers.includes(userId);

    if (alreadyBlocked) {
      return res.status(400).json({
        success: false,
        message: 'User already blocked',
      });
    }

    // Remove from followers/following if they exist
    currentUser.following = currentUser.following.filter(
      (id) => id.toString() !== userId
    );
    currentUser.followers = currentUser.followers.filter(
      (id) => id.toString() !== userId
    );
    targetUser.following = targetUser.following.filter(
      (id) => id.toString() !== currentUserId
    );
    targetUser.followers = targetUser.followers.filter(
      (id) => id.toString() !== currentUserId
    );

    // Add to blocked list
    currentUser.blockedUsers.push(userId);

    await Promise.all([currentUser.save(), targetUser.save()]);

    res.status(200).json({
      success: true,
      message: 'User blocked successfully',
    });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while blocking user',
      error: error.message,
    });
  }
};

// @desc    Unblock a user
// @route   DELETE /api/users/:userId/unblock
// @access  Private
exports.unblockUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID',
      });
    }

    const currentUser = await User.findById(currentUserId);

    const isBlocked = currentUser.blockedUsers.includes(userId);

    if (!isBlocked) {
      return res.status(400).json({
        success: false,
        message: 'User is not blocked',
      });
    }

    // Remove from blocked list
    currentUser.blockedUsers = currentUser.blockedUsers.filter(
      (id) => id.toString() !== userId
    );

    await currentUser.save();

    res.status(200).json({
      success: true,
      message: 'User unblocked successfully',
    });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while unblocking user',
      error: error.message,
    });
  }
};

// @desc    Get blocked users list
// @route   GET /api/users/blocked
// @access  Private
exports.getBlockedUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const user = await User.findById(req.user.id)
      .select('blockedUsers')
      .populate({
        path: 'blockedUsers',
        select: 'username profilePic rollNumber department batch',
        options: {
          skip,
          limit,
        },
      });

    const blockedUsers = user.blockedUsers.map((blockedUser) => ({
      id: blockedUser._id,
      username: blockedUser.username,
      profilePic: blockedUser.profilePic,
      rollNumber: blockedUser.rollNumber,
      department: blockedUser.department,
      batch: blockedUser.batch,
    }));

    const totalUser = await User.findById(req.user.id).select('blockedUsers');
    const total = totalUser.blockedUsers.length;

    res.status(200).json({
      success: true,
      count: blockedUsers.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      blockedUsers,
    });
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching blocked users',
      error: error.message,
    });
  }
};

//@desc Get a user profile by username
//@route GET /api/users/:username/profile
//@access Public
exports.getUserProfile = async (req, res) => {
  try {
    const { username } = req.params; // Changed from userId

    // Find user by username (case-insensitive)
    const user = await User.findOne({ 
      username: username.toLowerCase() 
    }).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if blocked (if req.user exists)
    if (req.user) {
      const blocked = await areUsersBlocked(req.user.id, user._id);
      if (blocked) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }
    }

    // Calculate relationship flags
    let isFollowing = false;
    let isMutual = false;
    const isCurrentUser = req.user?.id === user._id.toString();

    if (req.user && !isCurrentUser) {
      isFollowing = user.followers.includes(req.user.id);
      isMutual = isFollowing && user.following.includes(req.user.id);
    }

    // Get thread count
    const threadsCount = await Thread.countDocuments({
      author: user._id,
      isDeleted: false,
    });

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        profilePic: user.profilePic,
        coverPhoto: user.coverPhoto || null,
        bio: user.bio || '',
        rollNumber: user.rollNumber,
        department: user.department,
        batch: user.batch,
        followersCount: user.followers.length,
        followingCount: user.following.length,
        threadsCount,
        isFollowing,
        isMutual,
        isCurrentUser,
      },
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// module.exports = {
//   getUserActivity,
//   followUser,
//   unfollowUser,
//   getFollowers,
//   getFollowing,
//   searchUsers,
//   blockUser,
//   unblockUser,
//   getBlockedUsers,
// };