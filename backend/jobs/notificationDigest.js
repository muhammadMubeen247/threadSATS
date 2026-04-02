const cron = require('node-cron');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendNotificationDigestEmail } = require('../config/email');

const UNREAD_THRESHOLD = 5;
const INACTIVE_MS = 12 * 60 * 60 * 1000;    // 12 hours
const RESEND_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours between emails

async function runNotificationDigest() {
  try {
    const now = new Date();
    const inactiveCutoff = new Date(now - INACTIVE_MS);
    const resendCutoff = new Date(now - RESEND_COOLDOWN_MS);
    const appUrl = process.env.FRONTEND_URL || 'https://personas.vercel.app';

    // Find users who haven't logged in for >12 hours AND
    // haven't been sent a digest email in the last 24 hours.
    // Users who have never logged in (lastLoginAt is null) are treated as
    // "inactive" – their account creation (createdAt) acts as the reference.
    const candidates = await User.find({
      isVerified: true,
      $and: [
        {
          $or: [
            { lastLoginAt: { $lt: inactiveCutoff } },
            { lastLoginAt: null },
          ],
        },
        {
          $or: [
            { lastNotifEmailSentAt: { $lt: resendCutoff } },
            { lastNotifEmailSentAt: null },
          ],
        },
      ],
    }).select('_id email publicPersonaId anonPersonaId createdAt lastLoginAt');

    if (!candidates.length) return;

    console.log(`[digest] Checking ${candidates.length} inactive user(s)…`);

    let emailsSent = 0;

    for (const user of candidates) {
      const personaIds = [user.publicPersonaId, user.anonPersonaId].filter(Boolean);
      if (!personaIds.length) continue;

      const unreadCount = await Notification.countDocuments({
        recipientPersona: { $in: personaIds },
        isRead: false,
      });

      if (unreadCount <= UNREAD_THRESHOLD) continue;

      const sent = await sendNotificationDigestEmail(user.email, unreadCount, appUrl);
      if (sent) {
        await User.findByIdAndUpdate(user._id, { lastNotifEmailSentAt: now });
        emailsSent++;
      }
    }

    if (emailsSent > 0) {
      console.log(`[digest] Sent ${emailsSent} notification digest email(s).`);
    }
  } catch (err) {
    console.error('[digest] Error running notification digest:', err.message);
  }
}

/**
 * Start the scheduled digest job.
 * Runs every hour at minute 0 — e.g. 01:00, 02:00, …
 */
function startNotificationDigestJob() {
  cron.schedule('0 * * * *', runNotificationDigest, {
    scheduled: true,
    timezone: 'Asia/Karachi',
  });
  console.log('[digest] Notification digest job scheduled (hourly).');
}

module.exports = { startNotificationDigestJob, runNotificationDigest };
