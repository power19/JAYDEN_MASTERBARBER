/**
 * Survey Scheduler
 *
 * Runs every 5 minutes and sends a rating request to customers whose
 * appointment ended at least `survey_delay_minutes` ago (default 30 min).
 *
 * Safe guards:
 *  - Only fires when survey_enabled = '1' in settings
 *  - Never re-sends (survey_sent flag on appointment)
 *  - Skips customers who are currently mid-booking (active session)
 */

const q        = require('../db/queries');
const sessions = require('../utils/sessionManager');

// States where the bot is waiting for freeform input — don't interrupt with a survey
const ACTIVE_STATES = new Set([
  'SELECTING_SERVICE', 'SELECTING_GROUP_SIZE', 'SELECTING_EMPLOYEE',
  'SELECTING_DATE', 'SELECTING_TIME', 'ENTERING_NAME', 'CONFIRMING_BOOKING',
  'MANAGING_BOOKING', 'MANAGING_OPTIONS', 'CONFIRMING_CANCEL',
  'RESCHEDULING_DATE', 'RESCHEDULING_TIME', 'CONFIRMING_RESCHEDULE',
]);

async function runSurveyCheck(client) {
  if (q.getSetting('survey_enabled') !== '1') return;

  const delay   = parseInt(q.getSetting('survey_delay_minutes'), 10) || 30;
  const pending = q.getUnsurveyedAppointments(delay);
  if (pending.length === 0) return;

  console.log(`📊 Survey check — ${pending.length} appointment(s) to survey`);

  for (const appt of pending) {
    try {
      const phone = appt.customer_phone;
      if (!phone) { q.markSurveySent(appt.id); continue; }

      const chatId  = `${phone.replace(/\D/g, '')}@c.us`;
      const session = sessions.getSession(chatId);

      // Always mark sent so the scheduler won't retry endlessly
      q.markSurveySent(appt.id);

      // Skip if customer is mid-booking — don't disrupt their flow
      if (session && ACTIVE_STATES.has(session.state)) {
        console.log(`📊 Survey skipped (mid-booking) for appt #${appt.id}`);
        continue;
      }

      const lang     = session?.language || 'en';
      const barber   = appt.employee_name || 'your barber';
      const template = q.getBotMessage('survey_prompt') ||
        "⭐ *How was your visit today, {name}?*\n\n✂️ _{service} with {barber}_\n\n1️⃣ ⭐ Poor\n2️⃣ ⭐⭐ Fair\n3️⃣ ⭐⭐⭐ Good\n4️⃣ ⭐⭐⭐⭐ Great\n5️⃣ ⭐⭐⭐⭐⭐ Excellent!\n\n_Reply with a number 1–5_";

      const message = template
        .replace('{name}',    appt.customer_name || 'there')
        .replace('{service}', appt.service_name  || 'your service')
        .replace('{barber}',  barber);

      await client.sendMessage(chatId, message);

      // Put the customer in rating-mode so their next reply is captured as a score
      sessions.updateSession(chatId, {
        state:           'RATING_APPOINTMENT',
        pendingRatingId: appt.id,
        language:        lang,
      });

      console.log(`📊 Survey sent → ${appt.customer_name} (appt #${appt.id})`);
    } catch (err) {
      console.error(`⚠️  Survey failed for appt #${appt.id}:`, err.message);
    }
  }
}

function startSurveyScheduler(client) {
  // Run immediately on start, then every 5 minutes
  runSurveyCheck(client).catch(console.error);
  setInterval(() => runSurveyCheck(client).catch(console.error), 5 * 60 * 1000);
  console.log('📊 Survey scheduler started (checks every 5 min)');
}

module.exports = { startSurveyScheduler };
