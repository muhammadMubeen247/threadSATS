const Comment = require('../models/Comment');
const Thread = require('../models/Thread');
const mongoose = require('mongoose');

// Helper function to format comment response
const formatComment = (comment, userId = null) => {
  const formatted = {
    id: comment._id,
    content: comment.isDeleted ? '[deleted]' : comment.content,
    isAnonymous: comment.isAnonymous,
    likes: comment.likes,
    likesCount: comment.likesCount || comment.likes.length,
    replyCount: comment.replyCount,
    depth: comment.depth,
    threadId: comment.threadId,
    parentCommentId: comment.parentCommentId,
    isDeleted: comment.isDeleted,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };

  // Only show author info if not deleted and not anonymous
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

  // Add user-specific flags
  if (userId) {
    formatted.isLiked = comment.likes.some(
      (likeId) => likeId.toString() === userId.toString()
    );
    formatted.isOwner = comment.author && comment.author._id.toString() === userId.toString();
  }

  return formatted;
};

// @desc    Create a comment on a thread
// @route   POST /api/threads/:threadId/comments
// @access  Private
const createComment = async (req, res) => {
  try {
    const { threadId } = req.params;
    const { content, isAnonymous } = req.body;

    // Validate thread ID
    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid thread ID',
      });
    }

    // Check if thread exists and is not deleted
    const thread = await Thread.findOne({ _id: threadId, isDeleted: false });

    if (!thread) {
      return res.status(404).json({
        success: false,
        message: 'Thread not found',
      });
    }

    // Create comment
    const comment = await Comment.create({
      content,
      author: req.user.id,
      threadId,
      isAnonymous: isAnonymous || false,
      depth: 0, // Direct comment on thread
    });

    // Populate author
    await comment.populate('author', 'username profilePic rollNumber department batch');

    res.status(201).json({
      success: true,
      message: 'Comment created successfully',
      comment: formatComment(comment, req.user.id),
    });
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating comment',
      error: error.message,
    });
  }
};

// @desc    Reply to a comment
// @route   POST /api/comments/:commentId/reply
// @access  Private
const replyToComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content, isAnonymous } = req.body;

    // Validate comment ID
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid comment ID',
      });
    }

    // Check if parent comment exists
    const parentComment = await Comment.findById(commentId);

    if (!parentComment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }

    // Create reply
    const reply = await Comment.create({
      content,
      author: req.user.id,
      threadId: parentComment.threadId,
      parentCommentId: commentId,
      isAnonymous: isAnonymous || false,
      depth: parentComment.depth + 1,
    });

    // Populate author
    await reply.populate('author', 'username profilePic rollNumber department batch');

    res.status(201).json({
      success: true,
      message: 'Reply created successfully',
      comment: formatComment(reply, req.user.id),
    });
  } catch (error) {
    console.error('Reply to comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating reply',
      error: error.message,
    });
  }
};

// @desc    Get all comments for a thread (nested structure)
// @route   GET /api/threads/:threadId/comments
// @access  Public
const getThreadComments = async (req, res) => {
  try {
    const { threadId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Validate thread ID
    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid thread ID',
      });
    }

    // Check if thread exists
    const thread = await Thread.findOne({ _id: threadId, isDeleted: false });

    if (!thread) {
      return res.status(404).json({
        success: false,
        message: 'Thread not found',
      });
    }

    // Get top-level comments (parentCommentId is null)
    // Sort by likes count (most liked first)
    const topComments = await Comment.find({
      threadId,
      parentCommentId: null,
    })
      .populate('author', 'username profilePic rollNumber department batch')
      .sort({ likes: -1, createdAt: 1 }) // Most liked first, then chronological
      .skip(skip)
      .limit(limit)
      .lean();

    // Get all replies for these comments
    const commentIds = topComments.map((c) => c._id);
    const replies = await Comment.find({
      parentCommentId: { $in: commentIds },
    })
      .populate('author', 'username profilePic rollNumber department batch')
      .sort({ likes: -1, createdAt: 1 })
      .lean();

    // Organize replies under their parent comments
    const commentsWithReplies = topComments.map((comment) => {
      const commentReplies = replies.filter(
        (reply) => reply.parentCommentId.toString() === comment._id.toString()
      );

      return {
        ...formatComment(comment, req.user?.id),
        replies: commentReplies.map((reply) => formatComment(reply, req.user?.id)),
      };
    });

    // Get total count
    const total = await Comment.countDocuments({
      threadId,
      parentCommentId: null,
    });

    res.status(200).json({
      success: true,
      count: commentsWithReplies.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      comments: commentsWithReplies,
    });
  } catch (error) {
    console.error('Get thread comments error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching comments',
      error: error.message,
    });
  }
};

