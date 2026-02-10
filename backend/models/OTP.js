const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    index: true,
  },
  otp: {
    type: String,
    required: true,
  },

  // ✅ distinguish signup OTP vs reset-password OTP
  purpose: {
    type: String,
    enum: ['signup', 'reset'],
    default: 'signup',
    index: true,
  },

  // ✅ explicit expiry used by controllers
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// ✅ TTL index: document auto-deletes when expiresAt < now
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for faster lookups
otpSchema.index({ email: 1, purpose: 1, createdAt: -1 });

module.exports = mongoose.model('OTP', otpSchema);