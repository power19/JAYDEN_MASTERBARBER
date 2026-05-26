/**
 * WhatsApp client factory using whatsapp-web.js with LocalAuth.
 * LocalAuth stores the session on disk so you only need to scan
 * the QR code once — it survives restarts.
 */
const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');

function createBot() {
  return new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(process.cwd(), '.wwebjs_auth'),
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    },
  });
}

module.exports = { createBot };
