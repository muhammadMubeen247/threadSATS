const crypto = require('crypto');
const User = require('../models/User');
const Persona = require('../models/Persona');

const makePlaceholderAnonHandle = () => `anon_${crypto.randomBytes(6).toString('hex')}`;

// Ensures the user has both personas; safe to call repeatedly
async function ensurePersonasForUser(userId) {
  const user = await User.findById(userId).select(
    'username profilePic coverPhoto bio rollNumber department batch publicPersonaId anonPersonaId activeMode'
  );
  if (!user) return null;

  // Public persona
  if (!user.publicPersonaId) {
    const existingPublic = await Persona.findOne({ ownerUserId: user._id, type: 'public' }).select('_id');
    if (existingPublic?._id) {
      user.publicPersonaId = existingPublic._id;
    } else {
      const created = await Persona.create({
        ownerUserId: user._id,
        type: 'public',
        isConfigured: true,

        handle: user.username,
        displayName: user.username,
        profilePic: user.profilePic || '',
        coverPhoto: user.coverPhoto || '',
        bio: user.bio || '',

        // public-only fields (kept on persona so threads can render without touching User)
        rollNumber: user.rollNumber || '',
        department: user.department || '',
        batch: user.batch || '',
      });
      user.publicPersonaId = created._id;
    }
  }

  // Anon persona (unconfigured until setup)
  if (!user.anonPersonaId) {
    const existingAnon = await Persona.findOne({ ownerUserId: user._id, type: 'anon' }).select('_id');
    if (existingAnon?._id) {
      user.anonPersonaId = existingAnon._id;
    } else {
      let created = null;
      for (let i = 0; i < 5 && !created; i++) {
        try {
          created = await Persona.create({
            ownerUserId: user._id,
            type: 'anon',
            isConfigured: false,

            handle: makePlaceholderAnonHandle(), // placeholder only
            displayName: 'Anonymous',
            profilePic: '',
            coverPhoto: '',
            bio: '',

            rollNumber: '',
            department: '',
            batch: '',
          });
        } catch (e) {
          if (e?.code !== 11000) throw e;
        }
      }
      if (!created) throw new Error('Failed to generate unique anon handle');
      user.anonPersonaId = created._id;
    }
  }

  if (!user.activeMode) user.activeMode = 'public';
  await user.save();

  return user;
}

async function getViewerContext(userId) {
  const user = await ensurePersonasForUser(userId);
  if (!user) return null;

  const activePersonaId = (user.activeMode === 'anon' ? user.anonPersonaId : user.publicPersonaId);
  const ownedPersonaIds = [user.publicPersonaId?.toString(), user.anonPersonaId?.toString()].filter(Boolean);

  return {
    user,
    activePersonaId,
    ownedPersonaIds,
    activeMode: user.activeMode || 'public',
  };
}

async function assertAnonConfigured(user) {
  if (!user?.anonPersonaId) return false;
  const anon = await Persona.findById(user.anonPersonaId).select('isConfigured');
  return !!anon?.isConfigured;
}

module.exports = {
  ensurePersonasForUser,
  getViewerContext,
  assertAnonConfigured,
};