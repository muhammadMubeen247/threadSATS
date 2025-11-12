const mongoose = require('mongoose');

const threadSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: [true, 'Thread content is required'],
      trim: true,
      maxlength: [500, 'Thread cannot exceed 500 characters'],
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
        url: String,
        publicId: String, // Cloudinary public ID for deletion
      },
    ],
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Store comment count for performance
    commentCount: {
      type: Number,
      default: 0,
    },
    // For soft delete (optional - keeps data for moderation)
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
threadSchema.index({ author: 1, createdAt: -1 });
threadSchema.index({ createdAt: -1 });
threadSchema.index({ isDeleted: 1 });

// Virtual for likes count
threadSchema.virtual('likesCount').get(function () {
  return this.likes.length;
});

// Ensure virtuals are included in JSON
threadSchema.set('toJSON', { virtuals: true });
threadSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Thread', threadSchema);