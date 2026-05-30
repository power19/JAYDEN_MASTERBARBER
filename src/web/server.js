/**
 * Admin web server — Express app serving the dashboard + REST API.
 * Uses memorystore for sessions (pure JS, no native deps).
 */
const express      = require('express');
const session      = require('express-session');
const MemoryStore  = require('memorystore')(session);
const path         = require('path');
const fs           = require('fs');
const apiRouter    = require('./routes/api');

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const PORT = parseInt(process.env.ADMIN_PORT) || 3000;

function createServer() {
  const app = express();

  app.use(express.json({ limit: '20mb' }));       // large enough for base64 photo uploads
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  app.use(session({
    store: new MemoryStore({ checkPeriod: 86400000 }), // prune expired sessions every 24h
    secret: process.env.ADMIN_PASSWORD || 'barbershop-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 24 hours
  }));

  app.use('/api', apiRouter);
  app.use('/uploads', express.static(UPLOADS_DIR)); // serve uploaded photos
  app.use(express.static(path.join(__dirname, 'public')));

  // Barber QR scanner page (separate from admin dashboard — no login required)
  app.get('/scan', (_req, res) =>
    res.sendFile(path.join(__dirname, 'public', 'scan.html'))
  );

  // SPA fallback — admin dashboard
  app.get('*', (_req, res) =>
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
  );

  return new Promise(resolve => {
    const server = app.listen(PORT, () => {
      console.log(`🌐 Admin dashboard → http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

module.exports = { createServer };
