const { Server } = require('socket.io');
const socketAuth = require('./auth');

const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { getViewerContext } = require('../utils/personaContext');

let io;

// ✅ Track online personas: personaId -> Set(socketId)
const onlinePersonaSockets = new Map();

function addOnlinePersona(personaId, socketId) {
  const key = String(personaId);
  const set = onlinePersonaSockets.get(key) || new Set();
  set.add(socketId);
  onlinePersonaSockets.set(key, set);
}

function removeOnlinePersona(personaId, socketId) {
  const key = String(personaId);
  const set = onlinePersonaSockets.get(key);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) onlinePersonaSockets.delete(key);
}

function isPersonaOnline(personaId) {
  const set = onlinePersonaSockets.get(String(personaId));
  return Boolean(set && set.size > 0);
}

// ✅ MISSING: used by join/leave + emits
const roomName = (conversationId) => `dm:${conversationId}`;

// ✅ MISSING: used by dm:join/delivered/seen
async function assertParticipant(userId, conversationId) {
  const ctx = await getViewerContext(userId);
  if (!ctx?.activePersonaId) return null;

  const convo = await Conversation.findById(conversationId).select('participants').lean();
  if (!convo) return null;

  const ok = (convo.participants || []).some(
    (p) => String(p) === String(ctx.activePersonaId)
  );

  return ok ? ctx.activePersonaId : null;
}

const personaRoom = (personaId) => `persona:${personaId}`;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
    },
  });

  io.use(socketAuth);

  io.on('connection', (socket) => {
    (async () => {
      try {
        const userId = socket.user?._id || socket.user?.id;
        if (!userId) return;

        const ctx = await getViewerContext(userId);
        const pid = ctx?.activePersonaId;
        if (!pid) return;

        socket.data.activePersonaId = pid;

        // ✅ presence
        addOnlinePersona(pid, socket.id);

        // ✅ personal room (always-on)
        socket.join(personaRoom(pid));
      } catch {
        // ignore
      }
    })();

    socket.on('disconnect', () => {
      const pid = socket.data.activePersonaId;
      if (pid) removeOnlinePersona(pid, socket.id);
    });

    socket.on('dm:join', async ({ conversationId }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(conversationId)) return;
        const personaId = await assertParticipant(socket.user.id, conversationId);
        if (!personaId) return;

        socket.join(roomName(conversationId));
      } catch {
        // ignore
      }
    });

    socket.on('dm:leave', ({ conversationId }) => {
      if (!conversationId) return;
      socket.leave(roomName(conversationId));
    });

    // ✅ client acknowledges message delivered
    socket.on('dm:delivered', async ({ conversationId, messageId }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(conversationId)) return;
        if (!mongoose.Types.ObjectId.isValid(messageId)) return;

        const personaId = await assertParticipant(socket.user.id, conversationId);
        if (!personaId) return;

        const updated = await Message.findOneAndUpdate(
          { _id: messageId, conversationId },
          { $addToSet: { deliveredTo: personaId } },
          { new: true }
        ).select('_id deliveredTo seenBy conversationId');

        if (!updated) return;

        io.to(roomName(conversationId)).emit('dm:message_status', {
          conversationId,
          messageId: updated._id,
          deliveredTo: updated.deliveredTo || [],
          seenBy: updated.seenBy || [],
        });
      } catch {
        // ignore
      }
    });

    // ✅ client marks messages seen up to a point
    socket.on('dm:seen', async ({ conversationId, upToMessageId }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(conversationId)) return;
        if (!mongoose.Types.ObjectId.isValid(upToMessageId)) return;

        const personaId = await assertParticipant(socket.user.id, conversationId);
        if (!personaId) return;

        await Message.updateMany(
          {
            conversationId,
            _id: { $lte: upToMessageId },
            senderPersonaId: { $ne: personaId },
          },
          { $addToSet: { seenBy: personaId, deliveredTo: personaId } }
        );

        io.to(roomName(conversationId)).emit('dm:seen_upto', {
          conversationId,
          personaId,
          upToMessageId,
        });
      } catch {
        // ignore
      }
    });
  });

  return io;
}

function getIO() {
  return io;
}

module.exports = { initSocket, getIO, isPersonaOnline };