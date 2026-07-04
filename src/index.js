/**
 * Jayden's Barbershop — Entry Point
 * Starts both the WhatsApp bot and the admin web dashboard.
 */

require('dotenv').config();

const path                 = require('path');
const { execSync }         = require('child_process');
const qrcodeTerminal       = require('qrcode-terminal');
const QRCode               = require('qrcode');
const { createBot }             = require('./bot');
const { handleMessage }         = require('./handlers/conversationHandler');
const { enqueue }               = require('./utils/chatQueue');
const { startSurveyScheduler }  = require('./services/surveyScheduler');
const chatPause                 = require('./utils/chatPause');
const { createServer }          = require('./web/server');
const { startBackupScheduler }  = require('./utils/backup');
const q                         = require('./db/queries');
const { update: waUpdate }      = require('./whatsapp-state');
const { setClient }             = require('./whatsapp-client');

const shopName = q.getSetting('shop_name') || "Jayden's Barbershop";

console.log('');
console.log('╔══════════════════════════════════════════╗');
console.log(`║  💈  ${shopName.substring(0, 34).padEnd(34)}  ║`);
console.log('║      WhatsApp Bot + Admin Dashboard      ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');

// ── Start the admin web server ────────────────────────────────────────────────
createServer().catch(err => {
  console.error('❌ Failed to start web server:', err.message);
});

// ── Daily data backups (runs in every mode, even web-only) ──────────────────────
startBackupScheduler();

// ── Start the WhatsApp bot ────────────────────────────────────────────────────
const client = createBot();
setClient(client);          // share reference so the API can reconnect
waUpdate({ status: 'initializing' });

