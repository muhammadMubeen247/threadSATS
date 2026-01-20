const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator'); // ✅ add param

const {
  createThread,
  getAllThreads,
  getUserThreads,
  getThreadById,
  deleteThread,
  toggleLike,
  getFollowingFeed,
  toggleRepost,
  createQuoteRepost,
  getMyThreads, // ✅ use the exported handler directly
} = require('../controllers/controllers.thread');

const { createComment, getThreadComments } = require('../controllers/controllers.comment');
const { protect } = require('../middleware/middleware.auth');

// Optional auth middleware (allows both authenticated and guest access)
const optionalAuth = async (req, res, next) => {
  let token;

  if (req.cookies.token) {
    token = req.cookies.token;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const User = require('../models/User');

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
    } catch (error) {
      req.user = null;
    }
  }

  next();
};

// ✅ validations that were missing
const userIdValidation = [param('userId').isMongoId().withMessage('Invalid user ID')];
const threadIdValidation = [param('threadId').isMongoId().withMessage('Invalid thread ID')];

const createThreadValidation = [
  body('content')
    .optional()
    .isString()
    .withMessage('content must be a string')
    .bail()
    .trim()
    .isLength({ max: 500 })
    .withMessage('content cannot exceed 500 characters'),
  body('images')
    .optional()
    .isArray()
    .withMessage('images must be an array'),
];

const validate = (req, res, next) => {
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

// Comment validation
const commentValidation = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Comment content is required')
    .isLength({ min: 1, max: 500 })
    .withMessage('Comment must be between 1 and 500 characters'),
];

// Quote validation
const quoteValidation = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Quote content is required')
    .isLength({ min: 1, max: 500 })
    .withMessage('Quote must be between 1 and 500 characters'),
];

// ✅ Public routes (with optional auth)
router.get('/', optionalAuth, getAllThreads);
router.get('/feed/following', protect, getFollowingFeed);

// ✅ IMPORTANT: keep /me BEFORE /:threadId
router.get('/me', protect, getMyThreads);

router.get('/user/:userId', userIdValidation, validate, optionalAuth, getUserThreads);
router.get('/:threadId', threadIdValidation, validate, optionalAuth, getThreadById);

// ✅ Protected routes
router.post('/', protect, createThreadValidation, validate, createThread);
router.delete('/:threadId', protect, threadIdValidation, validate, deleteThread);
router.put('/:threadId/like', protect, threadIdValidation, validate, toggleLike);
router.put('/:threadId/repost', protect, threadIdValidation, validate, toggleRepost);

router.post('/:threadId/quote', protect, threadIdValidation, validate, quoteValidation, validate, createQuoteRepost);

// Comment routes
router.post('/:threadId/comments', protect, threadIdValidation, validate, commentValidation, validate, createComment);
router.get('/:threadId/comments', optionalAuth, threadIdValidation, validate, getThreadComments);

module.exports = router;