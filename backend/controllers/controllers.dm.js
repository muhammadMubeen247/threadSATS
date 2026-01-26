const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Persona = require('../models/Persona');

const { getViewerContext } = require('../utils/personaContext');
const { getIO } = require('../socket'); // ✅ add

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

    const msg = await Message.create({
      conversationId: id,
      senderPersonaId: ctx.activePersonaId,
      text,
      seenBy: [ctx.activePersonaId],
    });

    await Conversation.findByIdAndUpdate(id, { lastMessage: msg._id }, { new: false });

    // ✅ emit realtime event
    try {
      getIO()?.to(roomName(id)).emit('dm:new_message', {
        conversationId: id,
        message: {
          id: msg._id,
          conversationId: msg.conversationId,
          senderPersonaId: msg.senderPersonaId,
          text: msg.text,
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