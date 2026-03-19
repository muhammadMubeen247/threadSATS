const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipientPersona: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Persona',
      required: true,
      index: true,
    },

    lastActorPersona: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Persona',
      default: null,
      index: true,
    },

    type: {
      type: String,
      // ✅ add "mention"
      enum: ['dm', 'like', 'comment', 'reply', 'follow', 'repost', 'quote', 'mention'],
      required: true,
      index: true,
    },

    groupKey: { type: String, required: true },

    entityType: {
      type: String,
      enum: ['thread', 'comment', 'conversation', 'persona'],
      required: true,
    },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },

    secondaryEntityId: { type: mongoose.Schema.Types.ObjectId, default: null },

    count: { type: Number, default: 1 },

    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ recipientPersona: 1, groupKey: 1 }, { unique: true });
notificationSchema.index({ recipientPersona: 1, updatedAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);