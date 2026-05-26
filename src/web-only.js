/**
 * web-only.js — starts ONLY the admin dashboard (no WhatsApp bot).
 * Used for development/preview of the admin panel.
 * For production, use: node src/index.js  (starts both bot + dashboard)
 */
require('dotenv').config();
const { createServer } = require('./web/server');
// DB is initialised as a side-effect of requiring queries
require('./db/queries');

createServer().then(() => {
  console.log('Admin dashboard running. WhatsApp bot NOT started.');
});
