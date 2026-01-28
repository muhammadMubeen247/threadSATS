const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    senderPersonaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Persona',
      required: true,
      index: true,
    },
    text: {
      type: String,
      trim: true,
      maxlength: 2000,
      required: true,
    },
    deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Persona' }],
    seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Persona' }],
  },
  { timestamps: true }
);

// Fast message loading per chat
messageSchema.index({ conversationId: 1, createdAt: -1 });

// ✅ NEW: fast search (1 text index per collection)
// Including conversationId improves filtering for “search within a chat”
messageSchema.index(
  { conversationId: 1, text: 'text' },
  { name: 'message_text_search', default_language: 'none' }
);

module.exports = mongoose.model('Message', messageSchema);
