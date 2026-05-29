/**
 * web-only.js — Admin dashboard + WhatsApp bot (auto-started).
 * The session in .wwebjs_auth/ is reused automatically — no QR scan needed
 * unless the session has expired.
 *
 * For production use:   node src/web-only.js   or   npm start
 */
require('dotenv').config();
const { createServer } = require('./web/server');
const { startBot }     = require('./bot-runner');
require('./db/queries'); // ensure DB is initialised

createServer().then(() => {
  console.log('🚀 Starting WhatsApp bot…');
  startBot();
});
