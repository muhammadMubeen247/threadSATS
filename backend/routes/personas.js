const express = require('express');
const router = express.Router();

const { param, body, validationResult } = require('express-validator');
const { protect } = require('../middleware/middleware.auth');
const { uploadSingle, handleUploadError } = require('../middleware/upload');

const {
  getPersonaProfileByHandle,
  followPersonaByHandle,
  unfollowPersonaByHandle,
  removeFollowerByHandle,
  blockPersonaByHandle,
  unblockPersonaByHandle,
  getMyBlockedPersonas, // ✅ already imported
  getPersonaThreadsByHandle,
  getPersonaLikedThreadsByHandle,
  getPersonaRepliesByHandle,

  updateMyActivePersonaHandle,
  updateMyActivePersonaBio,
  updateMyActivePersonaProfilePic,
  updateMyActivePersonaCoverPhoto,
  removeMyActivePersonaProfilePic,
  removeMyActivePersonaCoverPhoto,

  searchPersonas,

  getPersonaFollowersByHandle,
  getPersonaFollowingByHandle,
  getSuggestedPersonas,
} = require('../controllers/controllers.persona');

// Optional auth middleware (same idea as in threads.js)
const optionalAuth = async (req, res, next) => {
  let token;

  if (req.cookies?.token) {
    token = req.cookies.token;
  } else if (req.headers.authorization?.startsWith('Bearer')) {
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

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

const handleValidation = [
  param('handle')
    .trim()
    .notEmpty()
    .withMessage('Handle is required')
    .isLength({ min: 3, max: 30 })
    .withMessage('Handle must be between 3 and 30 characters'),
];

const handleUpdateValidation = [
  body('handle')
    .optional()
    .isString()
    .withMessage('handle must be a string')
    .bail()
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('handle must be between 3 and 20 characters')
    .bail()
    .matches(/^[a-z0-9_]+$/)
    .withMessage('handle can only contain lowercase letters, numbers, and underscores'),
  body('username') // allow username alias too
    .optional()
    .isString()
    .withMessage('username must be a string')
    .bail()
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('username must be between 3 and 20 characters')
    .bail()
    .matches(/^[a-z0-9_]+$/)
    .withMessage('username can only contain lowercase letters, numbers, and underscores'),
];

const bioUpdateValidation = [
  body('bio')
    .exists()
    .withMessage('bio is required')
    .bail()
    .isString()
    .withMessage('bio must be a string')
    .bail()
    .trim()
    .isLength({ max: 150 })
    .withMessage('bio cannot exceed 150 characters'),
];

// ✅ blocked list for ACTIVE persona (protected)
router.get('/me/blocked', protect, getMyBlockedPersonas);

// ✅ search
router.get('/search', protect, searchPersonas);

// public/optional-auth
router.get('/:handle/profile', handleValidation, validate, protect, getPersonaProfileByHandle);

// ✅ content endpoints (public/optional-auth)
router.get('/:handle/threads', handleValidation, validate, protect, getPersonaThreadsByHandle);
router.get('/:handle/likes', handleValidation, validate, protect, getPersonaLikedThreadsByHandle);
router.get('/:handle/replies', handleValidation, validate, protect, getPersonaRepliesByHandle);

// ✅ followers/following lists (public/optional-auth)
router.get('/:handle/followers', handleValidation, validate, protect, getPersonaFollowersByHandle);
router.get('/:handle/following', handleValidation, validate, protect, getPersonaFollowingByHandle);
router.get('/suggested', protect, getSuggestedPersonas);

// protected interactions
router.post('/:handle/follow', handleValidation, validate, protect, followPersonaByHandle);
router.delete('/:handle/follow', handleValidation, validate, protect, unfollowPersonaByHandle);
router.delete('/:handle/follower', handleValidation, validate, protect, removeFollowerByHandle);

router.post('/:handle/block', handleValidation, validate, protect, blockPersonaByHandle);
router.delete('/:handle/block', handleValidation, validate, protect, unblockPersonaByHandle);

// ✅ "me" edit routes (protected)
router.put('/me/handle', protect, handleUpdateValidation, validate, updateMyActivePersonaHandle);
router.put('/me/bio', protect, bioUpdateValidation, validate, updateMyActivePersonaBio);
router.put('/me/profile-pic', protect, uploadSingle, handleUploadError, updateMyActivePersonaProfilePic);
router.delete('/me/profile-pic', protect, removeMyActivePersonaProfilePic);
router.put('/me/cover-photo', protect, uploadSingle, handleUploadError, updateMyActivePersonaCoverPhoto);
router.delete('/me/cover-photo', protect, removeMyActivePersonaCoverPhoto);

module.exports = router;