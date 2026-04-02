const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [20, 'Username cannot exceed 20 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /@(cfd\.nu\.edu\.pk|cuilahore\.edu\.pk)$/,
        'Must be a valid COMSATS email (@cfd.nu.edu.pk or @cuilahore.edu.pk)',
      ],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
    },
    rollNumber: {
      type: String,
      required: [true, 'Roll number is required'],
      unique: true,
      uppercase: true,
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
    },
    batch: {
      type: String,
      required: [true, 'Batch is required'],
    },
    profilePic: {
      type: String,
      default: '',
    },
    coverPhoto: {
      type: String,
      default: '',
    },
    bio: {
      type: String,
      maxlength: [150, 'Bio cannot exceed 150 characters'],
      default: '',
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    following: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // ✅ New: persona references + active surf mode
    publicPersonaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Persona',
      default: null,
      index: true,
    },
    anonPersonaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Persona',
      default: null,
      index: true,
    },
    activeMode: {
      type: String,
      enum: ['public', 'anon'],
      default: 'public',
      index: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    lastNotifEmailSentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ rollNumber: 1 });
userSchema.index({ department: 1 });
userSchema.index({ followers: 1 });
userSchema.index({ following: 1 });
userSchema.index({ publicPersonaId: 1 });
userSchema.index({ anonPersonaId: 1 });
userSchema.index({ activeMode: 1 });

module.exports = mongoose.model('User', userSchema);