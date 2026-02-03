const mongoose = require('mongoose');

const threadSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      trim: true,
      maxlength: [500, 'Thread cannot exceed 500 characters'],
      required: function () {
        const t = this.type || 'thread';
        return t === 'thread' || t === 'quote';
      },
      default: '',
    },

    // ✅ author is now a Persona (public or anon)
    authorPersona: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Persona',
      required: true,
      index: true,
    },

    images: [
      {
        url: { type: String, required: true },
        publicId: { type: String, required: true },
        thumbnail: { type: String },
        width: Number,
        height: Number,
        format: String,
      },
    ],

    // ✅ likes are now Personas
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Persona' }],

    commentCount: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },

    type: {
      type: String,
      enum: ['thread', 'repost', 'quote'],
      default: 'thread',
      index: true,
    },

    repostOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Thread',
      default: null,
      index: true,
    },

    repostCount: { type: Number, default: 0 },

    // ✅ NEW: mentioned personas in content
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Persona', index: true }],
  },
  { timestamps: true }
);

threadSchema.index({ authorPersona: 1, createdAt: -1 });
threadSchema.index({ createdAt: -1 });
threadSchema.index({ isDeleted: 1 });

// ✅ uniqueness ONLY for plain repost toggle (per persona now)
threadSchema.index(
  { authorPersona: 1, repostOf: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'repost', isDeleted: false },
  }
);

threadSchema.virtual('likesCount').get(function () {
  return this.likes.length;
});

threadSchema.set('toJSON', { virtuals: true });
threadSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Thread', threadSchema);