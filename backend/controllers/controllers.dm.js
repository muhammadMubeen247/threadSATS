const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Persona = require('../models/Persona');
const Thread = require('../models/Thread');

const { getViewerContext } = require('../utils/personaContext');
// ✅ change: also import isPersonaOnline
const { getIO, isPersonaOnline } = require('../socket');

const { upsertNotification } = require('../utils/notifications'); // ✅ add
const Notification = require('../models/Notification');

const roomName = (conversationId) => `dm:${conversationId}`;
const personaRoom = (personaId) => `persona:${personaId}`;

const ensureSameType = (a, b) => a && b && a.type === b.type;

const isBlockedEitherWay = async (aId, bId) => {
  // assumes Persona has `blocked: [PersonaId]`
  const [a, b] = await Promise.all([
    Persona.findById(aId).select('blocked').lean(),
    Persona.findById(bId).select('blocked').lean(),
  ]);

  const aBlocks = (a?.blocked || []).some((x) => x.toString() === bId.toString());
  const bBlocks = (b?.blocked || []).some((x) => x.toString() === aId.toString());
  return aBlocks || bBlocks;
};

exports.listConversations = async (req, res) => {
  try {
    const ctx = await getViewerContext(req.user.id);
    if (!ctx?.activePersonaId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const conversations = await Conversation.find({ participants: ctx.activePersonaId })
      .populate('participants', 'handle displayName profilePic type')
      .populate({
        path: 'lastMessage',
        select: 'text createdAt senderPersonaId sharedThread seenBy',
        populate: {
          path: 'sharedThread',
          select: 'authorPersona isDeleted',
          populate: { path: 'authorPersona', select: 'handle displayName type' },
        },
      })
      .sort({ updatedAt: -1 })
      .lean();

    const results = conversations.map((c) => {
      const me = ctx.activePersonaId.toString();
      const other = (c.participants || []).find((p) => p._id.toString() !== me);

      return {
        id: c._id,
        updatedAt: c.updatedAt,
        other: other
          ? {
              id: other._id,
              handle: other.handle,
              displayName: other.displayName || other.handle,
              profilePic: other.profilePic || '',
              type: other.type,
            }
          : null,
        lastMessage: c.lastMessage
          ? {
              id: c.lastMessage._id,
              text: c.lastMessage.text,
              createdAt: c.lastMessage.createdAt,
              senderPersonaId: c.lastMessage.senderPersonaId,
              sharedThreadAuthor: c.lastMessage.sharedThread && !c.lastMessage.sharedThread.isDeleted
                ? (c.lastMessage.sharedThread.authorPersona?.handle || null)
                : null,
              // unread = last message was sent by someone else and I haven't seen it
              isUnread: c.lastMessage.senderPersonaId?.toString() !== me &&
                !(c.lastMessage.seenBy || []).some((id) => id.toString() === me),
            }
          : null,
      };
    });

    return res.status(200).json({ success: true, conversations: results });
  } catch (e) {
    console.error('listConversations error:', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.createOrGetConversation = async (req, res) => {
  try {
    const { targetHandle } = req.body;
    if (!targetHandle) return res.status(400).json({ success: false, message: 'targetHandle is required' });

    const ctx = await getViewerContext(req.user.id);
    if (!ctx?.activePersonaId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const mePersona = await Persona.findById(ctx.activePersonaId).select('_id type').lean();
    if (!mePersona) return res.status(404).json({ success: false, message: 'Persona not found' });

    const clean = targetHandle.trim().replace(/^@+/, '');
    const otherPersona = await Persona.findOne({ handle: clean }).select('_id type handle displayName profilePic').lean();
    if (!otherPersona) return res.status(404).json({ success: false, message: 'Persona not found' });

    if (mePersona._id.toString() === otherPersona._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot DM yourself' });
    }

    // ✅ public↔public or anon↔anon only
    if (!ensureSameType(mePersona, otherPersona)) {
      return res.status(400).json({ success: false, message: 'Personas can only DM personas of the same type' });
    }

    // ✅ block rules
    if (await isBlockedEitherWay(mePersona._id, otherPersona._id)) {
      return res.status(403).json({ success: false, message: 'Cannot message this persona' });
    }

    const [a, b] = [mePersona._id.toString(), otherPersona._id.toString()].sort();
    const pairKey = `${a}_${b}`;

    let convo = await Conversation.findOne({ pairKey });
    if (!convo) {
      convo = await Conversation.create({ participants: [a, b], pairKey });
    }

    return res.status(200).json({
      success: true,
      conversation: {
        id: convo._id,
        other: {
          id: otherPersona._id,
          handle: otherPersona.handle,
          displayName: otherPersona.displayName || otherPersona.handle,
          profilePic: otherPersona.profilePic || '',
          type: otherPersona.type,
        },
      },
    });
  } catch (e) {
    console.error('createOrGetConversation error:', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid conversation id' });

    const ctx = await getViewerContext(req.user.id);
    if (!ctx?.activePersonaId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const convo = await Conversation.findById(id).select('participants').lean();
    if (!convo) return res.status(404).json({ success: false, message: 'Conversation not found' });

    const isParticipant = (convo.participants || []).some((p) => p.toString() === ctx.activePersonaId.toString());
    if (!isParticipant) return res.status(403).json({ success: false, message: 'Forbidden' });

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 100);

    const query = { conversationId: id, deletedForEveryone: { $ne: true }, deletedFor: { $ne: ctx.activePersonaId } };
    if (req.query.before && mongoose.Types.ObjectId.isValid(req.query.before)) {
      query._id = { $lt: req.query.before };
    }

    const msgs = await Message.find(query)
      .sort({ _id: -1 })
      .limit(limit)
      .populate({
        path: 'sharedThread',
        select: 'content images isDeleted type authorPersona',
        populate: {
          path: 'authorPersona',
          select: 'handle displayName profilePic type',
        },
      })
      .lean();

    // Format sharedThread for the client
    const formatSharedThread = (t) => {
      if (!t) return null;
      if (t.isDeleted) return { id: t._id, isDeleted: true };
      return {
        id: t._id,
        content: t.content || '',
        images: t.images || [],
        type: t.type,
        isDeleted: false,
        author: t.authorPersona
          ? {
              handle: t.authorPersona.handle,
              displayName: t.authorPersona.displayName || t.authorPersona.handle,
              profilePic: t.authorPersona.profilePic || '',
              type: t.authorPersona.type,
            }
          : null,
      };
    };

    return res.status(200).json({
      success: true,
      messages: msgs.reverse().map((m) => ({ ...m, sharedThread: formatSharedThread(m.sharedThread) })),
      nextBefore: msgs.length ? msgs[msgs.length - 1]._id : null,
    });
  } catch (e) {
    console.error('getMessages error:', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    const { sharedThreadId } = req.body;

    // Must have text or a shared thread
    if (!text && !sharedThreadId) return res.status(400).json({ success: false, message: 'text or sharedThreadId is required' });
    if (sharedThreadId && !mongoose.Types.ObjectId.isValid(sharedThreadId)) {
      return res.status(400).json({ success: false, message: 'Invalid sharedThreadId' });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid conversation id' });

    const ctx = await getViewerContext(req.user.id);
    if (!ctx?.activePersonaId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const convo = await Conversation.findById(id).select('participants').lean();
    if (!convo) return res.status(404).json({ success: false, message: 'Conversation not found' });

    const [p1, p2] = convo.participants || [];
    const me = ctx.activePersonaId.toString();

    const isParticipant = [p1?.toString(), p2?.toString()].includes(me);
    if (!isParticipant) return res.status(403).json({ success: false, message: 'Forbidden' });

    const otherId = p1.toString() === me ? p2 : p1;

    // ✅ enforce same-type + blocking every send as well
    const [mePersona, otherPersona] = await Promise.all([
      Persona.findById(me).select('_id type').lean(),
      Persona.findById(otherId).select('_id type').lean(),
    ]);

    if (!ensureSameType(mePersona, otherPersona)) {
      return res.status(400).json({ success: false, message: 'Personas can only DM personas of the same type' });
    }
    if (await isBlockedEitherWay(mePersona._id, otherPersona._id)) {
      return res.status(403).json({ success: false, message: 'Cannot message this persona' });
    }

    // Validate shared thread exists
    let resolvedSharedThreadId = null;
    if (sharedThreadId) {
      const threadExists = await Thread.findOne({ _id: sharedThreadId, isDeleted: false }).select('_id').lean();
      if (!threadExists) return res.status(404).json({ success: false, message: 'Thread not found' });
      resolvedSharedThreadId = sharedThreadId;
    }

    // ✅ NEW: mark delivered immediately if recipient is online (socket connected)
    const deliveredTo = [ctx.activePersonaId];
    if (isPersonaOnline(otherId)) deliveredTo.push(otherId);

    const msg = await Message.create({
      conversationId: id,
      senderPersonaId: ctx.activePersonaId,
      text,
      sharedThread: resolvedSharedThreadId,
      deliveredTo,
      seenBy: [ctx.activePersonaId],
    });

    await Conversation.findByIdAndUpdate(id, { lastMessage: msg._id }, { new: false });

    // ✅ notification (aggregate) for receiver
    upsertNotification({
      recipientPersonaId: otherId,
      actorPersonaId: ctx.activePersonaId,
      type: 'dm',
      groupKey: `dm:conversation:${id}`,
      entityType: 'conversation',
      entityId: id,
      secondaryEntityId: msg._id,
    }).catch((e) => console.error('notif upsert failed (dm):', e));

    // Populate sharedThread for real-time socket payload
    let sharedThreadData = null;
    if (resolvedSharedThreadId) {
      const t = await Thread.findById(resolvedSharedThreadId)
        .select('content images isDeleted type authorPersona')
        .populate('authorPersona', 'handle displayName profilePic type')
        .lean();
      if (t) {
        sharedThreadData = t.isDeleted
          ? { id: t._id, isDeleted: true }
          : {
              id: t._id,
              content: t.content || '',
              images: t.images || [],
              type: t.type,
              isDeleted: false,
              author: t.authorPersona
                ? {
                    handle: t.authorPersona.handle,
                    displayName: t.authorPersona.displayName || t.authorPersona.handle,
                    profilePic: t.authorPersona.profilePic || '',
                    type: t.authorPersona.type,
                  }
                : null,
            };
      }
    }

    // ✅ emit realtime event (include receipts + sharedThread)
    const payload = {
      conversationId: id,
      message: {
        id: msg._id,
        conversationId: msg.conversationId,
        senderPersonaId: msg.senderPersonaId,
        text: msg.text,
        sharedThread: sharedThreadData,
        deliveredTo: msg.deliveredTo || [],
        seenBy: msg.seenBy || [],
        createdAt: msg.createdAt,
      },
    };

    try {
      const io = getIO();
      // room for open chat
      io?.to(roomName(id)).emit('dm:new_message', payload);
      // ✅ always deliver to the receiver (even if they didn't open the chat)
      io?.to(personaRoom(otherId)).emit('dm:new_message', payload);
    } catch {
      // ignore
    }

    return res.status(201).json({ success: true, message: { ...msg.toObject(), sharedThread: sharedThreadData } });
  } catch (e) {
    console.error('sendMessage error:', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ✅ GET /dm/search/contacts?q=...
// Searches ALL same-type personas, prioritised: existing contacts > following/followers > others.
exports.searchContacts = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(200).json({ success: true, results: [] });

    const ctx = await getViewerContext(req.user.id);
    if (!ctx?.activePersonaId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const rx = new RegExp(escapeRegex(q), 'i');

    const mePersona = await Persona.findById(ctx.activePersonaId)
      .select('type following followers blocked')
      .lean();
    if (!mePersona) return res.status(404).json({ success: false, message: 'Persona not found' });

    const me = ctx.activePersonaId.toString();
    const blockedSet = new Set((mePersona.blocked || []).map((id) => id.toString()));
    const followingSet = new Set((mePersona.following || []).map((id) => id.toString()));
    const followersSet = new Set((mePersona.followers || []).map((id) => id.toString()));

    // 1) Existing conversation contacts (highest priority)
    const conversations = await Conversation.find({ participants: ctx.activePersonaId })
      .populate('participants', 'handle displayName profilePic type')
      .sort({ updatedAt: -1 })
      .lean();

    const convoMap = new Map(); // personaId -> conversationId
    for (const c of conversations) {
      const other = (c.participants || []).find((p) => p?._id?.toString() !== me);
      if (other) convoMap.set(other._id.toString(), c._id);
    }

    // 2) Search all personas (both types) matching query by handle, displayName, or rollNumber
    const allMatches = await Persona.find({
      _id: { $ne: ctx.activePersonaId },
      isConfigured: { $ne: false },
      $or: [
        { handle: { $regex: rx } },
        { displayName: { $regex: rx } },
        { rollNumber: { $regex: rx } },
      ],
    })
      .select('_id handle displayName profilePic type rollNumber')
      .limit(200) // fetch generously, then sort + trim
      .lean();

    // 3) Score and sort: existing contact=3, following/follower=2/1, other=0
    const scored = [];
    for (const p of allMatches) {
      const pid = p._id.toString();
      if (pid === me) continue;
      if (blockedSet.has(pid)) continue;

      // check reverse block (other blocked me)
      // skip heavy per-user query; we already filter blocked from our side

      let priority = 0;
      if (convoMap.has(pid)) priority += 3;
      if (followingSet.has(pid)) priority += 2;
      if (followersSet.has(pid)) priority += 1;

      scored.push({
        persona: p,
        conversationId: convoMap.get(pid) || null,
        priority,
      });
    }

    scored.sort((a, b) => b.priority - a.priority);

    const results = scored.slice(0, limit).map((s) => ({
      conversationId: s.conversationId,
      persona: {
        id: s.persona._id,
        handle: s.persona.handle,
        displayName: s.persona.displayName || s.persona.handle,
        profilePic: s.persona.profilePic || '',
        type: s.persona.type,
      },
      updatedAt: null,
      isExistingContact: !!s.conversationId,
    }));

    return res.status(200).json({ success: true, results });
  } catch (e) {
    console.error('searchContacts error:', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ✅ GET /dm/search/messages?q=...&conversationId?=...&limit=...&before=...
// If conversationId is provided -> searches within that chat
// else -> searches across all chats the active persona participates in.
exports.searchMessages = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(200).json({ success: true, results: [], nextBefore: null });

    const ctx = await getViewerContext(req.user.id);
    if (!ctx?.activePersonaId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 100);

    const { conversationId } = req.query;
    let conversationIds = [];

    if (conversationId) {
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({ success: false, message: 'Invalid conversationId' });
      }

      const convo = await Conversation.findById(conversationId).select('participants').lean();
      if (!convo) return res.status(404).json({ success: false, message: 'Conversation not found' });

      const isParticipant = (convo.participants || []).some(
        (p) => p.toString() === ctx.activePersonaId.toString()
      );
      if (!isParticipant) return res.status(403).json({ success: false, message: 'Forbidden' });

      conversationIds = [conversationId];
    } else {
      const convos = await Conversation.find({ participants: ctx.activePersonaId }).select('_id').lean();
      conversationIds = convos.map((c) => c._id);
    }

    if (!conversationIds.length) {
      return res.status(200).json({ success: true, results: [], nextBefore: null });
    }

    const query = {
      conversationId: { $in: conversationIds },
      $text: { $search: q },
    };

    if (req.query.before && mongoose.Types.ObjectId.isValid(req.query.before)) {
      query._id = { $lt: req.query.before };
    }

    const msgs = await Message.find(
      query,
      {
        _id: 1,
        conversationId: 1,
        senderPersonaId: 1,
        text: 1,
        createdAt: 1,
        score: { $meta: 'textScore' },
      }
    )
      .sort({ score: { $meta: 'textScore' }, _id: -1 })
      .limit(limit)
      .lean();

    // Optional: include "other" for each conversation in results (minimal extra query)
    const convoMap = new Map();
    if (!conversationId) {
      const convos = await Conversation.find({ _id: { $in: [...new Set(msgs.map((m) => m.conversationId))] } })
        .populate('participants', 'handle displayName profilePic type')
        .lean();

      const me = ctx.activePersonaId.toString();
      for (const c of convos) {
        const other = (c.participants || []).find((p) => p?._id?.toString() !== me) || null;
        convoMap.set(String(c._id), other);
      }
    }

    const results = msgs.map((m) => {
      const other = convoMap.get(String(m.conversationId));
      return {
        id: m._id,
        conversationId: m.conversationId,
        senderPersonaId: m.senderPersonaId,
        text: m.text,
        createdAt: m.createdAt,
        other: other
          ? {
              id: other._id,
              handle: other.handle,
              displayName: other.displayName || other.handle,
              profilePic: other.profilePic || '',
              type: other.type,
            }
          : undefined,
      };
    });

    return res.status(200).json({
      success: true,
      results: results.reverse(),
      nextBefore: msgs.length ? msgs[msgs.length - 1]._id : null,
    });
  } catch (e) {
    console.error('searchMessages error:', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// DELETE MESSAGE
// If recipient hasn't seen it -> delete for everyone + remove DM notification
// If recipient has seen it -> delete only for sender
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ success: false, message: 'Invalid message ID' });
    }

    const ctx = await getViewerContext(req.user.id);
    if (!ctx?.activePersonaId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const msg = await Message.findById(messageId);
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });

    // Only the sender can delete
    if (msg.senderPersonaId.toString() !== ctx.activePersonaId.toString()) {
      return res.status(403).json({ success: false, message: 'You can only delete your own messages' });
    }

    const convo = await Conversation.findById(msg.conversationId).select('participants lastMessage').lean();
    if (!convo) return res.status(404).json({ success: false, message: 'Conversation not found' });

    const otherId = (convo.participants || []).find((p) => p.toString() !== ctx.activePersonaId.toString());

    // Check if the other person has seen this message
    const otherHasSeen = (msg.seenBy || []).some((id) => id.toString() === otherId?.toString());

    let deleteType;

    if (otherHasSeen) {
      // Other person has seen it -> only hide from sender
      await Message.updateOne({ _id: messageId }, { $addToSet: { deletedFor: ctx.activePersonaId } });
      deleteType = 'for_me';
    } else {
      // Other person hasn't seen it -> delete for everyone
      await Message.updateOne({ _id: messageId }, { $set: { deletedForEveryone: true } });
      deleteType = 'for_everyone';

      // Remove the DM notification if this message was the trigger
      await Notification.findOneAndDelete({
        recipientPersona: otherId,
        type: 'dm',
        groupKey: `dm:conversation:${msg.conversationId}`,
        secondaryEntityId: messageId,
      }).catch(() => {});
    }

    // If the deleted message was the conversation's lastMessage, update it
    if (convo.lastMessage?.toString() === messageId) {
      const prevMsg = await Message.findOne({
        conversationId: msg.conversationId,
        _id: { $ne: messageId },
        deletedForEveryone: { $ne: true },
      })
        .sort({ _id: -1 })
        .select('_id')
        .lean();

      await Conversation.findByIdAndUpdate(msg.conversationId, {
        lastMessage: prevMsg?._id || null,
      });
    }

    // Emit realtime delete event
    try {
      const io = getIO();
      const payload = {
        conversationId: msg.conversationId.toString(),
        messageId: msg._id.toString(),
        deleteType,
        deletedBy: ctx.activePersonaId.toString(),
      };

      if (deleteType === 'for_everyone') {
        // Notify everyone in the conversation room
        io?.to(roomName(msg.conversationId)).emit('dm:message_deleted', payload);
        // Also notify via persona room in case they're not in the conversation room
        if (otherId) io?.to(`persona:${otherId}`).emit('dm:message_deleted', payload);
      } else {
        // Only notify the sender's own sockets
        io?.to(`persona:${ctx.activePersonaId}`).emit('dm:message_deleted', payload);
      }
    } catch {
      // ignore socket errors
    }

    return res.status(200).json({
      success: true,
      message: 'Message deleted',
      deleteType,
    });
  } catch (e) {
    console.error('deleteMessage error:', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /dm/share/contacts?q=...&limit=...
exports.getShareContacts = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const ctx = await getViewerContext(req.user.id);
    if (!ctx?.activePersonaId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 50);

    const mePersona = await Persona.findById(ctx.activePersonaId)
      .select('type following followers blocked')
      .lean();
    if (!mePersona) return res.status(404).json({ success: false, message: 'Persona not found' });

    const me = ctx.activePersonaId.toString();
    const blockedSet = new Set((mePersona.blocked || []).map((id) => id.toString()));
    const followingSet = new Set((mePersona.following || []).map((id) => id.toString()));
    const followersSet = new Set((mePersona.followers || []).map((id) => id.toString()));

    // Get existing conversation contacts
    const conversations = await Conversation.find({ participants: ctx.activePersonaId })
      .select('participants updatedAt')
      .sort({ updatedAt: -1 })
      .lean();

    const convoMap = new Map();
    for (const c of conversations) {
      const otherId = (c.participants || []).find((p) => p?.toString() !== me);
      if (otherId) convoMap.set(otherId.toString(), c._id);
    }

    // Build persona query — only same type as active persona
    const query = {
      _id: { $ne: ctx.activePersonaId },
      isConfigured: { $ne: false },
      type: mePersona.type,
    };

    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      query.$or = [
        { handle: { $regex: rx } },
        { displayName: { $regex: rx } },
        { rollNumber: { $regex: rx } },
      ];
    } else {
      // No query: only show follows/followers/existing contacts
      const interactedIds = [
        ...new Set([
          ...Array.from(followingSet),
          ...Array.from(followersSet),
          ...Array.from(convoMap.keys()),
        ]),
      ].map((id) => {
        try { return new (require('mongoose').Types.ObjectId)(id); } catch { return null; }
      }).filter(Boolean);

      if (!interactedIds.length) return res.status(200).json({ success: true, contacts: [] });
      query._id = { $ne: ctx.activePersonaId, $in: interactedIds };
    }

    const personas = await Persona.find(query)
      .select('_id handle displayName profilePic type rollNumber')
      .limit(200)
      .lean();

    const scored = [];
    for (const p of personas) {
      const pid = p._id.toString();
      if (pid === me) continue;
      if (blockedSet.has(pid)) continue;

      let priority = 0;
      if (convoMap.has(pid)) priority += 4;
      if (followingSet.has(pid) && followersSet.has(pid)) priority += 3;
      else if (followingSet.has(pid)) priority += 2;
      else if (followersSet.has(pid)) priority += 1;

      scored.push({ persona: p, conversationId: convoMap.get(pid) || null, priority });
    }

    scored.sort((a, b) => b.priority - a.priority);

    const contacts = scored.slice(0, limit).map((s) => ({
      conversationId: s.conversationId,
      persona: {
        id: s.persona._id,
        handle: s.persona.handle,
        displayName: s.persona.displayName || s.persona.handle,
        profilePic: s.persona.profilePic || '',
        type: s.persona.type,
      },
    }));

    return res.status(200).json({ success: true, contacts });
  } catch (e) {
    console.error('getShareContacts error:', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};