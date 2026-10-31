/**
 * Per-chat serialization queue.
 *
 * WhatsApp delivers each incoming message as an independent 'message' event.
 * The handler is async (it awaits getContact, DB reads and sending), so two
 * messages from the SAME chat that arrive within a second or two can interleave:
 * both read the session as IDLE *before* either persists the state transition,
 * and a new customer who fires off several quick messages gets the welcome
 * message two or three times in a row.
 *
 * enqueue(key, task) chains tasks per key so a chat's messages are processed
 * strictly one at a time, in arrival order. Different chats still run in
 * parallel. The chain for a key is dropped once its work drains, so the map
 * never grows unbounded.
 */
const chains = new Map();

function enqueue(key, task) {
  const prev = chains.get(key) || Promise.resolve();
  // Run task only after the previous one settles (success OR failure).
  const run  = prev.then(task, task);
  // Tail never rejects, so one failing message can't stall the chat's queue.
  const tail = run.catch(() => {});
  chains.set(key, tail);
  // Clean up once this chat has no more queued work.
  tail.then(() => { if (chains.get(key) === tail) chains.delete(key); });
  return run;
}

module.exports = { enqueue };
