/**
 * Jayden's Barbershop — Entry Point
 * Starts both the WhatsApp bot and the admin web dashboard.
 */

require('dotenv').config();

const qrcodeTerminal       = require('qrcode-terminal');
const QRCode               = require('qrcode');
const { createBot }             = require('./bot');
const { handleMessage }         = require('./handlers/conversationHandler');
const { createServer }          = require('./web/server');
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
  console.log('⚠️  WhatsApp disconnected:', reason);
  console.log('   → Dashboard still running — use the Reconnect button or restart the server.');
  waUpdate({ status: 'disconnected', qrDataUrl: null });
  // Don't exit — keep the web dashboard alive so the admin can reconnect without a terminal restart.
});

process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down…');
  await client.destroy().catch(() => {});
  process.exit(0);
});

client.initialize();
