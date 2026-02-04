const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const Thread = require('../models/Thread');   // ✅ add
const Comment = require('../models/Comment'); // ✅ add
const Message = require('../models/Message'); // ✅ add
const { getViewerContext, assertAnonConfigured } = require('../utils/personaContext');
const { getUnreadCount } = require('../utils/notifications');

async function requireViewerContext(req, res) {
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
}

const formatPersona = (p) => {
  if (!p) return null;
  return {
    id: p._id,
    handle: p.handle,
    displayName: p.displayName || p.handle,
    profilePic: p.profilePic || '',
    type: p.type,
    rollNumber: p.type === 'public' ? p.rollNumber || '' : '',
    department: p.type === 'public' ? p.department || '' : '',
    batch: p.type === 'public' ? p.batch || '' : '',
  };
};

const formatThreadPreview = (t) => {
  if (!t) return null;
  return {
    id: t._id,
    type: t.type || 'thread',
    content: t.content || '',
    images: t.images || [],
    createdAt: t.createdAt,
    author: formatPersona(t.authorPersona),
  };
};

const formatCommentPreview = (c) => {
  if (!c) return null;
  return {
    id: c._id,
    content: c.isDeleted ? '[deleted]' : (c.content || ''),
    isDeleted: !!c.isDeleted,
    createdAt: c.createdAt,
    threadId: c.threadId,
    parentCommentId: c.parentCommentId || null,
    author: c.authorPersona
      ? { id: c.authorPersona._id, handle: c.authorPersona.handle, displayName: c.authorPersona.displayName || c.authorPersona.handle, profilePic: c.authorPersona.profilePic || '', type: c.authorPersona.type }
      : null,
  };
};

