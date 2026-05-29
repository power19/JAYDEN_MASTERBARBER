/**
 * Chat Pause — per-chat human takeover tracker.
 *
 * When a barber types the takeover keyword in a customer chat,
 * that chatId is added here and the bot goes completely silent
 * for that conversation. The release keyword (or dashboard button)
 * removes it.
 *
 * In-memory only: all pauses clear on server restart (safe default).
 */

// Map<chatId, { since: Date, phone: string }>
const pausedChats = new Map();

/** Pause bot for a chat. */
function pauseChat(chatId) {
  const phone = chatId.replace(/@\S+$/, '');
  pausedChats.set(chatId, { since: new Date(), phone });
}

/** Resume bot for a chat. */
function resumeChat(chatId) {
  pausedChats.delete(chatId);
}

/** Returns true if the bot should be silent for this chat. */
function isChatPaused(chatId) {
  return pausedChats.has(chatId);
}

/** Returns all currently paused chats (for the dashboard). */
function getPausedChats() {
  return [...pausedChats.entries()].map(([chatId, info]) => ({
    chatId,
    phone: info.phone,
    since: info.since.toISOString(),
  }));
}

module.exports = { pauseChat, resumeChat, isChatPaused, getPausedChats };
