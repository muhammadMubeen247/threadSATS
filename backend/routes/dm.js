const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/middleware.auth');

const {
  listConversations,
  createOrGetConversation,
  getMessages,
  sendMessage,
  deleteMessage,
  searchContacts,
  searchMessages,
} = require('../controllers/controllers.dm');

router.use(protect);

router.get('/conversations', listConversations);
router.post('/conversations', createOrGetConversation);

router.get('/conversations/:id/messages', getMessages);
router.post('/conversations/:id/messages', sendMessage);

// ✅ NEW: search contacts (within existing conversations)
router.get('/search/contacts', searchContacts);

// ✅ NEW: search messages
// - optionally pass conversationId to search within one chat
router.get('/search/messages', searchMessages);

router.delete('/messages/:messageId', deleteMessage);

module.exports = router;