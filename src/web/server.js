/**
 * Admin web server — Express app serving the dashboard + REST API.
 * Uses memorystore for sessions (pure JS, no native deps).
 */
const express      = require('express');
const session      = require('express-session');
const MemoryStore  = require('memorystore')(session);
const path         = require('path');
const apiRouter    = require('./routes/api');

const PORT = parseInt(process.env.ADMIN_PORT) || 3000;

function createServer() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(session({
    store: new MemoryStore({ checkPeriod: 86400000 }), // prune expired sessions every 24h
    secret: process.env.ADMIN_PASSWORD || 'barbershop-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 24 hours
  }));

  app.use('/api', apiRouter);
  app.use(express.static(path.join(__dirname, 'public')));

  // SPA fallback
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
