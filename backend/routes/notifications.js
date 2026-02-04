const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/middleware.auth');
const {
  getNotifications,
  getUnread,
  markRead,
  markReadAll,
} = require('../controllers/controllers.notification');

router.get('/', protect, getNotifications);
router.get('/unread-count', protect, getUnread);
router.put('/read-all', protect, markReadAll);
router.put('/:id/read', protect, markRead);

module.exports = router;