// @desc    Get replies for a specific comment
// @route   GET /api/comments/:commentId/replies
// @access  Public
const getCommentReplies = async (req, res) => {
  try {
    const { commentId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Validate comment ID
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid comment ID',
      });
    }

    // Check if parent comment exists
    const parentComment = await Comment.findById(commentId);

    if (!parentComment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }

    // Get replies
    const replies = await Comment.find({
      parentCommentId: commentId,
    })
      .populate('author', 'username profilePic rollNumber department batch')
      .sort({ likes: -1, createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count
    const total = await Comment.countDocuments({
      parentCommentId: commentId,
    });

    // Format replies
    const formattedReplies = replies.map((reply) => formatComment(reply, req.user?.id));

    res.status(200).json({
      success: true,
      count: formattedReplies.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      replies: formattedReplies,
    });
  } catch (error) {
    console.error('Get comment replies error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching replies',
      error: error.message,
    });
  }
};

// @desc    Delete a comment (soft delete)
// @route   DELETE /api/comments/:commentId
// @access  Private
const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;

    // Validate comment ID
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid comment ID',
      });
    }

    const comment = await Comment.findById(commentId);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }

    // Check if user is the author
    if (comment.author.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this comment',
      });
    }

    // Soft delete - mark as deleted but keep children
    comment.isDeleted = true;
    comment.content = '[deleted]'; // Optional: clear content
    await comment.save();

    res.status(200).json({
      success: true,
      message: 'Comment deleted successfully',
    });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting comment',
      error: error.message,
    });
  }
};

// @desc    Like/Unlike a comment
// @route   PUT /api/comments/:commentId/like
// @access  Private
const toggleCommentLike = async (req, res) => {
  try {
    const { commentId } = req.params;

    // Validate comment ID
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid comment ID',
      });
    }

    const comment = await Comment.findById(commentId);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }

    const userId = req.user.id;
    const likeIndex = comment.likes.indexOf(userId);

    if (likeIndex > -1) {
      // Unlike
      comment.likes.splice(likeIndex, 1);
      await comment.save();

      return res.status(200).json({
        success: true,
        message: 'Comment unliked',
        isLiked: false,
        likesCount: comment.likes.length,
      });
    } else {
      // Like
      comment.likes.push(userId);
      await comment.save();

      return res.status(200).json({
        success: true,
        message: 'Comment liked',
        isLiked: true,
        likesCount: comment.likes.length,
      });
    }
  } catch (error) {
    console.error('Toggle comment like error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while toggling like',
      error: error.message,
    });
  }
};

// @desc    Get a single comment by ID
// @route   GET /api/comments/:commentId
// @access  Public
const getCommentById = async (req, res) => {
  try {
    const { commentId } = req.params;

    // Validate comment ID
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid comment ID',
      });
    }

    const comment = await Comment.findById(commentId)
      .populate('author', 'username profilePic rollNumber department batch')
      .lean();

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }

    res.status(200).json({
      success: true,
      comment: formatComment(comment, req.user?.id),
    });
  } catch (error) {
    console.error('Get comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching comment',
      error: error.message,
    });
  }
};

module.exports = {
  createComment,
  replyToComment,
  getThreadComments,
  getCommentReplies,
  deleteComment,
  toggleCommentLike,
  getCommentById,
};