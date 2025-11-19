const express = require('express');
const router = express.Router();
const {
  createComment,
  replyToComment,
  getCommentReplies,
  deleteComment,
  toggleCommentLike,
  getCommentById,
} = require('../controllers/controllers.comment');
const { protect } = require('../middleware/middleware.auth');
const { body, param, validationResult } = require('express-validator');

// Optional auth middleware
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
      req.user = null;
    }
  }

  next();
};

// Validation middleware
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

// Validation rules
const commentValidation = [
  body('content')
    .trim()
    .notEmpty()
    .withMessage('Comment content is required')
    .isLength({ min: 1, max: 500 })
    .withMessage('Comment must be between 1 and 500 characters'),
  body('isAnonymous').optional().isBoolean().withMessage('isAnonymous must be a boolean'),
];

const commentIdValidation = [
  param('commentId').isMongoId().withMessage('Invalid comment ID'),
];

// Routes
router.post(
  '/:commentId/reply',
  protect,
  commentIdValidation,
  commentValidation,
  validate,
  replyToComment
);

router.get(
  '/:commentId/replies',
  optionalAuth,
  commentIdValidation,
  validate,
  getCommentReplies
);

router.get(
  '/:commentId',
  optionalAuth,
  commentIdValidation,
  validate,
  getCommentById
);

router.delete(
  '/:commentId',
  protect,
  commentIdValidation,
  validate,
  deleteComment
);

router.put(
  '/:commentId/like',
  protect,
  commentIdValidation,
  validate,
  toggleCommentLike
);

module.exports = router;