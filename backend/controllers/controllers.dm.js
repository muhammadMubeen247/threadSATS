const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Persona = require('../models/Persona');

const { getViewerContext } = require('../utils/personaContext');
// ✅ change: also import isPersonaOnline
const { getIO, isPersonaOnline } = require('../socket');

const roomName = (conversationId) => `dm:${conversationId}`;

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
        select: 'text createdAt senderPersonaId',
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

    const query = { conversationId: id };
    if (req.query.before && mongoose.Types.ObjectId.isValid(req.query.before)) {
      query._id = { $lt: req.query.before };
    }

    const msgs = await Message.find(query)
      .sort({ _id: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      messages: msgs.reverse(),
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
    if (!text) return res.status(400).json({ success: false, message: 'text is required' });
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

    // ✅ NEW: mark delivered immediately if recipient is online (socket connected)
    const deliveredTo = [ctx.activePersonaId];
    if (isPersonaOnline(otherId)) deliveredTo.push(otherId);

    const msg = await Message.create({
      conversationId: id,
      senderPersonaId: ctx.activePersonaId,
      text,
      deliveredTo,
      seenBy: [ctx.activePersonaId],
    });

    await Conversation.findByIdAndUpdate(id, { lastMessage: msg._id }, { new: false });

    // ✅ emit realtime event (include receipts)
    try {
      getIO()?.to(roomName(id)).emit('dm:new_message', {
        conversationId: id,
        message: {
          id: msg._id,
          conversationId: msg.conversationId,
          senderPersonaId: msg.senderPersonaId,
          text: msg.text,
          deliveredTo: msg.deliveredTo || [],
          seenBy: msg.seenBy || [],
          createdAt: msg.createdAt,
        },
      });
    } catch {
      // ignore socket failures
    }

    return res.status(201).json({ success: true, message: msg });
  } catch (e) {
    console.error('sendMessage error:', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ✅ GET /dm/search/contacts?q=...
// Searches ONLY among personas you already have a conversation with.
exports.searchContacts = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(200).json({ success: true, results: [] });

    const ctx = await getViewerContext(req.user.id);
    if (!ctx?.activePersonaId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const rx = new RegExp(escapeRegex(q), 'i');

    const conversations = await Conversation.find({ participants: ctx.activePersonaId })
      .populate('participants', 'handle displayName profilePic type')
      .sort({ updatedAt: -1 })
      .lean();

    const me = ctx.activePersonaId.toString();
    const seen = new Set();
    const results = [];

    for (const c of conversations) {
      const other = (c.participants || []).find((p) => p?._id?.toString() !== me);
      if (!other) continue;

      const otherId = other._id.toString();
      if (seen.has(otherId)) continue;

      const handle = other.handle || '';
      const displayName = other.displayName || '';

      if (rx.test(handle) || rx.test(displayName)) {
        seen.add(otherId);
        results.push({
          conversationId: c._id,
          persona: {
            id: other._id,
            handle: other.handle,
            displayName: other.displayName || other.handle,
            profilePic: other.profilePic || '',
            type: other.type,
          },
          updatedAt: c.updatedAt,
        });
        if (results.length >= limit) break;
      }
    }

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