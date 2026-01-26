const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/middleware.auth');

const {
  listConversations,
  createOrGetConversation,
  getMessages,
  sendMessage,
} = require('../controllers/controllers.dm');

router.use(protect);

router.get('/conversations', listConversations);
router.post('/conversations', createOrGetConversation);

router.get('/conversations/:id/messages', getMessages);
router.post('/conversations/:id/messages', sendMessage);

module.exports = router;