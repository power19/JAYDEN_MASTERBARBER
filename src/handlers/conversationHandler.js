/**
 * Conversation Handler — state machine for the WhatsApp booking flow.
 *
 * States:
 *   IDLE              → show main menu on any message
 *   MAIN_MENU         → waiting for user to pick 1-5
 *   SELECTING_SERVICE → user is choosing a service (starts booking)
 *   SELECTING_DATE    → user is choosing a date
 *   SELECTING_TIME    → user is choosing a time slot
 *   ENTERING_NAME     → user types their name
 *   CONFIRMING_BOOKING→ user confirms YES / NO
 *
 * Global shortcuts (work at any point):
 *   "menu" / "hi" / "hello" → restart to main menu
 *   "cancel" / "exit"       → cancel and go to main menu
 *   "0" / "back"            → go one step back
 */

const sessions      = require('../utils/sessionManager');
const { SERVICES }  = require('../config/services');
const shop          = require('../config/shopInfo');
const { BUSINESS_HOURS, DAY_NAMES } = require('../config/businessHours');
const { getAvailableDates, generateTimeSlots } = require('../utils/dateUtils');
const { getAvailableSlots, createAppointment } = require('../services/googleCalendar');

// Number emojis for menu lists
const NUM = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
const n = i => NUM[i] || `${i + 1}.`;

const CUR = () => process.env.CURRENCY || shop.currency || 'SRD';

// ── Keyword helpers ───────────────────────────────────────────────────────────

const MENU_WORDS   = new Set(['menu','main','home','start','hi','hello','hey','hola','good day','sup']);
const CANCEL_WORDS = new Set(['cancel','exit','quit','stop','nope']);
const BACK_WORDS   = new Set(['0','back','b','terug']);

const isMenu   = t => MENU_WORDS.has(t.toLowerCase().trim());
const isCancel = t => CANCEL_WORDS.has(t.toLowerCase().trim());
const isBack   = t => BACK_WORDS.has(t.toLowerCase().trim());

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Main handler — called for every incoming text message.
 * @param {object} message  whatsapp-web.js Message object
 * @returns {string}        reply text
 */
async function handleMessage(message) {
  const userId = message.from;
  const text   = message.body.trim();
  const session = sessions.getSession(userId);

  // ── Global shortcuts ──────────────────────────────────────────────────────
  if (isMenu(text)) {
    sessions.resetSession(userId);
    sessions.updateSession(userId, { state: 'MAIN_MENU' });
    return mainMenu();
  }
  if (isCancel(text)) {
    sessions.resetSession(userId);
    return '❌ No problem! Booking cancelled.\n\nType *menu* whenever you\'re ready to book. ✂️';
  }

  // ── Route by state ────────────────────────────────────────────────────────
  switch (session.state) {
    case 'IDLE':          return onIdle(userId);
    case 'MAIN_MENU':     return onMainMenu(userId, text);
    case 'SELECTING_SERVICE': return onService(userId, text, session);
    case 'SELECTING_DATE':    return onDate(userId, text, session);
    case 'SELECTING_TIME':    return onTime(userId, text, session);
    case 'ENTERING_NAME':     return onName(userId, text, session);
    case 'CONFIRMING_BOOKING':return onConfirm(userId, text, session);
    default:
      sessions.resetSession(userId);
      sessions.updateSession(userId, { state: 'MAIN_MENU' });
      return mainMenu();
  }
}

// ── State handlers ────────────────────────────────────────────────────────────

function onIdle(userId) {
  sessions.updateSession(userId, { state: 'MAIN_MENU' });
  return mainMenu();
}

function onMainMenu(userId, text) {
  switch (text.trim()) {
    case '1':
      sessions.updateSession(userId, { state: 'SELECTING_SERVICE' });
      return serviceMenu(true);
    case '2': return serviceList();
    case '3': return businessHours();
    case '4': return location();
    case '5': return contact();
    default:
      return `Please reply with a number *1 – 5*.\n\n${mainMenu()}`;
  }
}

