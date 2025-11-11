const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
  },
  otp: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600, // Document will auto-delete after 10 minutes (600 seconds)
  },
});

// Index for faster lookups
otpSchema.index({ email: 1, createdAt: 1 });

module.exports = mongoose.model('OTP', otpSchema);