const Comment = require('../models/Comment');
const Thread = require('../models/Thread');
const User = require('../models/User');
const mongoose = require('mongoose');

// Helper function to format comment response
const formatComment = (comment, userId = null, includePreview = false, previewReplies = []) => {
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
  };

  // Author information
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

  // User interaction status
  if (userId) {
    formatted.isLiked = comment.likes.some(
      (likeId) => likeId.toString() === userId.toString()
    );
    formatted.isOwner =
      comment.author && comment.author._id.toString() === userId.toString();
  }

  // Include preview replies (2 most liked) if requested
  if (includePreview && previewReplies.length > 0) {
    formatted.previewReplies = previewReplies.map((reply) =>
      formatComment(reply, userId, false)
    );
  }

  return formatted;
};

// @desc    Create a comment on a thread
// @route   POST /api/threads/:threadId/comments
// @access  Private
const createComment = async (req, res) => {
  try {
    const { threadId } = req.params;
    const { content, isAnonymous = false } = req.body;

    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid thread ID',
      });
    }

    const thread = await Thread.findOne({
      _id: threadId,
      isDeleted: false,
    });

    if (!thread) {
      return res.status(404).json({
        success: false,
        message: 'Thread not found',
      });
    }

    // Check if user is blocked by thread author
    if (!thread.isAnonymous) {
      const threadAuthor = await User.findById(thread.author).select(
        'blockedUsers'
      );
      if (
        threadAuthor &&
        threadAuthor.blockedUsers.some(
          (id) => id.toString() === req.user.id
        )
      ) {
        return res.status(403).json({
          success: false,
          message: 'Cannot comment on this thread',
        });
      }
    }

    const comment = await Comment.create({
      content,
      author: req.user.id,
      threadId,
      isAnonymous,
      depth: 0,
    });

    // Increment thread comment count
    thread.commentCount += 1;
    await thread.save();

    const populatedComment = await Comment.findById(comment._id).populate(
      'author',
      'username profilePic rollNumber department batch'
    );

    res.status(201).json({
      success: true,
      message: 'Comment created successfully',
      comment: formatComment(populatedComment, req.user.id),
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
    const { content, isAnonymous = false } = req.body;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid comment ID',
      });
    }

    const parentComment = await Comment.findOne({
      _id: commentId,
      isDeleted: false,
    }).populate('threadId');

    if (!parentComment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }

    // Check if parent comment author blocked current user
    if (!parentComment.isAnonymous) {
      const commentAuthor = await User.findById(parentComment.author).select(
        'blockedUsers'
      );
      if (
        commentAuthor &&
        commentAuthor.blockedUsers.some(
          (id) => id.toString() === req.user.id
        )
      ) {
        return res.status(403).json({
          success: false,
          message: 'Cannot reply to this comment',
        });
      }
    }

    const reply = await Comment.create({
      content,
      author: req.user.id,
      threadId: parentComment.threadId._id,
      parentCommentId: commentId,
      isAnonymous,
      depth: parentComment.depth + 1,
    });

    // Increment parent comment reply count
    parentComment.replyCount += 1;
    await parentComment.save();

    const populatedReply = await Comment.findById(reply._id).populate(
      'author',
      'username profilePic rollNumber department batch'
    );

    res.status(201).json({
      success: true,
      message: 'Reply created successfully',
      reply: formatComment(populatedReply, req.user.id),
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

// @desc    Get all comments for a thread (top-level only with preview)
// @route   GET /api/threads/:threadId/comments
// @access  Public
const getThreadComments = async (req, res) => {
  try {
    const { threadId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid thread ID',
      });
    }

    const thread = await Thread.findOne({
      _id: threadId,
      isDeleted: false,
    });

    if (!thread) {
      return res.status(404).json({
        success: false,
        message: 'Thread not found',
      });
    }

    // Get total count of top-level comments
    const total = await Comment.countDocuments({
      threadId,
      parentCommentId: null,
      isDeleted: false,
    });

    // Get top-level comments
    const comments = await Comment.find({
      threadId,
      parentCommentId: null,
      isDeleted: false,
    })
      .populate('author', 'username profilePic rollNumber department batch')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // For each comment, get 2 most liked replies as preview
    const formattedComments = await Promise.all(
      comments.map(async (comment) => {
        let previewReplies = [];

        if (comment.replyCount > 0) {
          previewReplies = await Comment.find({
            parentCommentId: comment._id,
            isDeleted: false,
          })
            .populate(
              'author',
              'username profilePic rollNumber department batch'
            )
            .sort({ likes: -1 }) // Sort by most liked
            .limit(2)
            .lean();
        }

        return formatComment(
          comment,
          req.user?.id,
          comment.replyCount > 0,
          previewReplies
        );
      })
    );

    res.status(200).json({
      success: true,
      count: formattedComments.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      comments: formattedComments,
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

// @desc    Get replies for a specific comment (paginated)
// @route   GET /api/comments/:commentId/replies
// @access  Public
const getCommentReplies = async (req, res) => {
  try {
    const { commentId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10; // 10 replies per load
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid comment ID',
      });
    }

    const parentComment = await Comment.findById(commentId);

    if (!parentComment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }

    // Get total count of replies
    const total = await Comment.countDocuments({
      parentCommentId: commentId,
      isDeleted: false,
    });

    // Get paginated replies
    const replies = await Comment.find({
      parentCommentId: commentId,
      isDeleted: false,
    })
      .populate('author', 'username profilePic rollNumber department batch')
      .sort({ createdAt: 1 }) // Oldest first (chronological)
      .skip(skip)
      .limit(limit)
      .lean();

    // For each reply, get preview of its nested replies
    const formattedReplies = await Promise.all(
      replies.map(async (reply) => {
        let previewReplies = [];

        if (reply.replyCount > 0) {
          previewReplies = await Comment.find({
            parentCommentId: reply._id,
            isDeleted: false,
          })
            .populate(
              'author',
              'username profilePic rollNumber department batch'
            )
            .sort({ likes: -1 })
            .limit(2)
            .lean();
        }

        return formatComment(
          reply,
          req.user?.id,
          reply.replyCount > 0,
          previewReplies
        );
      })
    );

    res.status(200).json({
      success: true,
      count: formattedReplies.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      replies: formattedReplies,
      hasMore: page < Math.ceil(total / limit),
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

// @desc    Get single comment by ID
// @route   GET /api/comments/:commentId
// @access  Public
const getCommentById = async (req, res) => {
  try {
    const { commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid comment ID',
      });
    }

    const comment = await Comment.findById(commentId)
      .populate('author', 'username profilePic rollNumber department batch')
      .populate('threadId', 'content')
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
    console.error('Get comment by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching comment',
      error: error.message,
    });
  }
};

// @desc    Delete a comment
// @route   DELETE /api/comments/:commentId
// @access  Private
const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid comment ID',
      });
    }

    const comment = await Comment.findOne({
      _id: commentId,
      isDeleted: false,
    });

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

    // Soft delete
    comment.isDeleted = true;
    comment.content = '[deleted]';
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

// @desc    Toggle like on a comment
// @route   PUT /api/comments/:commentId/like
// @access  Private
const toggleCommentLike = async (req, res) => {
  try {
    const { commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid comment ID',
      });
    }

    const comment = await Comment.findOne({
      _id: commentId,
      isDeleted: false,
    });

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: 'Comment not found',
      });
    }

    const likeIndex = comment.likes.indexOf(req.user.id);
    let action;

    if (likeIndex > -1) {
      // Unlike
      comment.likes.splice(likeIndex, 1);
      action = 'unliked';
    } else {
      // Like
      comment.likes.push(req.user.id);
      action = 'liked';
    }

    await comment.save();

    res.status(200).json({
      success: true,
      message: `Comment ${action} successfully`,
      likesCount: comment.likes.length,
      isLiked: action === 'liked',
    });
  } catch (error) {
    console.error('Toggle comment like error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while toggling like',
      error: error.message,
    });
  }
};

module.exports = {
  createComment,
  replyToComment,
  getThreadComments,
  getCommentReplies,
  getCommentById,
  deleteComment,
  toggleCommentLike,
};