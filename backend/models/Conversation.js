const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'Persona', required: true },
    ],

    // ✅ unique key for (A,B) regardless of ordering
    pairKey: { type: String, required: true, unique: true, index: true },

    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  },
  { timestamps: true }
);

// ✅ keep “no groups”
conversationSchema.path('participants').validate(function (v) {
  return Array.isArray(v) && v.length === 2;
}, 'Only 1:1 conversations are supported');

conversationSchema.pre('validate', function (next) {
  if (!Array.isArray(this.participants) || this.participants.length !== 2) return next();

  const [a, b] = this.participants.map((x) => x.toString()).sort();
  this.pairKey = `${a}_${b}`;

  // normalize ordering (helps consistent reads)
  this.participants = [a, b].map((id) => new mongoose.Types.ObjectId(id));
  next();
});

// (optional) if you had this, remove it to avoid misleading uniqueness:
// conversationSchema.index({ participants: 1 }, { unique: true });

module.exports = mongoose.model('Conversation', conversationSchema);
