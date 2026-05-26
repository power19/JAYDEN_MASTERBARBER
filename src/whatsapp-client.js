/**
 * Shared WhatsApp client reference.
 * Set by index.js after createBot(); read by the API router for reconnect.
 * Null in web-only mode (src/web-only.js).
 */
let _client = null;

function setClient(c) { _client = c; }
function getClient()  { return _client; }

module.exports = { setClient, getClient };
