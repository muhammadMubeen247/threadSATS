const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const {
  createThread,
  getAllThreads,
  getUserThreads,
  getThreadById,
  deleteThread,
  toggleLike,
  getFollowingFeed,
  toggleRepost,
  createQuoteRepost, // ✅ add
} = require('../controllers/controllers.thread');

const {
  createComment,
  getThreadComments,
} = require('../controllers/controllers.comment');

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

//Comment validation
const commentValidation = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Comment content is required')
    .isLength({ min: 1, max: 500 })
    .withMessage('Comment must be between 1 and 500 characters'),
  body('isAnonymous').optional().isBoolean().withMessage('isAnonymous must be a boolean'),
];

const quoteValidation = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Quote content is required')
    .isLength({ min: 1, max: 500 })
    .withMessage('Quote must be between 1 and 500 characters'),
];

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

// Public routes (with optional auth for like status)
router.get('/', optionalAuth, getAllThreads);
router.get('/feed/following', protect, getFollowingFeed); // ✅ move ABOVE "/:threadId"
router.get('/user/:userId', userIdValidation, validate, optionalAuth, getUserThreads);
router.get('/:threadId', threadIdValidation, validate, optionalAuth, getThreadById);

// Protected routes
router.post('/', protect, createThreadValidation, validate, createThread);
router.delete('/:threadId', protect, threadIdValidation, validate, deleteThread);
router.put('/:threadId/like', protect, threadIdValidation, validate, toggleLike);

// ✅ repost (keep only once)
router.put('/:threadId/repost', protect, threadIdValidation, validate, toggleRepost);

// Quote repost
router.post(
  '/:threadId/quote',
  protect,
  threadIdValidation,
  quoteValidation,
  validateRequest,
  createQuoteRepost
);

// Comment routes
router.post(
  '/:threadId/comments',
  protect,
  threadIdValidation,
  commentValidation,
  validateRequest,
  createComment
);
router.get(
  '/:threadId/comments',
  optionalAuth,
  threadIdValidation,
  validate,
  getThreadComments
);

module.exports = router;