// GET /api/notifications?page=1&limit=20
exports.getNotifications = async (req, res) => {
  try {
    const ctx = await requireViewerContext(req, res);
    if (!ctx) return;

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const skip = (page - 1) * limit;

    const query = { recipientPersona: ctx.activePersonaId };
    const total = await Notification.countDocuments(query);

    const docs = await Notification.find(query)
      .populate('lastActorPersona', 'handle displayName profilePic type rollNumber department batch')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const threadIds = new Set();
    const commentIds = new Set();
    const messageIds = new Set();

    for (const n of docs) {
      if (n.entityType === 'thread') threadIds.add(String(n.entityId));
      if (n.entityType === 'comment') commentIds.add(String(n.entityId));

      if (n.type === 'dm' && n.secondaryEntityId) messageIds.add(String(n.secondaryEntityId));

      if (n.type === 'comment' && n.secondaryEntityId) commentIds.add(String(n.secondaryEntityId)); // commentId
      if (n.type === 'reply') {
        commentIds.add(String(n.entityId)); // parentCommentId
        if (n.secondaryEntityId) commentIds.add(String(n.secondaryEntityId)); // replyId
      }
      if (n.type === 'quote' && n.secondaryEntityId) threadIds.add(String(n.secondaryEntityId)); // quoteThreadId
      if (n.type === 'mention' && n.secondaryEntityId) commentIds.add(String(n.secondaryEntityId)); // mention-commentId
    }

    const commentDocs = commentIds.size
      ? await Comment.find({ _id: { $in: [...commentIds] } })
          .populate('authorPersona', 'handle displayName profilePic type')
          .select('_id content isDeleted createdAt authorPersona threadId parentCommentId')
          .lean()
      : [];
    const commentMap = new Map(commentDocs.map((c) => [String(c._id), c]));
    for (const c of commentDocs) if (c?.threadId) threadIds.add(String(c.threadId));

    const threadDocs = threadIds.size
      ? await Thread.find({ _id: { $in: [...threadIds] }, isDeleted: false })
          .populate('authorPersona', 'handle displayName profilePic type rollNumber department batch')
          .select('_id type content images createdAt authorPersona')
          .lean()
      : [];
    const threadMap = new Map(threadDocs.map((t) => [String(t._id), t]));

    const messageDocs = messageIds.size
      ? await Message.find({ _id: { $in: [...messageIds] } }).select('_id text createdAt conversationId').lean()
      : [];
    const messageMap = new Map(messageDocs.map((m) => [String(m._id), m]));

    const results = docs.map((n) => {
      const out = { ...n, context: null };

      if (n.type === 'dm' && n.entityType === 'conversation') {
        const msg = n.secondaryEntityId ? messageMap.get(String(n.secondaryEntityId)) : null;
        out.context = {
          conversationId: n.entityId,
          message: msg ? { id: msg._id, text: msg.text || '', createdAt: msg.createdAt } : null,
        };
        return out;
      }

      if ((n.type === 'like' || n.type === 'repost') && n.entityType === 'thread') {
        out.context = { thread: formatThreadPreview(threadMap.get(String(n.entityId))) };
        return out;
      }

      if (n.type === 'quote' && n.entityType === 'thread') {
        out.context = {
          originalThread: formatThreadPreview(threadMap.get(String(n.entityId))),
          quoteThread: n.secondaryEntityId ? formatThreadPreview(threadMap.get(String(n.secondaryEntityId))) : null,
        };
        return out;
      }

      if (n.type === 'comment' && n.entityType === 'thread') {
        out.context = {
          thread: formatThreadPreview(threadMap.get(String(n.entityId))),
          comment: n.secondaryEntityId ? formatCommentPreview(commentMap.get(String(n.secondaryEntityId))) : null,
        };
        return out;
      }

      if (n.type === 'reply' && n.entityType === 'comment') {
        const parent = commentMap.get(String(n.entityId));
        const threadId = parent?.threadId ? String(parent.threadId) : null;

        out.context = {
          thread: threadId ? formatThreadPreview(threadMap.get(threadId)) : null,
          parentComment: formatCommentPreview(parent),
          reply: n.secondaryEntityId ? formatCommentPreview(commentMap.get(String(n.secondaryEntityId))) : null,
        };
        return out;
      }

      if (n.type === 'mention' && n.entityType === 'thread') {
        out.context = {
          thread: formatThreadPreview(threadMap.get(String(n.entityId))),
          comment: n.secondaryEntityId ? formatCommentPreview(commentMap.get(String(n.secondaryEntityId))) : null,
        };
        return out;
      }

      return out;
    });

    return res.status(200).json({
      success: true,
      activeMode: ctx.activeMode,
      activePersonaId: ctx.activePersonaId,
      page,
      pages: Math.ceil(total / limit),
      hasMore: page < Math.ceil(total / limit),
      count: results.length,
      total,
      results,
    });
  } catch (error) {
    console.error('getNotifications error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// GET /api/notifications/unread-count
exports.getUnread = async (req, res) => {
  try {
    const ctx = await requireViewerContext(req, res);
    if (!ctx) return;

    const unread = await getUnreadCount(ctx.activePersonaId);
    return res.status(200).json({
      success: true,
      activeMode: ctx.activeMode, // ✅ add
      activePersonaId: ctx.activePersonaId, // ✅ add
      unread,
    });
  } catch (error) {
    console.error('getUnread error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// PUT /api/notifications/:id/read
exports.markRead = async (req, res) => {
  try {
    const ctx = await requireViewerContext(req, res);
    if (!ctx) return;

    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid notification id' });
    }

    await Notification.updateOne(
      { _id: id, recipientPersona: ctx.activePersonaId },
      { $set: { isRead: true, readAt: new Date(), count: 0 } } // ✅ reset count
    );

    const unread = await getUnreadCount(ctx.activePersonaId);
    return res.status(200).json({ success: true, unread });
  } catch (error) {
    console.error('markRead error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// PUT /api/notifications/read-all
exports.markReadAll = async (req, res) => {
  try {
    const ctx = await requireViewerContext(req, res);
    if (!ctx) return;

    await Notification.updateMany(
      { recipientPersona: ctx.activePersonaId, isRead: false },
      { $set: { isRead: true, readAt: new Date(), count: 0 } } // ✅ reset count
    );

    return res.status(200).json({ success: true, unread: 0 });
  } catch (error) {
    console.error('markReadAll error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};