async function onService(userId, text, session) {
  if (isBack(text)) {
    sessions.updateSession(userId, { state: 'MAIN_MENU' });
    return mainMenu();
  }

  const idx = parseInt(text, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= SERVICES.length) {
    return `Please reply with a number *1 – ${SERVICES.length}*.\n\n${serviceMenu(true)}`;
  }

  const service = SERVICES[idx];
  const dates   = getAvailableDates();

  sessions.updateSession(userId, {
    state: 'SELECTING_DATE',
    selectedService: service,
    availableDates: dates,
  });

  return dateMenu(dates, service);
}

async function onDate(userId, text, session) {
  if (isBack(text)) {
    sessions.updateSession(userId, { state: 'SELECTING_SERVICE' });
    return serviceMenu(true);
  }

  const dates = session.availableDates;
  const idx   = parseInt(text, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= dates.length) {
    return `Please reply with a number *1 – ${dates.length}*.\n\n${dateMenu(dates, session.selectedService)}`;
  }

  const selectedDate = dates[idx];
  const allSlots     = generateTimeSlots(selectedDate.date, session.selectedService.duration);
  const freeSlots    = await getAvailableSlots(selectedDate.date, allSlots);

  if (freeSlots.length === 0) {
    return (
      `😔 No open slots on *${selectedDate.fullDisplay}*. Please pick another day.\n\n` +
      dateMenu(dates, session.selectedService)
    );
  }

  sessions.updateSession(userId, {
    state: 'SELECTING_TIME',
    selectedDate,
    availableSlots: freeSlots,
  });

  return timeMenu(selectedDate, freeSlots, session.selectedService);
}

function onTime(userId, text, session) {
  if (isBack(text)) {
    sessions.updateSession(userId, { state: 'SELECTING_DATE' });
    return dateMenu(session.availableDates, session.selectedService);
  }

  const slots = session.availableSlots;
  const idx   = parseInt(text, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= slots.length) {
    return `Please reply with a number *1 – ${slots.length}*.\n\n${timeMenu(session.selectedDate, slots, session.selectedService)}`;
  }

  sessions.updateSession(userId, {
    state: 'ENTERING_NAME',
    selectedTime: slots[idx],
  });

  return '👤 *Almost done!*\n\nPlease type your *full name* so we can reserve your spot:';
}

function onName(userId, text, session) {
  if (text.length < 2) {
    return '✏️ Please enter your *full name* to continue.';
  }

  const name = text.trim();
  sessions.updateSession(userId, { state: 'CONFIRMING_BOOKING', userName: name });

  return confirmationSummary(name, session.selectedService, session.selectedDate, session.selectedTime);
}

async function onConfirm(userId, text, session) {
  const answer = text.toLowerCase().trim();

  if (answer === 'no' || answer === 'n') {
    sessions.resetSession(userId);
    return '❌ Booking cancelled.\n\nType *1* to start a new booking or *menu* to go home.';
  }

  if (answer !== 'yes' && answer !== 'y') {
    return 'Please reply *YES* to confirm your booking or *NO* to cancel.';
  }

  // ── Create the Google Calendar event ───────────────────────────────────────
  const { selectedService, selectedDate, selectedTime, userName } = session;

  const result = await createAppointment({
    service:       selectedService,
    startTime:     selectedTime.start,
    endTime:       selectedTime.end,
    customerName:  userName,
    customerPhone: userId.replace('@c.us', ''),
  });

  sessions.resetSession(userId);

  if (result.success) {
    return [
      `🎉 *Appointment Confirmed!*`,
      ``,
      `👤 *${userName}*`,
      `${selectedService.emoji} ${selectedService.name}`,
      `📅 ${selectedDate.fullDisplay}`,
      `⏰ ${selectedTime.display}`,
      `💰 ${CUR()} ${selectedService.price}`,
      ``,
      `📍 ${shop.address}`,
      `📞 ${shop.phone}`,
      ``,
      `We look forward to seeing you! ✂️`,
      ``,
      `_To cancel or reschedule please contact us directly._`,
    ].join('\n');
  } else {
    return (
      `😔 Something went wrong saving your booking. Please contact us directly:\n\n` +
      `📞 ${shop.phone}\n\nSorry for the inconvenience!`
    );
  }
}

