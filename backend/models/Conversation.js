const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Persona',
        required: true,
      },
    ],

    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },

    // Optional safety switch (future-proof)
    isBlocked: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// Ensure only 2 participants
conversationSchema.pre('validate', function (next) {
  if (this.participants.length !== 2) {
    return next(new Error('Conversation must have exactly 2 participants'));
  }
  next();
});

// Prevent duplicate conversations between same personas
conversationSchema.index(
  { participants: 1 },
  { unique: true }
);

module.exports = mongoose.model('Conversation', conversationSchema);
