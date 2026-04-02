const jwt = require('jsonwebtoken');
const User = require('../models/User');

const socketAuth = async (socket, next) => {
    // console.log('Socket Auth Middleware Invoked');
  try {
    let token;

    // From auth payload
    if (socket.handshake.auth?.token) {
      token = socket.handshake.auth.token;
    }

    // From cookies (if you use cookie auth)
    if (!token && socket.handshake.headers?.cookie) {
      const cookies = socket.handshake.headers.cookie
        .split(';')
        .map((c) => c.trim());

      const tokenCookie = cookies.find((c) =>
        c.startsWith('token=')
      );

      if (tokenCookie) {
        token = tokenCookie.split('=')[1];
      }
    }

    if (!token) {
      return next(new Error('Unauthorized'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return next(new Error('User not found'));
    }

    // Attach user to socket
    socket.user = user;

    next();
  } catch (err) {
    next(new Error('Unauthorized'));
  }
};

module.exports = socketAuth;
