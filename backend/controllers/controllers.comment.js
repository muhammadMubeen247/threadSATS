const Comment = require('../models/Comment');
const Thread = require('../models/Thread');
const mongoose = require('mongoose');
const { getViewerContext, assertAnonConfigured } = require('../utils/personaContext');
const { resolveMentionsFromText } = require('../utils/mentions');
const Persona = require('../models/Persona');

const { upsertNotification } = require('../utils/notifications'); // ✅ add

const formatPersona = (p) => ({
  id: p?._id,
  username: p?.handle,
  displayName: p?.displayName || '',
  profilePic: p?.profilePic || '',
  rollNumber: p?.rollNumber || '',
  department: p?.department || (p?.type === 'anon' ? 'COMSATS Student' : ''),
  batch: p?.batch || '',
  type: p?.type || '',
});

const formatComment = (comment, viewerPersonaId = null, ownedPersonaIds = [], includePreview = false, previewReplies = []) => {
  const formatted = {
    id: comment._id,
    content: comment.isDeleted ? '[deleted]' : comment.content,
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

  if (comment.isDeleted) {
    formatted.author = { username: '[deleted]', profilePic: '' };
  } else {
    formatted.author = formatPersona(comment.authorPersona);
  }

  if (viewerPersonaId) {
    formatted.isLiked = comment.likes.some((likeId) => likeId.toString() === viewerPersonaId.toString());
  }

  formatted.isOwner =
    !!viewerPersonaId && comment.authorPersona?._id?.toString() === viewerPersonaId.toString();

  if (includePreview && previewReplies.length > 0) {
    formatted.previewReplies = previewReplies.map((reply) =>
      formatComment(reply, viewerPersonaId, ownedPersonaIds, false)
    );
  }

  return formatted;
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
  return set;
};

// POST /api/threads/:threadId/comments
exports.createComment = async (req, res) => {
  try {
    const { threadId } = req.params;
    const { content } = req.body;

    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ success: false, message: 'Invalid thread ID' });
    }

    const thread = await Thread.findOne({ _id: threadId, isDeleted: false }).select('_id authorPersona isDeleted');
    if (!thread) return res.status(404).json({ success: false, message: 'Thread not found' });

    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    if (ctx.activeMode === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) return res.status(409).json({ success: false, setupRequired: true, message: 'Anonymous persona setup required' });
    }

    // ✅ block enforcement: cannot comment on blocked/blockedBy thread author
    const blockedSet = await getBlockedPersonaIdSetForViewer(ctx.activePersonaId);
    if (blockedSet.has(thread.authorPersona.toString())) {
      return res.status(403).json({ success: false, message: 'Cannot interact with this content' });
    }

    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) return res.status(400).json({ success: false, message: 'Comment content is required' });

    const { personaIds: mentionedPersonaIds } = await resolveMentionsFromText(text);

    const comment = await Comment.create({
      threadId,
      authorPersona: ctx.activePersonaId,
      content: text,
      parentCommentId: null,
      depth: 0,
      mentions: mentionedPersonaIds,
    });

    await Thread.findByIdAndUpdate(threadId, { $inc: { commentCount: 1 } });

    // ✅ notification (aggregate) to thread author (skip self handled by util)
    upsertNotification({
      recipientPersonaId: thread.authorPersona,
      actorPersonaId: ctx.activePersonaId,
      type: 'comment',
      groupKey: `comment:thread:${threadId}`,
      entityType: 'thread',
      entityId: threadId,
      secondaryEntityId: comment._id,
    }).catch(() => {});

    // ✅ @mention notifications (correct)
    if (Array.isArray(mentionedPersonaIds) && mentionedPersonaIds.length) {
      const unique = [...new Set(mentionedPersonaIds.map(String))];
      Promise.allSettled(
        unique.map((pid) =>
          upsertNotification({
            recipientPersonaId: pid,
            actorPersonaId: ctx.activePersonaId,
            type: 'mention',
            groupKey: `mention:thread:${threadId}`,
            entityType: 'thread',
            entityId: threadId,
            secondaryEntityId: comment._id,
          })
        )
      ).catch(() => {});
    }

    const populatedComment = await Comment.findById(comment._id).populate(
      'authorPersona',
      'handle displayName profilePic rollNumber department batch type'
    );

    return res.status(201).json({
      success: true,
      message: 'Comment created successfully',
      comment: formatComment(populatedComment, ctx.activePersonaId, ctx.ownedPersonaIds),
    });
  } catch (error) {
    console.error('Create comment error:', error);
    return res.status(500).json({ success: false, message: 'Server error while creating comment', error: error.message });
  }
};

