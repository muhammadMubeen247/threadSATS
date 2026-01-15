const express = require('express');
const router = express.Router();
const {
  getUserActivity,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  searchUsers,
  blockUser,
  unblockUser,
  getBlockedUsers,
  getUserProfile,
  updateProfilePic,
  updateCoverPhoto,
} = require('../controllers/controllers.user');
const { protect } = require('../middleware/middleware.auth');
const { checkBlock } = require('../middleware/checkBlock');
const { uploadSingle, handleUploadError } = require('../middleware/upload');
const { param, query, validationResult } = require('express-validator');

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

// Validation
const userIdValidation = [param('userId').isMongoId().withMessage('Invalid user ID')];

const searchValidation = [
  query('q')
    .trim()
    .notEmpty()
    .withMessage('Search query is required')
    .isLength({ min: 1, max: 50 })
    .withMessage('Search query must be between 1 and 50 characters'),
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

// ✅ Put static routes first
router.get('/blocked', protect, getBlockedUsers);
router.get('/search', optionalAuth, searchValidation, validate, searchUsers);

// ✅ NEW: profile pic upload (must be before /:userId routes)
router.put('/me/profile-pic', protect, uploadSingle, handleUploadError, updateProfilePic);
router.put('/me/cover-photo', protect, uploadSingle, handleUploadError, updateCoverPhoto);

// ✅ Then put param routes
router.get('/:userId/activity', protect, userIdValidation, validate, getUserActivity);
router.get('/:userId/followers', protect, userIdValidation, validate, getFollowers);
router.get('/:userId/following', protect, userIdValidation, validate, getFollowing);

router.get('/:username/profile', optionalAuth, getUserProfile);

router.post('/:userId/follow', protect, userIdValidation, validate, checkBlock, followUser);
router.delete('/:userId/unfollow', protect, userIdValidation, validate, unfollowUser);
router.post('/:userId/block', protect, userIdValidation, validate, blockUser);
router.delete('/:userId/unblock', protect, userIdValidation, validate, unblockUser);

module.exports = router;