const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: [true, 'Comment content is required'],
      trim: true,
      maxlength: [500, 'Comment cannot exceed 500 characters'],
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Thread',
      required: true,
      index: true,
    },
    parentCommentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
      index: true,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Track nesting depth (0 = direct comment on thread, 1 = reply to comment, etc.)
    depth: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Denormalized count for performance
    replyCount: {
      type: Number,
      default: 0,
    },
    // Soft delete
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
commentSchema.index({ threadId: 1, createdAt: -1 });
commentSchema.index({ threadId: 1, parentCommentId: 1 });
commentSchema.index({ author: 1, createdAt: -1 });
commentSchema.index({ parentCommentId: 1, createdAt: 1 });
commentSchema.index({ isDeleted: 1 });

// Compound index for sorting by likes
commentSchema.index({ threadId: 1, likes: -1 });

// Virtual for likes count
commentSchema.virtual('likesCount').get(function () {
  return this.likes.length;
});

// Ensure virtuals are included in JSON
commentSchema.set('toJSON', { virtuals: true });
commentSchema.set('toObject', { virtuals: true });

// Middleware to increment parent's replyCount
commentSchema.post('save', async function (doc) {
  if (doc.parentCommentId && !doc.isDeleted) {
    await mongoose.model('Comment').findByIdAndUpdate(doc.parentCommentId, {
      $inc: { replyCount: 1 },
    });
  }
  
  // Also increment thread's comment count
  if (!doc.isDeleted) {
    await mongoose.model('Thread').findByIdAndUpdate(doc.threadId, {
      $inc: { commentCount: 1 },
    });
  }
});

// Middleware to decrement counts on soft delete
commentSchema.pre('save', async function (next) {
  if (this.isModified('isDeleted') && this.isDeleted) {
    // Decrement parent's reply count
    if (this.parentCommentId) {
      await mongoose.model('Comment').findByIdAndUpdate(this.parentCommentId, {
        $inc: { replyCount: -1 },
      });
    }
    
    // Decrement thread's comment count
    await mongoose.model('Thread').findByIdAndUpdate(this.threadId, {
      $inc: { commentCount: -1 },
    });
  }
  next();
});

module.exports = mongoose.model('Comment', commentSchema);