// POST /api/comments/:commentId/reply
exports.replyToComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ success: false, message: 'Invalid comment ID' });
    }

    const parentComment = await Comment.findOne({ _id: commentId, isDeleted: false }).select('_id threadId depth isDeleted authorPersona');
    if (!parentComment) return res.status(404).json({ success: false, message: 'Comment not found' });

    const thread = await Thread.findOne({ _id: parentComment.threadId, isDeleted: false }).select('_id authorPersona');
    if (!thread) return res.status(404).json({ success: false, message: 'Thread not found' });

    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    if (ctx.activeMode === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) return res.status(409).json({ success: false, setupRequired: true, message: 'Anonymous persona setup required' });
    }

    // ✅ block enforcement: cannot reply if blocked either way with parent author or thread author
    const blockedSet = await getBlockedPersonaIdSetForViewer(ctx.activePersonaId);
    if (blockedSet.has(parentComment.authorPersona.toString()) || blockedSet.has(thread.authorPersona.toString())) {
      return res.status(403).json({ success: false, message: 'Cannot interact with this content' });
    }

    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) return res.status(400).json({ success: false, message: 'Reply content is required' });

    const { personaIds: mentionedPersonaIds } = await resolveMentionsFromText(text);

    const reply = await Comment.create({
      content: text,
      authorPersona: ctx.activePersonaId,
      threadId: parentComment.threadId,
      parentCommentId: commentId,
      depth: (parentComment.depth || 0) + 1,
      mentions: mentionedPersonaIds,
    });

    await Comment.updateOne({ _id: commentId }, { $inc: { replyCount: 1 } });
    await Thread.findByIdAndUpdate(parentComment.threadId, { $inc: { commentCount: 1 } });

    const parentAuthorId = parentComment.authorPersona?.toString();
    const threadAuthorId = thread.authorPersona?.toString();

    // ✅ notify parent comment author (reply)
    upsertNotification({
      recipientPersonaId: parentComment.authorPersona,
      actorPersonaId: ctx.activePersonaId,
      type: 'reply',
      groupKey: `reply:comment:${commentId}`,
      entityType: 'comment',
      entityId: commentId,
      secondaryEntityId: reply._id,
    }).catch(() => {});

    // ✅ notify thread author as "comment" only if different from parent author
    if (threadAuthorId && parentAuthorId && threadAuthorId !== parentAuthorId) {
      upsertNotification({
        recipientPersonaId: thread.authorPersona,
        actorPersonaId: ctx.activePersonaId,
        type: 'comment',
        groupKey: `comment:thread:${parentComment.threadId}`,
        entityType: 'thread',
        entityId: parentComment.threadId,
        secondaryEntityId: reply._id,
      }).catch(() => {});
    }

    const populatedReply = await Comment.findById(reply._id).populate(
      'authorPersona',
      'handle displayName profilePic rollNumber department batch type'
    );

    return res.status(201).json({
      success: true,
      message: 'Reply created successfully',
      reply: formatComment(populatedReply, ctx.activePersonaId, ctx.ownedPersonaIds),
    });
  } catch (error) {
    console.error('Reply to comment error:', error);
    return res.status(500).json({ success: false, message: 'Server error while creating reply', error: error.message });
  }
};

