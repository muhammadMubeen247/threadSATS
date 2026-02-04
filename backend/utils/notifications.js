const Notification = require('../models/Notification');
const Persona = require('../models/Persona');
const { getIO } = require('../socket');
const mongoose = require('mongoose');

const personaRoom = (personaId) => `persona:${personaId}`;

async function areBlockedEitherWay(viewerPersonaId, targetPersonaId) {
  if (!viewerPersonaId || !targetPersonaId) return false;

  const [viewer, target] = await Promise.all([
    Persona.findById(viewerPersonaId).select('blocked').lean(),
    Persona.findById(targetPersonaId).select('blocked').lean(),
  ]);

  if (!viewer || !target) return false;

  const viewerBlocked = (viewer.blocked || []).some((id) => String(id) === String(targetPersonaId));
  const targetBlocked = (target.blocked || []).some((id) => String(id) === String(viewerPersonaId));

  return viewerBlocked || targetBlocked;
}

async function getUnreadCount(recipientPersonaId) {
  const rows = await Notification.aggregate([
    { $match: { recipientPersona: new mongoose.Types.ObjectId(recipientPersonaId), isRead: false } },
    { $group: { _id: null, total: { $sum: '$count' } } },
  ]);

  return rows?.[0]?.total || 0;
}

async function upsertNotification({
  recipientPersonaId,
  actorPersonaId,
  type,
  groupKey,
  entityType,
  entityId,
  secondaryEntityId = null,
}) {
  if (!recipientPersonaId || !type || !groupKey || !entityType || !entityId) return null;

  if (actorPersonaId && String(actorPersonaId) === String(recipientPersonaId)) return null;

  if (actorPersonaId) {
    const blocked = await areBlockedEitherWay(actorPersonaId, recipientPersonaId);
    if (blocked) return null;
  }

  // ✅ IMPORTANT: do NOT set the same fields in $set and $setOnInsert
  const doc = await Notification.findOneAndUpdate(
    { recipientPersona: recipientPersonaId, groupKey },
    {
      $setOnInsert: {
        recipientPersona: recipientPersonaId,
        type,
        groupKey,
        entityType,
        entityId,
      },
      $set: {
        // mutable fields only
        lastActorPersona: actorPersonaId || null,
        secondaryEntityId: secondaryEntityId || null,

        // every new event makes it unread again
        isRead: false,
        readAt: null,
      },
      $inc: { count: 1 },
    },
    { upsert: true, new: true }
  )
    .populate('lastActorPersona', 'handle displayName profilePic type')
    .lean();

  // realtime emit
  const io = getIO?.();
  if (io) {
    const unread = await getUnreadCount(recipientPersonaId);
    io.to(personaRoom(recipientPersonaId)).emit('notif:new', { notification: doc });
    io.to(personaRoom(recipientPersonaId)).emit('notif:unread', { unread });
  }

  return doc;
}

module.exports = { upsertNotification, getUnreadCount };