// ── Message templates ─────────────────────────────────────────────────────────

function mainMenu() {
  return [
    `💈 *Welcome to ${shop.name}!*`,
    ``,
    `How can I help you today?`,
    ``,
    `${n(0)} 📅 Book an Appointment`,
    `${n(1)} 💈 Our Services & Prices`,
    `${n(2)} ⏰ Business Hours`,
    `${n(3)} 📍 Location`,
    `${n(4)} 📞 Contact Us`,
    ``,
    `Reply with a number to continue.`,
  ].join('\n');
}

function serviceMenu(isBooking) {
  const heading = isBooking
    ? `📅 *Book an Appointment*\n\nSelect a service:\n`
    : `💈 *Services*\n`;

  const list = SERVICES.map((s, i) =>
    `${n(i)} ${s.emoji} *${s.name}*\n   ⏱️ ${s.duration} min  |  💰 ${CUR()} ${s.price}\n   _${s.description}_`
  ).join('\n\n');

  return `${heading}\n${list}\n\n_Reply with a number${isBooking ? ', or *0* to go back' : ''}_`;
}

function serviceList() {
  // Info-only view; stays at MAIN_MENU state
  const list = SERVICES.map((s, i) =>
    `${n(i)} ${s.emoji} *${s.name}* — ${CUR()} ${s.price}\n   ⏱️ ${s.duration} min`
  ).join('\n\n');

  return `💈 *Services & Prices*\n\n${list}\n\n📅 Reply *1* to book an appointment\n🏠 Reply *menu* to go back`;
}

function businessHours() {
  const lines = Object.entries(BUSINESS_HOURS).map(([dow, h]) => {
    const day = DAY_NAMES[parseInt(dow, 10)];
    return h
      ? `${day}: *${fmt24(h.open)} – ${fmt24(h.close)}*`
      : `${day}: *Closed*`;
  });
  return `⏰ *Business Hours*\n\n${lines.join('\n')}\n\n🏠 Reply *menu* to go back`;
}

function location() {
  const mapLine = shop.googleMapsLink ? `\n🗺️ ${shop.googleMapsLink}` : '';
  return `📍 *Location*\n\n${shop.address}${mapLine}\n\n🏠 Reply *menu* to go back`;
}

function contact() {
  return [
    `📞 *Contact Us*`,
    ``,
    `📱 WhatsApp / Phone: ${shop.phone}`,
    `📧 Email: ${shop.email}`,
    `📸 Instagram: ${shop.instagram}`,
    ``,
    `🏠 Reply *menu* to go back`,
  ].join('\n');
}

function dateMenu(dates, service) {
  const list = dates.map((d, i) => `${n(i)} ${d.fullDisplay}`).join('\n');
  return [
    `📅 *Select a Date*`,
    `_Service: ${service.emoji} ${service.name}_`,
    ``,
    list,
    ``,
    `Reply with a number, or *0* to go back.`,
  ].join('\n');
}

function timeMenu(date, slots, service) {
  const list = slots.map((s, i) => `${n(i)} ${s.display}`).join('\n');
  return [
    `⏰ *Available Times*`,
    `_${date.fullDisplay} — ${service.emoji} ${service.name} (${service.duration} min)_`,
    ``,
    list,
    ``,
    `Reply with a number, or *0* to go back.`,
  ].join('\n');
}

function confirmationSummary(name, service, date, time) {
  return [
    `✅ *Booking Summary*`,
    ``,
    `👤 Name    : *${name}*`,
    `${service.emoji} Service  : *${service.name}*`,
    `📅 Date    : *${date.fullDisplay}*`,
    `⏰ Time    : *${time.display}*`,
    `⏱️  Duration: *${service.duration} minutes*`,
    `💰 Price   : *${CUR()} ${service.price}*`,
    ``,
    `Reply *YES* to confirm ✅`,
    `Reply *NO* to cancel ❌`,
  ].join('\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt24(t) {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour   = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

module.exports = { handleMessage };
