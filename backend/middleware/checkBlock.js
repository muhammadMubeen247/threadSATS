const User = require('../models/User');

/**
 * Middleware to check if users have blocked each other
 * Prevents blocked users from interacting
 */
const checkBlock = async (req, res, next) => {
  try {
    const currentUserId = req.user.id;
    const targetUserId = req.params.userId;

    // Get both users
    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId).select('blockedUsers'),
      User.findById(targetUserId).select('blockedUsers'),
    ]);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if current user blocked target
    const hasBlockedTarget = currentUser.blockedUsers.some(
      (id) => id.toString() === targetUserId
    );

    // Check if target blocked current user
    const isBlockedByTarget = targetUser.blockedUsers.some(
      (id) => id.toString() === currentUserId
    );

    if (hasBlockedTarget || isBlockedByTarget) {
      return res.status(403).json({
        success: false,
        message: 'Cannot interact with this user',
      });
    }

    next();
  } catch (error) {
    console.error('Check block error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

module.exports = { checkBlock };