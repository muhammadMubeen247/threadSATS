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

    // For future read receipts
    seenBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Persona',
      },
    ],
  },
  { timestamps: true }
);

// Fast message loading per chat
messageSchema.index({ conversationId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
