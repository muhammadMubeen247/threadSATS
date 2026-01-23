const { Server } = require('socket.io');
const socketAuth = require('./auth');

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      credentials: true,
    },
  });

  // Auth middleware
  io.use(socketAuth);

  io.on('connection', (socket) => {
    console.log('🔌 Socket connected:', socket.user._id.toString());

    socket.on('disconnect', () => {
      console.log('❌ Socket disconnected:', socket.user._id.toString());
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

module.exports = { initSocket, getIO };
