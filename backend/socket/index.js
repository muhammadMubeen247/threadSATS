const { Server } = require('socket.io');
const socketAuth = require('./auth');

const Conversation = require('../models/Conversation');
const { getViewerContext } = require('../utils/personaContext');

let io;

const roomName = (conversationId) => `dm:${conversationId}`;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      credentials: true,
    },
  });

  io.use(socketAuth);

  io.on('connection', (socket) => {
    // client should emit: socket.emit('dm:join', { conversationId })
    socket.on('dm:join', async ({ conversationId }) => {
      try {
        if (!conversationId) return;

        const ctx = await getViewerContext(socket.user.id);
        if (!ctx?.activePersonaId) return;

        const convo = await Conversation.findById(conversationId).select('participants').lean();
        if (!convo) return;

        const ok = (convo.participants || []).some(
          (p) => p.toString() === ctx.activePersonaId.toString()
        );
        if (!ok) return;

        socket.join(roomName(conversationId));
      } catch (e) {
        // ignore join errors to avoid leaking info
      }
    });

    socket.on('dm:leave', ({ conversationId }) => {
      if (!conversationId) return;
      socket.leave(roomName(conversationId));
    });
  });

  return io;
}

function getIO() {
  return io;
}

module.exports = { initSocket, getIO };