// GET /api/threads/:threadId/comments
exports.getThreadComments = async (req, res) => {
  try {
    const { threadId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(threadId)) {
      return res.status(400).json({ success: false, message: 'Invalid thread ID' });
    }

    const thread = await Thread.findOne({ _id: threadId, isDeleted: false }).select('_id authorPersona');
    if (!thread) return res.status(404).json({ success: false, message: 'Thread not found' });

    let viewerPersonaId = null;
    let ownedPersonaIds = [];
    let blockedSet = new Set();

    if (req.user) {
      const ctx = await getViewerContext(req.user.id);
      viewerPersonaId = ctx?.activePersonaId || null;
      ownedPersonaIds = ctx?.ownedPersonaIds || [];
      blockedSet = await getBlockedPersonaIdSetForViewer(viewerPersonaId);

      // ✅ deny viewing comments if the thread author is blocked (keeps consistent with getThreadById)
      if (viewerPersonaId && blockedSet.has(thread.authorPersona.toString())) {
        return res.status(403).json({ success: false, message: 'Cannot view this content' });
      }
    }

    const total = await Comment.countDocuments({ threadId, parentCommentId: null, isDeleted: false });

    const comments = await Comment.find({ threadId, parentCommentId: null, isDeleted: false })
      .populate('authorPersona', 'handle displayName profilePic rollNumber department batch type')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // ✅ hide blocked commenters for authenticated viewers
    const visibleComments = viewerPersonaId
      ? comments.filter((c) => !blockedSet.has(c.authorPersona?._id?.toString()))
      : comments;

    const formattedComments = await Promise.all(
      visibleComments.map(async (comment) => {
        let previewReplies = [];

        if (comment.replyCount > 0) {
          previewReplies = await Comment.find({ parentCommentId: comment._id, isDeleted: false })
            .populate('authorPersona', 'handle displayName profilePic rollNumber department batch type')
            .sort({ likes: -1 })
            .limit(2)
            .lean();

          if (viewerPersonaId) {
            previewReplies = previewReplies.filter((r) => !blockedSet.has(r.authorPersona?._id?.toString()));
          }
        }

        return formatComment(comment, viewerPersonaId, ownedPersonaIds, comment.replyCount > 0, previewReplies);
      })
    );

    return res.status(200).json({
      success: true,
      count: formattedComments.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      comments: formattedComments,
    });
  } catch (error) {
    console.error('Get thread comments error:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching comments', error: error.message });
  }
};

// GET /api/comments/:commentId/replies
exports.getCommentReplies = async (req, res) => {
  try {
    const { commentId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ success: false, message: 'Invalid comment ID' });
    }

    const parentComment = await Comment.findById(commentId).select('_id threadId isDeleted');
    if (!parentComment) return res.status(404).json({ success: false, message: 'Comment not found' });

    const thread = await Thread.findOne({ _id: parentComment.threadId, isDeleted: false }).select('_id authorPersona');
    if (!thread) return res.status(404).json({ success: false, message: 'Thread not found' });

    let viewerPersonaId = null;
    let ownedPersonaIds = [];
    let blockedSet = new Set();

    if (req.user) {
      const ctx = await getViewerContext(req.user.id);
      viewerPersonaId = ctx?.activePersonaId || null;
      ownedPersonaIds = ctx?.ownedPersonaIds || [];
      blockedSet = await getBlockedPersonaIdSetForViewer(viewerPersonaId);

      if (viewerPersonaId && blockedSet.has(thread.authorPersona.toString())) {
        return res.status(403).json({ success: false, message: 'Cannot view this content' });
      }
    }

    const total = await Comment.countDocuments({ parentCommentId: commentId, isDeleted: false });

    let replies = await Comment.find({ parentCommentId: commentId, isDeleted: false })
      .populate('authorPersona', 'handle displayName profilePic rollNumber department batch type')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    if (viewerPersonaId) {
      replies = replies.filter((r) => !blockedSet.has(r.authorPersona?._id?.toString()));
    }

    const formattedReplies = await Promise.all(
      replies.map(async (reply) => {
        let previewReplies = [];

        if (reply.replyCount > 0) {
          previewReplies = await Comment.find({ parentCommentId: reply._id, isDeleted: false })
            .populate('authorPersona', 'handle displayName profilePic rollNumber department batch type')
            .sort({ likes: -1 })
            .limit(2)
            .lean();

          if (viewerPersonaId) {
            previewReplies = previewReplies.filter((r) => !blockedSet.has(r.authorPersona?._id?.toString()));
          }
        }

        return formatComment(reply, viewerPersonaId, ownedPersonaIds, reply.replyCount > 0, previewReplies);
      })
    );

    return res.status(200).json({
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
    return res.status(500).json({ success: false, message: 'Server error while fetching replies', error: error.message });
  }
};

