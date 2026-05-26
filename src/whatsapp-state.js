/**
 * Shared in-memory WhatsApp connection state.
 * Written by index.js (bot events), read by the API router (dashboard).
 *
 * status values:
 *   'not-running'   → bot was never started (web-only mode)
 *   'initializing'  → client.initialize() called, waiting for QR
 *   'qr'            → QR ready to scan; qrDataUrl contains the image
 *   'authenticated' → QR scanned, loading session
 *   'ready'         → fully connected and listening
 *   'disconnected'  → lost connection (restart required)
 */
const state = {
  status:     'not-running',
  qrDataUrl:  null,   // base64 PNG data URL — suitable for <img src="...">
  lastUpdated: null,
};

function update(patch) {
  Object.assign(state, patch, { lastUpdated: new Date().toISOString() });
}

module.exports = { state, update };
