const mongoose = require('mongoose');

const personaSchema = new mongoose.Schema(
  {
    ownerUserId: {
      // private mapping; must never be exposed in APIs
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      select: false,
      index: true,
    },
    type: {
      type: String,
      enum: ['public', 'anon'],
      required: true,
      index: true,
    },

    // ✅ For first-time anon onboarding
    isConfigured: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Public-facing identity fields (safe to expose)
    handle: {
      // unique handle for persona profiles (anon uses generated handle)
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      index: true,
    },
    displayName: {
      // what to show in UI; for anon you can keep it "Anonymous" or "anon_xxx"
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
      default: 'Anonymous',
    },
    profilePic: {
      type: String,
      default: '',
    },
    // ✅ add
    coverPhoto: {
      type: String,
      default: '',
    },
    bio: {
      type: String,
      maxlength: 150,
      default: '',
    },

    // ✅ public-only fields (empty for anon persona)
    rollNumber: { type: String, default: '' },
    department: { type: String, default: '' },
    batch: { type: String, default: '' },

    // Independent social graph (persona -> persona)
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Persona' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Persona' }],
    blocked: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Persona' }],
  },
  { timestamps: true }
);

personaSchema.index({ handle: 1 }, { unique: true });
personaSchema.index({ ownerUserId: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('Persona', personaSchema);