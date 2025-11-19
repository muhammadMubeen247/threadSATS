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
    type: 'thread', // Add type for frontend
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
    type: 'comment', // Add type for frontend
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

  // Include thread info for context
  if (comment.threadId) {
    formatted.thread = {
      id: comment.threadId._id,
      content: comment.threadId.content?.substring(0, 100) + '...',
    };
  }

  // Include parent comment info if it's a reply
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

// @desc    Get user activity (Home tab - threads + comments)
// @route   GET /api/users/:userId/activity?type=all
// @access  Public
exports.getUserActivity = async (req, res) => {
  try {
    const { userId } = req.params;
    const type = req.query.type || 'all'; // all, threads, replies
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Validate user ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID',
      });
    }

    // Check if user exists
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
      // Get public threads only
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

    if (type === 'replies' || type === 'all') {
      // Get all comments (not deleted)
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

    // Sort combined activity by date
    activity.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Paginate
    total = activity.length;
    const paginatedActivity = activity.slice(skip, skip + limit);

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
        isFollowing: req.user
          ? user.followers.some((f) => f.toString() === req.user.id)
          : false,
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

// module.exports = {
//   getUserActivity,
// };