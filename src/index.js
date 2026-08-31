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
const { setClient, onWedgeDetected, sendReply } = require('./whatsapp-client');
const { sendAdminAlert }        = require('./utils/adminAlert');

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
  // Track when this QR *streak* started (first qr event after being in some
  // other state) — separate from waUpdate's lastUpdated, which resets on
  // every refresh and so can't tell "healthy but ignored" apart from "just
  // started". A QR that keeps refreshing normally but nobody scans can
  // otherwise sit forever with no alert — that happened in production: an
  // hour-plus outage with a live, refreshing QR nobody was watching.
  if (require('./whatsapp-state').state.status !== 'qr') {
    qrFirstSeenAt = Date.now();
    qrAlertSent = false;
  }

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
      // client.sendMessage() is wrapped in whatsapp-client.js's setClient(), so
      // every send here (and everywhere else that reuses this client) already
      // reports into the shared wedge detector — no per-call-site plumbing needed.
      await sendReply(client, msg.from, reply);
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
// whatsapp-web.js cycles a fresh QR (and bumps lastUpdated) roughly every 20s
// while waiting to be scanned. If the page wedges mid-QR-display the loop can
// die silently, leaving a frozen, unscannable code with nothing watching it —
// that happened in production: status sat on 'qr' for 15+ minutes with zero
// refreshes. 90s of staleness is well past any normal refresh gap.
const QR_STUCK_THRESHOLD_MS = 90_000;
// A QR that keeps refreshing normally but nobody scans doesn't trip the
// staleness check above (each refresh resets it) and was never watched by
// anything else — an hour-plus production outage sat on a live, cycling QR
// with zero alerts. This fires once per QR streak regardless of refreshes.
const QR_UNSCANNED_ALERT_MS = 5 * 60_000;

const SESSION_DIR = path.join(process.cwd(), '.wwebjs_auth', 'session');
let recovering     = false;
let probeFailures  = 0;
let qrFirstSeenAt   = null; // set on entering 'qr', survives across refreshes
let qrAlertSent     = false;

async function hardRecover(reason) {
  if (recovering) return;
  recovering = true;
  console.error(`🛑 Watchdog hard-recovery: ${reason}. Killing browser, exiting for pm2 restart…`);
  waUpdate({ status: 'disconnected', qrDataUrl: null });
  // Best-effort — try to get a heads-up out before the client that might be
  // sending it gets killed. sendAdminAlert() never throws and is capped at a
  // few seconds, so this can't meaningfully delay recovery.
  await sendAdminAlert(`⚠️ Jayden's Barbershop bot needs attention: ${reason}. Check http://localhost:${process.env.ADMIN_PORT || 3000} for a QR code.`);
  // Kill any Chrome bound to our WhatsApp profile so the next launch isn't
  // blocked by a stale profile lock (orphaned Chrome survives a bare exit).
  try {
    execSync(`pkill -9 -f "${SESSION_DIR}" || true`, { stdio: 'ignore' });
  } catch (_) { /* best effort */ }
  // Let logs flush, then exit; pm2 brings us back with a fresh Chrome.
  setTimeout(() => process.exit(1), 500);
}

// Send-failure detector lives in whatsapp-client.js now — it wraps sendMessage()
// itself, so it sees failures from every call site (this handler, the ICS
// attachment above, training/gallery media sends, reminders, surveys, admin
// broadcasts…), not just the ones routed through this file. Just wire the
// recovery action to it.
onWedgeDetected(hardRecover);

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
  } else if (status === 'qr' && stuckMs > QR_STUCK_THRESHOLD_MS) {
    hardRecover(`QR code frozen — not refreshed for ${Math.round(stuckMs / 1000)}s`);
  }

  // Separate from the freeze check above: a QR that's actively refreshing
  // but sitting unscanned needs its own alert, once, since restarting won't
  // fix "nobody has looked yet" — it just needs a human notified.
  if (status === 'qr' && qrFirstSeenAt && !qrAlertSent && (Date.now() - qrFirstSeenAt) > QR_UNSCANNED_ALERT_MS) {
    qrAlertSent = true;
    const waitedMin = Math.round((Date.now() - qrFirstSeenAt) / 60000);
    sendAdminAlert(`⏳ Jayden's Barbershop bot has a QR code waiting to be scanned (${waitedMin} min so far). Check http://localhost:${process.env.ADMIN_PORT || 3000}.`);
  }
  // 'not-running' is intentionally left alone (web-only mode, no bot to recover).
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
