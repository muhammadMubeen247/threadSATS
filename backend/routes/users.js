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
  updateBio,
  updateUsername, // ✅ add
} = require('../controllers/controllers.user');
const { protect } = require('../middleware/middleware.auth');
const { checkBlock } = require('../middleware/checkBlock');
const { uploadSingle, handleUploadError } = require('../middleware/upload');
const { param, query, body, validationResult } = require('express-validator'); // ✅ add

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

const bioValidation = [
  body('bio')
    .exists()
    .withMessage('Bio is required')
    .bail()
    .isString()
    .withMessage('Bio must be a string')
    .bail()
    .trim()
    .isLength({ max: 150 })
    .withMessage('Bio cannot exceed 150 characters'),
];

const usernameValidation = [
  body('username')
    .exists()
    .withMessage('Username is required')
    .bail()
    .isString()
    .withMessage('Username must be a string')
    .bail()
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be between 3 and 20 characters')
    .bail()
    .matches(/^[a-z0-9_]+$/i)
    .withMessage('Username can only contain letters, numbers, and underscores'),
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

// ✅ /me routes
router.put('/me/profile-pic', protect, uploadSingle, handleUploadError, updateProfilePic);
router.put('/me/cover-photo', protect, uploadSingle, handleUploadError, updateCoverPhoto);
router.put('/me/bio', protect, bioValidation, validate, updateBio);
router.put('/me/username', protect, usernameValidation, validate, updateUsername); // ✅ add

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