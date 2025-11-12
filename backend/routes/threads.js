const express = require('express');
const router = express.Router();
const {
  createThread,
  getAllThreads,
  getUserThreads,
  getThreadById,
  deleteThread,
  toggleLike,
  getFollowingFeed,
} = require('../controllers/controllers.thread');
const { protect } = require('../middleware/middleware.auth');
const {
  createThreadValidation,
  threadIdValidation,
  userIdValidation,
  validate,
} = require('../middleware/threadValidation');

// Optional auth middleware (allows both authenticated and guest access)
const optionalAuth = async (req, res, next) => {
  let token;

  if (req.cookies.token) {
    token = req.cookies.token;
  } else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const User = require('../models/User');
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
    } catch (error) {
      // Invalid token, continue as guest
      req.user = null;
    }
  }

  next();
};

// Public routes (with optional auth for like status)
router.get('/', optionalAuth, getAllThreads);
router.get('/user/:userId', userIdValidation, validate, optionalAuth, getUserThreads);
router.get('/:threadId', threadIdValidation, validate, optionalAuth, getThreadById);

// Protected routes
router.post('/', protect, createThreadValidation, validate, createThread);
router.delete('/:threadId', protect, threadIdValidation, validate, deleteThread);
router.put('/:threadId/like', protect, threadIdValidation, validate, toggleLike);
router.get('/feed/following', protect, getFollowingFeed);

module.exports = router;