client.on('qr', async (qr) => {
  // Show in terminal as before
  console.log('📱 Scan this QR code with the barber\'s WhatsApp:\n');
  qrcodeTerminal.generate(qr, { small: true });
  console.log('\n⏳ Also visible at http://localhost:' + (process.env.ADMIN_PORT || 3000) + '\n');

  // Generate a base64 PNG for the dashboard
  try {
    const dataUrl = await QRCode.toDataURL(qr, {
      width: 300,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
    waUpdate({ status: 'qr', qrDataUrl: dataUrl });
  } catch (err) {
    console.error('QR image generation failed:', err.message);
    waUpdate({ status: 'qr', qrDataUrl: null });
  }
});

client.on('authenticated', () => {
  console.log('🔐 WhatsApp authenticated — session saved.');
  waUpdate({ status: 'authenticated', qrDataUrl: null });
});

client.on('auth_failure', (msg) => {
  console.error('❌ WhatsApp auth failed:', msg);
  console.error('   → Delete .wwebjs_auth/ and restart to re-scan the QR.');
  waUpdate({ status: 'disconnected', qrDataUrl: null });
  process.exit(1);
});

client.on('ready', () => {
  const employees = q.getActiveEmployees();
  console.log(`\n✅ WhatsApp bot is LIVE`);
  console.log(`   Active barbers : ${employees.length} (${employees.map(e => e.name).join(', ') || 'none — add via dashboard'})`);
  console.log(`   Bot paused     : ${q.getSetting('bot_paused') === '1' ? 'YES ⚠️' : 'no'}`);
  console.log('');
  waUpdate({ status: 'ready', qrDataUrl: null });
  startSurveyScheduler(client);
});

// ── Human takeover — detect outgoing keyword messages ────────────────────────
client.on('message_create', async (msg) => {
  if (!msg.fromMe) return; // only care about messages the barber sends
  if (msg.to.endsWith('@g.us')) return; // ignore groups

  const body       = (msg.body || '').trim();
  const takeoverKw = (q.getSetting('takeover_keyword') || '#human').trim();
  const releaseKw  = (q.getSetting('release_keyword')  || '#bot').trim();

  if (body.toLowerCase() === takeoverKw.toLowerCase()) {
    chatPause.pauseChat(msg.to);
    console.log(`👤 Human takeover activated for ${msg.to}`);
    try { await msg.delete(true); } catch (e) { /* ignore if delete fails */ }
  } else if (body.toLowerCase() === releaseKw.toLowerCase()) {
    chatPause.resumeChat(msg.to);
    console.log(`🤖 Bot resumed for ${msg.to}`);
    try { await msg.delete(true); } catch (e) { /* ignore if delete fails */ }
  }
});

client.on('message', (msg) => {
  if (msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return;

  console.log(`📨 [${new Date().toLocaleTimeString()}] ${msg.from}: ${msg.body}`);

  // Ignore messages with no text body — shared contacts, media, stickers, etc.
  // They carry no menu choice, and a new customer sharing a contact card fires
  // several empty-body events in a row; each one would re-show the menu, so the
  // customer sees the welcome/menu 2–3× back-to-back. The next real text still
  // triggers the welcome exactly once.
  if (!(msg.body || '').trim()) return;

  // Serialize handling per chat so a customer's rapid-fire messages are processed
  // one at a time, in order — fixes new customers getting the welcome 2–3× in a row.
  enqueue(msg.from, async () => {
    try {
      const reply = await handleMessage(msg);
      if (!reply) return;

      // Route every reply through noteSend() so the watchdog can spot a wedged
      // Chrome (sends time out even though getState() still answers).
      const send = async (content) => {
        try { const r = await client.sendMessage(msg.from, content); noteSend(true); return r; }
        catch (e) { noteSend(false, (e && e.message) || String(e)); throw e; }
      };

      if (typeof reply === 'string') {
        await send(reply);
      } else {
        // Rich reply: { text, ics, filename }
        if (reply.text) await send(reply.text);

        // ICS calendar attachment — isolated try-catch so a send failure
        // never replaces the booking confirmation the user already received.
        // Gated by the ics_enabled setting (absent/unset = on).
        if (reply.ics && q.getSetting('ics_enabled') !== '0') {
          try {
            const { MessageMedia } = require('whatsapp-web.js');
            const media = new MessageMedia(
              'text/calendar',
              Buffer.from(reply.ics, 'utf8').toString('base64'),
              reply.filename || 'appointment.ics'
            );
            await send(media);
            console.log(`📆 ICS calendar file sent to ${msg.from}`);
          } catch (icsErr) {
            // WhatsApp may not support text/calendar — log but don't show error to customer.
            // Their appointment is confirmed; they just won't get the .ics attachment.
            console.error('⚠️  ICS attachment failed (booking still confirmed):', icsErr.message);
          }
        }
      }
    } catch (err) {
      console.error('❌ Error handling message:', err);
      try { await client.sendMessage(msg.from, `😔 Something went wrong. Please contact us at ${q.getSetting('shop_phone') || 'the shop'}.`); } catch (_) {}
    }
  });
});

client.on('disconnected', (reason) => {
  console.log('⚠️  WhatsApp disconnected:', reason);
  console.log('   → Dashboard still running — use the Reconnect button or restart the server.');
  waUpdate({ status: 'disconnected', qrDataUrl: null });
  // Don't exit — keep the web dashboard alive so the admin can reconnect without a terminal restart.
});

// ── Watchdog — keep the bot answering, recover from a wedged session ─────────
//
// Two failure modes are handled:
//   1. Stuck mid-connect ('initializing'/'authenticated') or 'disconnected'.
//   2. Status is 'ready' but the underlying Chrome page is dead — every
//      sendMessage() times out with "Runtime.callFunctionOn timed out".
//      A live-looking client that can't actually reply (the bug we hit).
//
// Recovery is deliberately a HARD restart: kill the WhatsApp Chrome and exit so
// pm2 (autorestart) respawns a clean process. In-process client.destroy() hangs
// on a wedged page — which is exactly what blocked graceful shutdown before.
const WATCHDOG_INTERVAL_MS  = 60_000;   // check every 60 s
const WATCHDOG_THRESHOLD_MS = 120_000;  // act if stuck > 2 min
const PROBE_TIMEOUT_MS      = 15_000;   // getState() must answer within 15 s
const PROBE_FAIL_LIMIT      = 2;        // recover after this many failed probes

const SESSION_DIR = path.join(process.cwd(), '.wwebjs_auth', 'session');
let recovering    = false;
let probeFailures = 0;

function hardRecover(reason) {
  if (recovering) return;
  recovering = true;
  console.error(`🛑 Watchdog hard-recovery: ${reason}. Killing browser, exiting for pm2 restart…`);
  waUpdate({ status: 'disconnected', qrDataUrl: null });
  // Kill any Chrome bound to our WhatsApp profile so the next launch isn't
  // blocked by a stale profile lock (orphaned Chrome survives a bare exit).
  try {
    execSync(`pkill -9 -f "${SESSION_DIR}" || true`, { stdio: 'ignore' });
  } catch (_) { /* best effort */ }
  // Let logs flush, then exit; pm2 brings us back with a fresh Chrome.
  setTimeout(() => process.exit(1), 500);
}

// Send-failure detector — the wedge we actually see in production: Chrome keeps
// receiving messages but sendMessage() times out, while getState() still passes,
// so the liveness probe below misses it. Count consecutive send failures that
// carry a CDP-wedge signature and hard-recover; any successful send resets it.
const WEDGE_RE = /Runtime\.callFunctionOn timed out|Protocol error|Target closed|Execution context was destroyed|Session closed/i;
const SEND_FAIL_LIMIT = 3;
let sendFailures = 0;
function noteSend(ok, errMsg = '') {
  if (ok) { sendFailures = 0; return; }
  if (!WEDGE_RE.test(errMsg)) return;   // ignore unrelated send errors (bad recipient, media type, etc.)
  sendFailures++;
  console.warn(`🐕 Send timeout ${sendFailures}/${SEND_FAIL_LIMIT} (Chrome-wedge signature): ${errMsg}`);
  if (sendFailures >= SEND_FAIL_LIMIT) {
    hardRecover(`${sendFailures} consecutive send timeouts — Chrome wedged`);
  }
}

// Active liveness probe: getState() round-trips through the Chrome page, so a
// hung page makes it hang — we race it against a timeout to detect that.
async function probeReady() {
  try {
    const state = await Promise.race([
      client.getState(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('getState timed out')), PROBE_TIMEOUT_MS)),
    ]);
    if (state !== 'CONNECTED') throw new Error(`state is ${state}`);
    probeFailures = 0;
  } catch (e) {
    probeFailures++;
    console.warn(`🐕 Health probe failed (${probeFailures}/${PROBE_FAIL_LIMIT}): ${e.message}`);
    if (probeFailures >= PROBE_FAIL_LIMIT) {
      hardRecover(`page unresponsive — ${probeFailures} failed health probes`);
    }
  }
}

setInterval(() => {
  if (recovering) return;
  const { status, lastUpdated } = require('./whatsapp-state').state;
  const stuckMs = Date.now() - new Date(lastUpdated).getTime();

  if (status === 'ready') {
    probeReady();                       // async — fire and forget
  } else if (status === 'disconnected' && stuckMs > WATCHDOG_THRESHOLD_MS) {
    hardRecover(`disconnected for ${Math.round(stuckMs / 1000)}s`);
  } else if ((status === 'authenticated' || status === 'initializing') && stuckMs > WATCHDOG_THRESHOLD_MS) {
    hardRecover(`stuck on '${status}' for ${Math.round(stuckMs / 1000)}s`);
  }
  // 'qr' and 'not-running' are intentionally left alone (await human/QR scan).
}, WATCHDOG_INTERVAL_MS);

async function shutdown() {
  console.log('\n👋 Shutting down…');
  // Never let a wedged page block exit — cap destroy() at 3 s, then exit anyway.
  await Promise.race([
    client.destroy().catch(() => {}),
    new Promise(r => setTimeout(r, 3000)),
  ]);
  process.exit(0);
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);

client.initialize();
