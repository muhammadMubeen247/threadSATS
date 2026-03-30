const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: [true, 'Comment content is required'],
      trim: true,
      maxlength: [500, 'Comment cannot exceed 500 characters'],
    },

    // ✅ author is now a Persona
    authorPersona: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Persona',
      required: true,
      index: true,
    },

    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Thread',
      required: true,
    },

    parentCommentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
    },

    // ✅ likes are now Personas
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Persona' }],

    replyCount: { type: Number, default: 0 },
    depth: { type: Number, default: 0 },

    isDeleted: { type: Boolean, default: false },

    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Persona', index: true }],

    flagged: { type: Boolean, default: false },
  },
  { timestamps: true }
);

commentSchema.index({ threadId: 1, parentCommentId: 1, createdAt: -1 });
commentSchema.index({ parentCommentId: 1, likes: -1 });
commentSchema.index({ authorPersona: 1, createdAt: -1 });
commentSchema.index({ isDeleted: 1 });

commentSchema.virtual('likesCount').get(function () {
  return this.likes.length;
});

commentSchema.set('toJSON', { virtuals: true });
commentSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Comment', commentSchema);