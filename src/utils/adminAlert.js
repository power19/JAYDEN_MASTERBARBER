/**
 * Best-effort WhatsApp alert to the shop owner when the bot needs a re-scan.
 *
 * Sent through the same (possibly unhealthy) client that just triggered the
 * alert, so it's not a reliable channel by construction — a deep Chrome wedge
 * that caused the recovery can just as easily swallow this send too. It's
 * still worth attempting: watchdog triggers that aren't a full wedge (stuck
 * 'disconnected'/'initializing', a frozen QR) usually leave the client just
 * healthy enough to get one more message out before recovery kills it.
 */
const { getClient } = require('../whatsapp-client');

const ALERT_SEND_TIMEOUT_MS = 6000;

function toJid(rawPhone) {
  const digits = String(rawPhone || '').replace(/[^0-9]/g, '');
  return digits ? `${digits}@c.us` : null;
}

async function sendAdminAlert(message) {
  const jid = toJid(process.env.ADMIN_ALERT_PHONE);
  if (!jid) return; // not configured — silently skip

  const client = getClient();
  if (!client) return;

  try {
    await Promise.race([
      client.sendMessage(jid, message),
      new Promise((_, rej) => setTimeout(() => rej(new Error('admin alert send timed out')), ALERT_SEND_TIMEOUT_MS)),
    ]);
    console.log(`📟 Admin alert sent to ${jid}`);
  } catch (e) {
    console.warn(`📟 Admin alert failed (bot may be too wedged to send it): ${e.message}`);
  }
}

module.exports = { sendAdminAlert };
