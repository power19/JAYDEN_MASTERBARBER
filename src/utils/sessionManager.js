/**
 * Session Manager — tracks each WhatsApp user's place in the booking conversation.
 * Sessions expire after SESSION_TIMEOUT_MINUTES of inactivity.
 */

function getTimeoutMs() {
  try {
    const q = require('../db/queries');
    const val = parseInt(q.getSetting('session_timeout_minutes'));
    if (val > 0) return val * 60 * 1000;
  } catch (_) {}
  return (parseInt(process.env.SESSION_TIMEOUT_MINUTES) || 30) * 60 * 1000;
}

class SessionManager {
  constructor() {
    this.sessions = new Map();
    // Purge stale sessions every 10 minutes
    setInterval(() => this._cleanup(), 10 * 60 * 1000);
  }

  /** Returns the existing (non-expired) session or creates a fresh one. */
  getSession(userId) {
    const s = this.sessions.get(userId);
    if (!s || Date.now() - s.lastActivity > getTimeoutMs()) {
      return this._create(userId);
    }
    s.lastActivity = Date.now();
    return s;
  }

  /** Merge `updates` into the session. */
  updateSession(userId, updates) {
    const s = this.sessions.get(userId) || this._create(userId);
    const next = { ...s, ...updates, lastActivity: Date.now() };
    this.sessions.set(userId, next);
    return next;
  }

  /** Wipe the session and start fresh. */
  resetSession(userId) {
    this.sessions.delete(userId);
    return this._create(userId);
  }

  // ── private ────────────────────────────────────────────────────────────────

  _create(userId) {
    const session = {
      userId,
      state: 'IDLE',
      // booking flow data
      selectedService:  null,
      availableDates:   null,
      selectedDate:     null,
      availableSlots:   null,
      selectedTime:     null,
      userName:         null,
      lastActivity: Date.now(),
    };
    this.sessions.set(userId, session);
    return session;
  }

  _cleanup() {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - s.lastActivity > getTimeoutMs()) this.sessions.delete(id);
    }
  }
}

// Export a singleton
module.exports = new SessionManager();
