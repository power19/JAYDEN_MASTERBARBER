/**
 * Bot initialisation — shared between index.js (startup) and the API
 * (dashboard "Start Bot" / "Reconnect" button).
 *
 * startBot() is safe to call at any time:
 *   - already active  → no-op
 *   - stale/disconnected client → destroy first, then re-init
 *   - no client yet   → create one from scratch
 */

const QRCode                      = require('qrcode');
const { createBot }               = require('./bot');
const { handleMessage }           = require('./handlers/conversationHandler');
const { update: waUpdate, state: waState } = require('./whatsapp-state');
const { setClient, getClient }    = require('./whatsapp-client');
const { startScheduler }          = require('./reminder-scheduler');
const q                           = require('./db/queries');

const ACTIVE       = ['initializing', 'qr', 'authenticated', 'ready'];
const RETRY_DELAYS = [10, 30, 60, 120, 300]; // seconds between reconnect attempts
let   _retryCount  = 0;
let   _retryTimer  = null;

function scheduleRestart(reason) {
  if (_retryTimer) return; // already scheduled
  const delaySec = RETRY_DELAYS[Math.min(_retryCount, RETRY_DELAYS.length - 1)];
  _retryCount++;
  console.log(`🔄 Auto-restart in ${delaySec}s (attempt ${_retryCount}) — reason: ${reason}`);
  waUpdate({ status: 'disconnected', qrDataUrl: null });
  _retryTimer = setTimeout(async () => {
    _retryTimer = null;
    console.log('🔄 Restarting WhatsApp bot…');
    await startBot();
  }, delaySec * 1000);
}

async function startBot() {
  // Already running — nothing to do
  if (getClient() && ACTIVE.includes(waState.status)) return;

  // Tear down any stale client
  const old = getClient();
  if (old) await old.destroy().catch(() => {});

  const client = createBot();
  setClient(client);
  waUpdate({ status: 'initializing', qrDataUrl: null });

  client.on('qr', async (qr) => {
    console.log('📱 QR code ready — scan via dashboard or terminal');
    try {
      const dataUrl = await QRCode.toDataURL(qr, {
        width: 300, margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      waUpdate({ status: 'qr', qrDataUrl: dataUrl });
    } catch {
      waUpdate({ status: 'qr', qrDataUrl: null });
    }
  });

  client.on('authenticated', () => {
    console.log('🔐 WhatsApp authenticated');
    waUpdate({ status: 'authenticated', qrDataUrl: null });
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ WhatsApp auth failed:', msg);
    scheduleRestart('auth_failure');
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp bot ready');
    _retryCount = 0; // reset backoff on successful connect
    waUpdate({ status: 'ready', qrDataUrl: null });
    startScheduler();
  });

  client.on('message', async (msg) => {
    if (msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return;
    if (!msg.body?.trim()) {
      await msg.reply('📝 Please send a *text message* to interact with the bot.\n\nType *menu* to get started! 💈');
      return;
    }
    console.log(`📨 [${new Date().toLocaleTimeString()}] ${msg.from}: ${msg.body}`);
    try {
      const reply = await handleMessage(msg);
      if (!reply) return;

      if (typeof reply === 'string') {
        // Plain text reply
        await msg.reply(reply);
      } else {
        // Rich reply: { text, ics, filename }
        if (reply.text) await msg.reply(reply.text);

        // ICS calendar attachment — send separately so a failure here
        // never replaces the booking confirmation the user already received.
        if (reply.ics) {
          try {
            const { MessageMedia } = require('whatsapp-web.js');
            const media = new MessageMedia(
              'text/calendar',
              Buffer.from(reply.ics, 'utf8').toString('base64'),
              reply.filename || 'appointment.ics'
            );
            await client.sendMessage(msg.from, media);
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
      await msg.reply(`😔 Something went wrong. Please contact us at ${q.getSetting('shop_phone') || 'the shop'}.`);
    }
  });

  client.on('disconnected', (reason) => {
    console.log(`⚠️  WhatsApp disconnected: ${reason}`);
    scheduleRestart(reason);
  });

  client.initialize();
}

module.exports = { startBot };
