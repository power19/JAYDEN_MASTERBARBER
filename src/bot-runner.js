/**
 * Bot initialisation — shared between index.js (startup) and the API
 * (dashboard "Start Bot" / "Reconnect" button).
 *
 * startBot() is safe to call at any time:
 *   - already active  → no-op
 *   - stale/disconnected client → destroy first, then re-init
 *   - no client yet   → create one from scratch
 */

const QRCode            = require('qrcode');
const { createBot }     = require('./bot');
const { handleMessage } = require('./handlers/conversationHandler');
const { update: waUpdate, state: waState } = require('./whatsapp-state');
const { setClient, getClient }             = require('./whatsapp-client');
const q                 = require('./db/queries');

const ACTIVE = ['initializing', 'qr', 'authenticated', 'ready'];

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
    waUpdate({ status: 'disconnected', qrDataUrl: null });
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp bot ready');
    waUpdate({ status: 'ready', qrDataUrl: null });
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
      if (reply) await msg.reply(reply);
    } catch (err) {
      console.error('❌ Error handling message:', err);
      await msg.reply(`😔 Something went wrong. Please contact us at ${q.getSetting('shop_phone') || 'the shop'}.`);
    }
  });

  client.on('disconnected', (reason) => {
    console.log('⚠️  WhatsApp disconnected:', reason, '— use dashboard to reconnect.');
    waUpdate({ status: 'disconnected', qrDataUrl: null });
  });

  client.initialize();
}

module.exports = { startBot };