// GET /api/comments/:commentId
exports.getCommentById = async (req, res) => {
  try {
    const { commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ success: false, message: 'Invalid comment ID' });
    }

    const comment = await Comment.findById(commentId)
      .populate('authorPersona', 'handle displayName profilePic rollNumber department batch type')
      .populate('threadId', 'content')
      .lean();

    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

    let viewerPersonaId = null;
    let ownedPersonaIds = [];
    if (req.user) {
      const ctx = await getViewerContext(req.user.id);
      viewerPersonaId = ctx?.activePersonaId || null;
      ownedPersonaIds = ctx?.ownedPersonaIds || [];
    }

    return res.status(200).json({ success: true, comment: formatComment(comment, viewerPersonaId, ownedPersonaIds) });
  } catch (error) {
    console.error('Get comment by ID error:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching comment', error: error.message });
  }
};

// DELETE /api/comments/:commentId
exports.deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ success: false, message: 'Invalid comment ID' });
    }

    const comment = await Comment.findOne({ _id: commentId, isDeleted: false });
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    if (!ctx.ownedPersonaIds.includes(comment.authorPersona.toString())) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this comment' });
    }

    comment.isDeleted = true;
    comment.content = '[deleted]';
    await comment.save();

    return res.status(200).json({ success: true, message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Delete comment error:', error);
    return res.status(500).json({ success: false, message: 'Server error while deleting comment', error: error.message });
  }
};

// PUT /api/comments/:commentId/like
exports.toggleCommentLike = async (req, res) => {
  try {
    const { commentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return res.status(400).json({ success: false, message: 'Invalid comment ID' });
    }

    const comment = await Comment.findOne({ _id: commentId, isDeleted: false }).select('_id authorPersona likes');
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

    const ctx = await getViewerContext(req.user.id);
    if (!ctx) return res.status(404).json({ success: false, message: 'User not found' });

    if (ctx.activeMode === 'anon') {
      const ok = await assertAnonConfigured(ctx.user);
      if (!ok) return res.status(409).json({ success: false, setupRequired: true, message: 'Anonymous persona setup required' });
    }

    // ✅ block enforcement: cannot like blocked/blockedBy commenter
    const blockedSet = await getBlockedPersonaIdSetForViewer(ctx.activePersonaId);
    if (blockedSet.has(comment.authorPersona.toString())) {
      return res.status(403).json({ success: false, message: 'Cannot interact with this content' });
    }

    const personaId = ctx.activePersonaId.toString();
    const likeIndex = (comment.likes || []).findIndex((id) => id.toString() === personaId);

    let action;
    if (likeIndex > -1) {
      comment.likes.splice(likeIndex, 1);
      action = 'unliked';
    } else {
      comment.likes.push(ctx.activePersonaId);
      action = 'liked';
    }

    await comment.save();

    return res.status(200).json({
      success: true,
      message: `Comment ${action} successfully`,
      likesCount: comment.likes.length,
      isLiked: action === 'liked',
    });
  } catch (error) {
    console.error('Toggle comment like error:', error);
    return res.status(500).json({ success: false, message: 'Server error while toggling like', error: error.message });
  }
};