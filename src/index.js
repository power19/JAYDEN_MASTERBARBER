/**
 * Jayden's Barbershop — Entry Point
 * Starts both the WhatsApp bot and the admin web dashboard.
 */

require('dotenv').config();

const qrcode           = require('qrcode-terminal');
const { createBot }    = require('./bot');
const { handleMessage }= require('./handlers/conversationHandler');
const { createServer } = require('./web/server');
const q                = require('./db/queries');

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

client.on('qr', (qr) => {
  console.log('📱 Scan this QR code with the barber\'s WhatsApp:\n');
  qrcode.generate(qr, { small: true });
  console.log('\n⏳ Waiting for scan…\n');
});

client.on('authenticated', () => {
  console.log('🔐 WhatsApp authenticated — session saved.');
});

client.on('auth_failure', (msg) => {
  console.error('❌ WhatsApp auth failed:', msg);
  console.error('   → Delete .wwebjs_auth/ and restart to re-scan the QR.');
  process.exit(1);
});

client.on('ready', () => {
  const employees = q.getActiveEmployees();
  console.log(`\n✅ WhatsApp bot is LIVE`);
  console.log(`   Active barbers : ${employees.length} (${employees.map(e => e.name).join(', ') || 'none — add via dashboard'})`);
  console.log(`   Bot paused     : ${q.getSetting('bot_paused') === '1' ? 'YES ⚠️' : 'no'}`);
  console.log('');
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
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down…');
  await client.destroy().catch(() => {});
  process.exit(0);
});

client.initialize();
