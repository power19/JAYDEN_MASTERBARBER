/**
 * Shared WhatsApp client reference.
 * Set by index.js / bot-runner.js after createBot(); read by the API router,
 * conversationHandler, reminder-scheduler, surveyScheduler, etc.
 * Null in web-only mode (src/web-only.js) before a bot is started.
 */
let _client = null;

// Chrome-wedge detector, wired into sendMessage() itself (see setClient below)
// rather than at each call site. Production wedge: Chrome keeps receiving
// messages but sendMessage() times out ("Runtime.callFunctionOn timed out"),
// so a liveness probe like getState() still passes while every reply silently
// fails. Count consecutive failures carrying this signature — across every
// sendMessage call site, present or future — and notify registered listeners.
const WEDGE_RE        = /Runtime\.callFunctionOn timed out|Protocol error|Target closed|Execution context was destroyed|Session closed/i;
const SEND_FAIL_LIMIT = 3;
const RETRY_DELAY_MS  = 3000;
let sendFailures      = 0;
const wedgeListeners  = [];

function onWedgeDetected(fn) { wedgeListeners.push(fn); }

function noteSend(ok, errMsg = '') {
  if (ok) { sendFailures = 0; return; }
  if (!WEDGE_RE.test(errMsg)) return; // unrelated failure (bad recipient, media type, etc.)
  sendFailures++;
  console.warn(`🐕 Send timeout ${sendFailures}/${SEND_FAIL_LIMIT} (Chrome-wedge signature): ${errMsg}`);
  if (sendFailures >= SEND_FAIL_LIMIT) {
    const reason = `${sendFailures} consecutive send timeouts — Chrome wedged`;
    sendFailures = 0;
    wedgeListeners.forEach(fn => fn(reason));
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setClient(c) {
  _client = c;
  sendFailures = 0;
  // Wrap sendMessage once per client instance so every caller reports into
  // the same detector, gets the same one-retry-on-wedge, and is serialized
  // through the same queue — without needing to know any of that exists.
  if (c && !c.__sendWedgeWrapped) {
    const original = c.sendMessage.bind(c);

    const attempt = async (args) => {
      try {
        return { ok: true, result: await original(...args) };
      } catch (e) {
        return { ok: false, error: (e && e.message) || String(e) };
      }
    };

    // A single hung page can wedge on more than one concurrent CDP call at
    // once — retrying immediately after a timeout tends to hit the same
    // stall. One retry after a short pause clears most of these, since the
    // underlying cause (a momentarily busy Chrome page) is usually transient.
    const sendWithRetry = async (...args) => {
      let outcome = await attempt(args);
      if (!outcome.ok && WEDGE_RE.test(outcome.error)) {
        await sleep(RETRY_DELAY_MS);
        outcome = await attempt(args);
      }
      noteSend(outcome.ok, outcome.error);
      if (!outcome.ok) throw new Error(outcome.error);
      return outcome.result;
    };

    // Serialize all sends through one queue so two customers finishing a
    // booking (or any two events) within moments of each other don't fire
    // overlapping CDP calls at the same Chrome page — a second call landing
    // mid-stall is what compounds a slow moment into a full wedge.
    let queue = Promise.resolve();
    c.sendMessage = (...args) => {
      const run = queue.then(() => sendWithRetry(...args));
      queue = run.catch(() => {}); // keep the chain alive past individual failures
      return run;
    };
    c.__sendWedgeWrapped = true;
  }
}
function getClient() { return _client; }

// Delivers a handleMessage() reply: a string, a rich { text, ics, filename }
// object, or an array of either (sent in order — e.g. a booking summary
// followed by the booked confirmation, sent back-to-back with no reply needed
// in between).
async function sendReply(client, to, reply) {
  if (!reply) return;
  if (Array.isArray(reply)) {
    for (const item of reply) await sendReply(client, to, item);
    return;
  }
  if (typeof reply === 'string') {
    await client.sendMessage(to, reply);
    return;
  }
  // Rich reply: { text, ics, filename }
  if (reply.text) await client.sendMessage(to, reply.text);

  // ICS calendar attachment — isolated try-catch so a send failure never
  // replaces the booking confirmation the user already received. Gated by
  // the ics_enabled setting (absent/unset = on).
  if (reply.ics && require('./db/queries').getSetting('ics_enabled') !== '0') {
    try {
      const { MessageMedia } = require('whatsapp-web.js');
      const media = new MessageMedia(
        'text/calendar',
        Buffer.from(reply.ics, 'utf8').toString('base64'),
        reply.filename || 'appointment.ics'
      );
      await client.sendMessage(to, media);
      console.log(`📆 ICS calendar file sent to ${to}`);
    } catch (icsErr) {
      console.error('⚠️  ICS attachment failed (booking still confirmed):', icsErr.message);
    }
  }
}

module.exports = { setClient, getClient, onWedgeDetected, sendReply };
