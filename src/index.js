/**
 * Jayden's Barbershop — WhatsApp Booking Bot
 * Entry point: starts the WhatsApp client and wires up all event handlers.
 *
 * First run: a QR code will appear in the terminal.
 * Scan it with the barber's WhatsApp → session saved to .wwebjs_auth/
 * Subsequent runs connect automatically.
 */

require('dotenv').config();

const qrcode = require('qrcode-terminal');
const { createBot } = require('./bot');
const { handleMessage } = require('./handlers/conversationHandler');
const shop = require('./config/shopInfo');

// ── Startup ───────────────────────────────────────────────────────────────────

console.log('');
console.log('╔══════════════════════════════════════╗');
console.log(`║  💈  ${shop.name.padEnd(32)}║`);
console.log('║      WhatsApp Booking Bot            ║');
console.log('╚══════════════════════════════════════╝');
console.log('');

const client = createBot();

// ── WhatsApp events ───────────────────────────────────────────────────────────

client.on('qr', (qr) => {
  console.log('📱 Scan this QR code with WhatsApp on the barber\'s phone:\n');
  qrcode.generate(qr, { small: true });
  console.log('\n⏳ Waiting for scan...\n');
});

client.on('authenticated', () => {
  console.log('🔐 Authenticated — session saved locally.');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Authentication failed:', msg);
  console.error('Delete the .wwebjs_auth/ folder and restart to re-scan the QR.');
  process.exit(1);
});

client.on('ready', () => {
  console.log(`\n✅ Bot is LIVE — listening for messages on WhatsApp.\n`);
  console.log('   Timezone :', process.env.TIMEZONE || 'America/Paramaribo');
  console.log('   Calendar :', process.env.GOOGLE_CALENDAR_ID || 'primary');
  console.log('');
});

// ── Message handling ──────────────────────────────────────────────────────────

client.on('message', async (msg) => {
  // Ignore group chats and broadcast status
  if (msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return;

  // Ignore messages without text (images, voice notes, etc.)
  if (!msg.body || !msg.body.trim()) {
    await msg.reply(
      '📝 Please send a *text message* to interact with the bot.\n\n' +
      'Type *menu* to get started! 💈'
    );
    return;
  }

  console.log(`📨 [${new Date().toLocaleTimeString()}] ${msg.from}: ${msg.body}`);

  try {
    const reply = await handleMessage(msg);
    if (reply) {
      await msg.reply(reply);
    }
  } catch (err) {
    console.error('❌ Unhandled error:', err);
    await msg.reply(
      '😔 Something went wrong on our end. Please try again or contact us at ' +
      shop.phone
    );
  }
});

// ── Shutdown handling ─────────────────────────────────────────────────────────

client.on('disconnected', (reason) => {
  console.log('⚠️  Disconnected:', reason);
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down bot gracefully...');
  await client.destroy();
  process.exit(0);
});

// ── Start ─────────────────────────────────────────────────────────────────────

client.initialize();
