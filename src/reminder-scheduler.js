/**
 * Reminder Scheduler
 *
 * Runs every 15 minutes and sends a WhatsApp reminder to customers whose
 * appointment is within the configured window (e.g. 24 hours away).
 *
 * Each appointment is reminded exactly once — the reminder_sent flag prevents
 * double-sending even if the scheduler restarts.
 */

const q                = require('./db/queries');
const db               = require('./db/database');
const { getClient }    = require('./whatsapp-client');
const { state: waState } = require('./whatsapp-state');

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // check every 15 minutes
let   _timer = null;

// ── Main check ────────────────────────────────────────────────────────────────

async function checkReminders() {
  try {
    if (q.getSetting('reminder_enabled') !== '1') return;

    const client = getClient();
    if (!client || waState.status !== 'ready') return; // bot not connected

    const hoursAhead = parseInt(q.getSetting('reminder_hours')) || 24;
    const now        = new Date();
    const cutoff     = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    // Find confirmed, unreminded appointments that fall within the reminder window
    const toRemind = db.appointments.find(a =>
      a.status === 'confirmed'   &&
      !a.reminder_sent           &&
      new Date(a.start_time) > now &&
      new Date(a.start_time) <= cutoff
    );

    if (toRemind.length > 0) {
      console.log(`⏰ Reminder check: ${toRemind.length} appointment(s) to remind`);
    }

    for (const appt of toRemind) {
      await sendReminder(appt, client);
    }
  } catch (err) {
    console.error('❌ Reminder scheduler error:', err.message);
  }
}

// ── Send one reminder ─────────────────────────────────────────────────────────

async function sendReminder(appt, client) {
  try {
    const tz       = q.getSetting('timezone') || 'America/Paramaribo';
    const start    = new Date(appt.start_time);
    const employee = appt.employee_id ? q.getEmployee(appt.employee_id) : null;

    const dateStr = start.toLocaleDateString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric', timeZone: tz,
    });
    const timeStr = start.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz,
    });

    const template = q.getBotMessage('reminder_message') ||
      '⏰ *Reminder* — your appointment is on {date} at {time}. See you soon! 💈';

    const message = template
      .replace(/{customer_name}/g,  appt.customer_name      || '')
      .replace(/{service_name}/g,   appt.service_name       || '')
      .replace(/{barber_name}/g,    employee?.name          || 'your barber')
      .replace(/{date}/g,           dateStr)
      .replace(/{time}/g,           timeStr)
      .replace(/{booking_code}/g,   appt.booking_code       || '')
      .replace(/{shop_name}/g,      q.getSetting('shop_name')    || "Jayden's Barbershop")
      .replace(/{shop_address}/g,   q.getSetting('shop_address') || '');

    const waId = _toWhatsAppId(appt.customer_phone);
    if (!waId) {
      console.warn(`⚠️  No WhatsApp ID for appointment ${appt.id} — skipping reminder`);
      return;
    }

    await client.sendMessage(waId, message);

    // Mark as sent so we never double-remind
    db.appointments.updateById(appt.id, { reminder_sent: 1 });
    console.log(`✅ Reminder sent → ${appt.customer_name} (${appt.service_name} on ${dateStr} at ${timeStr})`);
  } catch (err) {
    console.error(`❌ Failed to send reminder for appointment ${appt.id}:`, err.message);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _toWhatsAppId(phone) {
  if (!phone) return null;
  // Already a full WhatsApp ID (e.g. "5971234567@c.us" or "176849808@lid")
  if (phone.includes('@')) return phone;
  // Plain phone number — append @c.us
  return `${phone.replace(/\D/g, '')}@c.us`;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

function startScheduler() {
  if (_timer) clearInterval(_timer);
  console.log('⏰ Reminder scheduler started (checks every 15 min)');
  checkReminders();                                    // run once immediately
  _timer = setInterval(checkReminders, CHECK_INTERVAL_MS);
}

function stopScheduler() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { startScheduler, stopScheduler, checkReminders };
