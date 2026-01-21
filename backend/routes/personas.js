const express = require('express');
const router = express.Router();

const { param, validationResult } = require('express-validator');

const {
  getPersonaProfileByHandle,
  followPersonaByHandle,
  unfollowPersonaByHandle,
  blockPersonaByHandle,
  unblockPersonaByHandle,
  getPersonaThreadsByHandle,       // ✅ add
  getPersonaLikedThreadsByHandle,  // ✅ add
  getPersonaRepliesByHandle,       // ✅ add
} = require('../controllers/controllers.persona');

const { protect } = require('../middleware/middleware.auth');

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

// public/optional-auth
router.get('/:handle/profile', handleValidation, validate, optionalAuth, getPersonaProfileByHandle);

// ✅ content endpoints (public/optional-auth)
router.get('/:handle/threads', handleValidation, validate, optionalAuth, getPersonaThreadsByHandle);
router.get('/:handle/likes', handleValidation, validate, optionalAuth, getPersonaLikedThreadsByHandle);
router.get('/:handle/replies', handleValidation, validate, optionalAuth, getPersonaRepliesByHandle);

// protected interactions
router.post('/:handle/follow', handleValidation, validate, protect, followPersonaByHandle);
router.delete('/:handle/follow', handleValidation, validate, protect, unfollowPersonaByHandle);

router.post('/:handle/block', handleValidation, validate, protect, blockPersonaByHandle);
router.delete('/:handle/block', handleValidation, validate, protect, unblockPersonaByHandle);

module.exports = router;