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
      // 'shell' = Chrome's legacy lightweight headless mode, not the newer
      // 'headless=new' full-compositor implementation. 'new' mode kept the
      // renderer pinned at 50-80% CPU even on an idle WhatsApp Web tab (verified
      // via CDP: JS was 97% idle, layout/style/script/network were near-zero,
      // yet OS-level CPU stayed high) because its compositor keeps producing
      // frames through the software SwiftShader rasterizer regardless of
      // whether anything changed. That CPU pressure is what made media sends
      // (QR codes, training images) time out on Runtime.callFunctionOn and
      // repeatedly trip the wedge watchdog. 'shell' skips that compositor
      // pipeline entirely — it's Puppeteer's recommended mode for headless
      // automation with no visual rendering needs.
      headless: 'shell',
      // Fail an individual hung CDP call after 2 min instead of the 180s default.
      // The health-probe watchdog in index.js catches a dead page far sooner.
      protocolTimeout: 120_000,
      // Puppeteer bakes --disable-dev-shm-usage into its own default args (added
      // regardless of what's in `args` below) — must be excluded explicitly.
      // /dev/shm is 2.7GB on this box (sized for the 6GB-RAM upgrade), so
      // there's no need to force Chrome onto slower disk-backed temp files for
      // shared memory/IPC. That was a plausible contributor to CDP timeouts
      // when sending large media (base64 video through Runtime.callFunctionOn).
      ignoreDefaultArgs: ['--disable-dev-shm-usage'],
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    },
  });
}

module.exports = { createBot };
