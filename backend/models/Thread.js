const mongoose = require('mongoose');

const threadSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      trim: true,
      maxlength: [500, 'Thread cannot exceed 500 characters'],
      // ✅ require content for normal threads AND quote reposts
      required: function () {
        const t = this.type || 'thread';
        return t === 'thread' || t === 'quote';
      },
      default: '',
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    images: [
      {
        url: {
          type: String,
          required: true,
        },
        publicId: {
          type: String,
          required: true,
        },
        thumbnail: {
          type: String, // Optimized smaller version
        },
        width: Number,
        height: Number,
        format: String,
      },
    ],
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    commentCount: {
      type: Number,
      default: 0,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },

    // ✅ distinguishes normal posts vs reposts vs quote reposts
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

    repostCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Index for faster queries
threadSchema.index({ author: 1, createdAt: -1 });
threadSchema.index({ createdAt: -1 });
threadSchema.index({ isDeleted: 1 });

// ✅ keep uniqueness ONLY for plain repost toggle
threadSchema.index(
  { author: 1, repostOf: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'repost', isDeleted: false },
  }
);

// Virtual for likes count
threadSchema.virtual('likesCount').get(function () {
  return this.likes.length;
});

// Ensure virtuals are included in JSON
threadSchema.set('toJSON', { virtuals: true });
threadSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Thread', threadSchema);