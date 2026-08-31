/**
 * Conversation Handler — multi-language, multi-employee booking flow.
 *
 * States:
 *   IDLE → SELECTING_LANGUAGE → MAIN_MENU → SELECTING_SERVICE → SELECTING_GROUP_SIZE
 *   → SELECTING_DATE → SELECTING_TIME → ENTERING_NAME → IDLE
 *
 *   Booking is finalized as soon as the name is known (typed, or already on
 *   file for a returning customer) — no separate YES/NO confirmation step.
 *
 *   Group bookings (family/kids): group size asked after service selection.
 *   If groupSize > barbers → overflow people are auto-scheduled for the next slot right after.
 *   Barbers are always auto-assigned fairly (least-busy) at confirmation time.
 *
 * Global shortcuts (any state after language chosen):
 *   menu / hi / hello / hola / hallo / bonjour → restart at main menu
 *   cancel / exit / annuleer / cancelar / annuler → cancel booking
 *   0 / back / terug / volver / retour            → one step back
 */

const sessions  = require('../utils/sessionManager');
const q         = require('../db/queries');
const chatPause = require('../utils/chatPause');
const {
  createAppointment: calendarCreate,
  cancelEvent:       calendarCancel,
  updateEvent:       calendarUpdate,
} = require('../services/googleCalendar');
const { t, ordinal, buildLanguageMenu, matchLanguage } = require('../i18n/translations');
const { generateIcs }                       = require('../utils/icsGenerator');
const PRIVACY_POLICY                        = require('../config/privacyPolicy');

const NUM       = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
const num       = i => NUM[i] || `*${i + 1}.*`;
const PAGE_SIZE = 10; // max time slots shown per page
const CUR = () => q.getSetting('currency') || 'SRD';

// A group booking can only use as many barbers at once as are actually
// active, and never more than the shop-wide cap (Settings → Booking) — e.g.
// with 3 active barbers and the shop currently limited to 3 at a time, a
// group of 4 has nobody left to serve the 4th person simultaneously.
const maxGroupSize = (numBarbers) =>
  Math.max(1, Math.min(numBarbers, +q.getSetting('max_group_size') || 3));

// Thrown by bookOne() when createAppointment() refuses a write because another
// customer's booking landed on the same employee/time first (see the overlap
// guard in queries.js). Caught in finalizeBooking/onConfirmMulti to bounce the
// customer back to time selection instead of silently double-booking.
class SlotTakenError extends Error {}

const isMenu      = tx => /^(menu|main|home|start|hi|hello|hey|hola|hallo|bonjour|bonsoir)$/i.test(tx.trim());
const isCancel    = tx => /^(cancel|exit|quit|stop|annuleer|afsluiten|cancelar|salir|annuler|quitter)$/i.test(tx.trim());
const isLangReset = tx => /^(language|lang|taal|idioma|langue)$/i.test(tx.trim());

/**
 * Detect financial / discount queries so we can refer the customer to management.
 * Covers English, Dutch, Spanish and French keywords.
 */
const FINANCE_RX = /\b(discount|korting|aanbieding|deal|negotiat|afdingen|betaling|betalen|payment|\bpay\b|cheaper|goedkoper|free.?cut|gratis.?(knip|haircut)|terugbetaling|refund|réduction|remise|descuento|reembolso|remboursement|rebaja|less.?price|price.?reduc)\b/i;
const isFinancialQuery = tx => FINANCE_RX.test(tx);

/** Returns the management contact number (falls back to shop phone if not set). */
const getManagementPhone = () =>
  q.getSetting('management_phone') || q.getSetting('shop_phone') || '';

/**
 * Send a notification message to up to 2 configured CS/notification numbers.
 * Failures are logged but never bubble up — notifications must never break the bot flow.
 */
async function notifyCS(message) {
  const { getClient } = require('../whatsapp-client');
  const client = getClient();
  if (!client) return;
  const phones = [q.getSetting('cs_phone_1'), q.getSetting('cs_phone_2')].filter(Boolean);
  for (const phone of phones) {
    const chatId = `${phone.replace(/\D/g, '')}@c.us`;
    try { await client.sendMessage(chatId, message); }
    catch (e) { console.error(`⚠️  CS notify failed (${phone}):`, e.message); }
  }
}

const isBack   = (tx, lang) => {
  const words = (t(lang, 'back_words') || []);
  return words.includes(tx.trim().toLowerCase());
};
const isYes = (tx, lang) => (t(lang, 'yes_words') || []).includes(tx.trim().toLowerCase());
const isNo  = (tx, lang) => (t(lang, 'no_words')  || []).includes(tx.trim().toLowerCase());

/** Unique id linking all appointments created in a single group/family booking. */
const newGroupId = () => `G${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ── Entry point ───────────────────────────────────────────────────────────────

async function handleMessage(message) {
  const userId = message.from;
  const text   = (message.body || '').trim();

  // Human takeover — bot is completely silent for this chat
  if (chatPause.isChatPaused(userId)) return null;

  // Blocked customer — silently drop (or send a polite refusal)
  const customerPhone = userId.replace(/@\S+$/, '');
  if (q.isPhoneBlocked(customerPhone)) {
    const lang = sessions.getSession(userId).language || 'nl';
    const mgmt = q.getSetting('shop_phone') || '';
    return t(lang, 'customer_blocked', { phone: mgmt || 'us directly' });
  }

  // Bot paused?
  if (q.getSetting('bot_paused') === '1') {
    const msg = (q.getBotMessage('bot_paused_message') || '😊 We are currently unavailable.')
      .replace('{shop_phone}', q.getSetting('shop_phone') || '');
    return msg;
  }

  const session = sessions.getSession(userId);
  const lang    = session.language || null;

  // Parked after media (training video / gallery photos): the next message of
  // ANY kind just re-displays the main menu. It is never treated as an option
  // choice — options are only selected when a menu is actually on screen.
  if (session.state === 'AWAITING_MENU_RETURN' && lang) {
    sessions.updateSession(userId, { state: 'MAIN_MENU' });
    return buildMainMenu(lang);
  }

  // Menu shortcut — preserves language
  if (isMenu(text)) {
    sessions.resetSession(userId);
    if (lang) {
      sessions.updateSession(userId, { state: 'MAIN_MENU', language: lang });
      return buildMainMenu(lang);
    }
    // No language yet — default to Dutch, straight to the main menu (no prompt)
    return defaultEntry(userId, sessions.getSession(userId), null);
  }

  // Cancel shortcut
  if (isCancel(text) && lang) {
    sessions.resetSession(userId);
    return t(lang, 'cancelled');
  }

  // Language reset — works from any state, including main menu
  if (isLangReset(text) && session.state !== 'SELECTING_LANGUAGE') {
    sessions.resetSession(userId);
    sessions.updateSession(userId, { state: 'SELECTING_LANGUAGE' });
    return buildLanguageMenu();
  }

  // Keyword shortcut — only at top-level (not mid-booking/survey/gallery flow)
  const MID_FLOW_STATES = new Set([
    'SELECTING_SERVICE', 'SELECTING_GROUP_SIZE', 'SELECTING_EMPLOYEE',
    'COLLECTING_PERSON_NAME', 'COLLECTING_PERSON_SERVICE',
    'SELECTING_DATE', 'SELECTING_TIME', 'ENTERING_NAME',
    'MANAGING_SELECT', 'MANAGING_BOOKING', 'MANAGING_OPTIONS', 'CONFIRMING_CANCEL', 'CONFIRMING_CANCEL_SCOPE',
    'RESCHEDULING_DATE', 'RESCHEDULING_TIME', 'CONFIRMING_RESCHEDULE',
    'SURVEY_RATING', 'BROWSING_GALLERY',
  ]);
  if (lang && !MID_FLOW_STATES.has(session.state)) {
    const kw = q.matchKeyword(text);
    if (kw) return dispatchKeyword(kw.action, userId, lang, session);
  }

  // Financial / discount query — refer to management (skip during name entry)
  if (lang && isFinancialQuery(text) && session.state !== 'ENTERING_NAME') {
    const phone = getManagementPhone();
    return t(lang, 'finance_referral', { phone: phone || 'the barbershop' });
  }

  // Contact lookup — only needed at the start of a new session (language selection).
  // isMyContact: true = number saved in barber's phone (returning), false = new customer.
  // null = lookup failed → fall back to appointment-based detection.
  let isMyContact = null;
  if (session.state === 'IDLE' || session.state === 'SELECTING_LANGUAGE') {
    try {
      const contact = await message.getContact();
      isMyContact = contact.isMyContact ?? false;
    } catch (e) {
      isMyContact = null; // fail-safe: fallback to appointment check
    }
  }

  // Returning customer with saved language — skip language selection entirely
  if (session.state === 'IDLE') {
    const phone    = userId.replace(/@\S+$/, '');
    const profile  = q.getCustomerByPhone(phone);
    if (profile?.preferred_lang && profile?.name) {
      const lang = profile.preferred_lang;
      sessions.updateSession(userId, { state: 'MAIN_MENU', language: lang, isNewCustomer: false });
      const welcome = t(lang, 'returning_welcome', { name: profile.name });
      return buildMainMenu(lang, welcome);
    }
  }

  switch (session.state) {
    case 'IDLE':
      return defaultEntry(userId, session, isMyContact);
    case 'SELECTING_LANGUAGE':
      return onSelectLanguage(userId, text, session, isMyContact);
    case 'MAIN_MENU':
      return onMainMenu(userId, text, session);
    case 'SELECTING_SERVICE':
      return onService(userId, text, session);
    case 'SELECTING_GROUP_SIZE':
      return onGroupSize(userId, text, session);
    case 'SELECTING_EMPLOYEE':
      return onEmployee(userId, text, session);
    case 'COLLECTING_PERSON_NAME':
      return onCollectPersonName(userId, text, session);
    case 'COLLECTING_PERSON_SERVICE':
      return onCollectPersonService(userId, text, session);
    case 'SELECTING_DATE':
      return onDate(userId, text, session);
    case 'SELECTING_TIME':
      return onTime(userId, text, session);
    case 'ENTERING_NAME':
      return onName(userId, text, session);
    case 'RATING_APPOINTMENT':
      return onRating(userId, text, session);
    case 'MANAGING_SELECT':
      return onManageSelect(userId, text, session);
    case 'MANAGING_BOOKING':
      return onManageBooking(userId, text, session);
    case 'MANAGING_OPTIONS':
      return onManageOptions(userId, text, session);
    case 'CONFIRMING_CANCEL_SCOPE':
      return onConfirmCancelScope(userId, text, session);
    case 'CONFIRMING_CANCEL':
      return onConfirmCancel(userId, text, session);
    case 'RESCHEDULING_DATE':
      return onRescheduleDate(userId, text, session);
    case 'RESCHEDULING_TIME':
      return onRescheduleTime(userId, text, session);
    case 'CONFIRMING_RESCHEDULE':
      return onConfirmReschedule(userId, text, session);
    case 'FEEDBACK_MENU':
      return onFeedbackMenu(userId, text, session);
    case 'FEEDBACK_SUGGESTION':
      return await onFeedbackSuggestion(userId, text, session);
    default:
      sessions.resetSession(userId);
      return defaultEntry(userId, sessions.getSession(userId), null);
  }
}

// ── State handlers ────────────────────────────────────────────────────────────

// Default language for new chats — the bot no longer asks up front; it starts in
// Dutch and customers switch via the "Taal Wijzigen" menu option.
const DEFAULT_LANG = 'nl';

/**
 * First-contact entry: skip the language prompt, start in the default language and
 * go straight to the main menu (with a new- or returning-customer welcome).
 */
function defaultEntry(userId, session, isMyContact = null) {
  const lang    = DEFAULT_LANG;
  const phone   = userId.replace(/@\S+$/, '');
  const profile = q.getCustomerByPhone(phone);
  const isNew   = profile ? false
    : (isMyContact === null ? q.isNewCustomer(phone) : !isMyContact);

  sessions.updateSession(userId, { state: 'MAIN_MENU', language: lang, isNewCustomer: isNew });

  if (isNew) {
    const shop       = q.getSetting('shop_name') || "Jayden's Barbershop";
    const welcomeMsg = q.getBotMessage('new_customer_welcome') || t(lang, 'new_customer_welcome');
    return buildMainMenu(lang, welcomeMsg.replace('{shop_name}', shop));
  }
  if (profile?.name) {
    return buildMainMenu(lang, t(lang, 'returning_welcome', { name: profile.name }));
  }
  return buildMainMenu(lang);
}

function onSelectLanguage(userId, text, session, isMyContact = null) {
  const lang = matchLanguage(text);
  if (!lang) {
    return buildLanguageMenu();
  }

  // New vs returning: check our own customer profiles DB.
  // A customer record is created on first booking confirmation.
  // isMyContact (WhatsApp contact list) is used as a fallback only when
  // our DB has no record yet (e.g., first-ever session before any booking).
  const phone      = userId.replace(/@\S+$/, '');
  const hasProfile = !!q.getCustomerByPhone(phone);
  const isNew      = hasProfile ? false
    : (isMyContact === null ? q.isNewCustomer(phone) : !isMyContact);

  sessions.updateSession(userId, { state: 'MAIN_MENU', language: lang, isNewCustomer: isNew });

  // Persist language preference on customer profile (if they already have one)
  q.saveCustomerLanguage(phone, lang);

  // New customers get a warm first-time welcome instead of the standard header
  if (isNew) {
    const shop    = q.getSetting('shop_name') || "Jayden's Barbershop";
    const welcomeMsg = lang === 'nl'
      ? (q.getBotMessage('new_customer_welcome') || t(lang, 'new_customer_welcome'))
      : t(lang, 'new_customer_welcome');
    const welcome = welcomeMsg.replace('{shop_name}', shop);
    return buildMainMenu(lang, welcome);
  }

  return buildMainMenu(lang);
}

async function onMainMenu(userId, text, session) {
  const lang        = session.language;
  const trimmed     = text.trim();
  const activeItems = getMenuItems().filter(m => m.enabled);
  const idx         = parseInt(trimmed, 10) - 1;

  if (!isNaN(idx) && idx >= 0 && idx < activeItems.length) {
    return dispatchKeyword(activeItems[idx].action, userId, lang, session);
  }

  // Check admin-defined keywords before falling back
  const kw = q.matchKeyword(trimmed);
  if (kw) return dispatchKeyword(kw.action, userId, lang, session);

  // Non-numeric freeform text → refer to management
  if (!/^\d+$/.test(trimmed) && trimmed.length > 0) {
    const phone = getManagementPhone();
    return `${t(lang, 'out_of_scope', { phone: phone || 'the barbershop' })}\n\n${buildMainMenu(lang)}`;
  }
  return `${t(lang, 'invalid_menu')}\n\n${buildMainMenu(lang)}`;
}

async function dispatchKeyword(action, userId, lang, session) {
  switch (action) {
    case 'booking': {
      const employees = q.getActiveEmployees();
      // Fixed customers always book for 1 person — skip group size, go straight to service
      const custPhoneB = userId.replace(/@\S+$/, '');
      const fixedBarberB = q.getBarberForPhone(custPhoneB);
      if (fixedBarberB) {
        sessions.updateSession(userId, { state: 'SELECTING_SERVICE', employees, servicePage: 0, groupSize: 1, isFixedCustomer: true });
        return buildServiceMenu(lang, true, 0);
      }
      sessions.updateSession(userId, { state: 'SELECTING_GROUP_SIZE', employees, servicePage: 0 });
      return buildGroupSizeMenu(lang, null, employees.length);
    }
    case 'gallery':
      // No category picker — post the whole gallery straight away.
      return await sendGallery(userId, lang);
    case 'training':
      return await onTraining(userId, lang);
    case 'hours':    return buildHours(lang);
    case 'location': return buildLocation(lang);
    case 'prices':   return buildPriceList(lang);
    case 'contact':  return buildContact(lang);
    case 'privacy':  return buildPrivacy(lang);
    case 'manage': {
      // Show the customer's own appointments — no code needed, we know their number.
      const phone = userId.replace(/@\S+$/, '');
      const appts = q.getUpcomingAppointmentsByPhone(phone);
      if (appts.length === 1) {
        // Just one — skip the list, go straight to its options.
        sessions.updateSession(userId, { state: 'MANAGING_OPTIONS', managedAppointment: appts[0] });
        return buildManageOptions(lang, appts[0]);
      }
      if (appts.length > 1) {
        sessions.updateSession(userId, { state: 'MANAGING_SELECT', manageList: appts });
        return buildManageList(lang, appts);
      }
      // None under this number — fall back to entering a code (e.g. booked elsewhere).
      sessions.updateSession(userId, { state: 'MANAGING_BOOKING' });
      return t(lang, 'manage_no_appts');
    }
    case 'language':
      sessions.resetSession(userId);
      sessions.updateSession(userId, { state: 'SELECTING_LANGUAGE' });
      return buildLanguageMenu();
    case 'feedback':
      sessions.updateSession(userId, { state: 'FEEDBACK_MENU' });
      return buildFeedbackMenu(lang);
    default:
      return buildMainMenu(lang);
  }
}

async function onService(userId, text, session) {
  const lang = session.language;
  const page = session.servicePage || 0;

  if (isBack(text, lang)) {
    // Fixed customers have no group-size step — go back to main menu
    if (session.isFixedCustomer) {
      sessions.updateSession(userId, { state: 'MAIN_MENU', servicePage: 0 });
      return `↩️ _${t(lang, 'back_to_main_menu')}_\n\n${buildMainMenu(lang)}`;
    }
    // Normal single-person: group size was asked first
    sessions.updateSession(userId, { state: 'SELECTING_GROUP_SIZE', servicePage: 0 });
    return buildGroupSizeMenu(lang, null, session.employees?.length || 1);
  }

  const services = q.getActiveServices();

  // "more" — next page of services
  if (/^(more|meer|más|plus|next|volgende|suivant)$/i.test(text.trim())) {
    const nextPage = page + 1;
    if (nextPage * PAGE_SIZE >= services.length) {
      return buildServiceMenu(lang, true, page);
    }
    sessions.updateSession(userId, { servicePage: nextPage });
    return buildServiceMenu(lang, true, nextPage);
  }

  const localIdx  = parseInt(text, 10) - 1;
  const actualIdx = page * PAGE_SIZE + localIdx;
  const pageCount = Math.min(PAGE_SIZE, services.length - page * PAGE_SIZE);

  if (isNaN(localIdx) || localIdx < 0 || localIdx >= pageCount) {
    return `${t(lang, 'invalid_choice', { max: pageCount })}\n\n${buildServiceMenu(lang, true, page)}`;
  }

  const service = services[actualIdx];
  let employees = q.getEmployeesForService(service.id);

  if (employees.length === 0) {
    return t(lang, 'no_barbers_service', { service: service.name });
  }

  // Fixed customer — lock to their dedicated barber (or fallback if unavailable)
  const customerPhone = userId.replace(/@\S+$/, '');
  const fixedBarber   = q.getBarberForPhone(customerPhone);
  if (fixedBarber && employees.some(e => e.id === fixedBarber.id)) {
    let chosenEmployees = [fixedBarber];

    // If fixed barber has no available dates, try fallbacks in priority order
    const availCheck = q.getAvailableDates(chosenEmployees, lang);
    if (availCheck.length === 0) {
      const fallbackIds = Array.isArray(fixedBarber.fallback_employee_ids) ? fixedBarber.fallback_employee_ids : [];
      for (const fbId of fallbackIds) {
        const fallback = q.getEmployee(fbId);
        if (fallback && employees.some(e => e.id === fallback.id)) {
          const fbDates = q.getAvailableDates([fallback], lang);
          if (fbDates.length > 0) {
            chosenEmployees = [fallback];
            break;
          }
        }
      }
    }

    // Skip group size — fixed customers always book for 1
    const dates = q.getAvailableDates(chosenEmployees, lang);
    sessions.updateSession(userId, {
      state: 'SELECTING_DATE',
      selectedService: service,
      employees: chosenEmployees,
      groupSize: 1,
      isAnyEmployee: true,
      availableDates: dates,
      datePage: 0,
    });
    return buildDateMenu(lang, dates, service, 0);
  }

  // New customer logic — route to the designated barber if configured
  if (session.isNewCustomer) {
    const newCustEmpId = q.getSetting('new_customer_employee_id');
    if (newCustEmpId) {
      const dedicated = employees.filter(e => String(e.id) === String(newCustEmpId));
      // Only restrict if that barber actually offers this service; otherwise fall back to all
      if (dedicated.length > 0) employees = dedicated;
    }
  }

  // Group size was already chosen (single-person path) — go straight to date selection
  const dates = q.getAvailableDates(employees, lang);
  sessions.updateSession(userId, {
    state: 'SELECTING_DATE',
    selectedService: service,
    employees,
    isAnyEmployee: true,
    availableDates: dates,
    datePage: 0,
  });
  return buildDateMenu(lang, dates, service, 0);
}

async function onGroupSize(userId, text, session) {
  const lang = session.language;
  if (isBack(text, lang)) {
    // Group size is now the first booking step — back goes to main menu
    sessions.updateSession(userId, { state: 'MAIN_MENU' });
    return `↩️ _${t(lang, 'back_to_main_menu')}_\n\n${buildMainMenu(lang)}`;
  }

  const { employees } = session;
  const maxAllowed = maxGroupSize(employees.length);
  const n = parseInt(text, 10);

  if (isNaN(n) || n < 1 || n > maxAllowed) {
    return `${t(lang, 'group_invalid', { max: maxAllowed })}\n\n${buildGroupSizeMenu(lang, null, employees.length)}`;
  }

  if (n === 1) {
    // Single person — proceed to service selection
    sessions.updateSession(userId, { state: 'SELECTING_SERVICE', groupSize: 1, servicePage: 0 });
    return buildServiceMenu(lang, true, 0);
  }

  // Multiple people — collect name + service per person
  const groupSize = n;
  const customerPhone = userId.replace(/@\S+$/, '');
  const profile = q.getCustomerByPhone(customerPhone);

  // Always ask for all names — could be a parent booking for kids
  sessions.updateSession(userId, {
    state: 'COLLECTING_PERSON_NAME',
    groupSize,
    persons: [],
    currentPersonIdx: 0,
  });
  return t(lang, 'collect_person_name', { ordinal: ordinal(lang, 1) });
}

function onCollectPersonName(userId, text, session) {
  const lang = session.language;
  const { groupSize, persons, currentPersonIdx } = session;

  if (isBack(text, lang)) {
    if (currentPersonIdx > 0) {
      // Go back to previous person's service selection
      const prevIdx = currentPersonIdx - 1;
      sessions.updateSession(userId, {
        state: 'COLLECTING_PERSON_SERVICE',
        currentPersonIdx: prevIdx,
        servicePage: 0,
      });
      const prevPerson = persons[prevIdx];
      return buildCollectPersonServiceMenu(lang, prevPerson.name, prevIdx + 1, groupSize);
    }
    // Back to group size
    sessions.updateSession(userId, { state: 'SELECTING_GROUP_SIZE' });
    return buildGroupSizeMenu(lang, null, session.employees?.length || 1);
  }

  const name = text.trim();
  if (name.length < 2) return t(lang, 'name_too_short');

  const updatedPersons = [...persons];
  updatedPersons[currentPersonIdx] = { name, service: null };
  sessions.updateSession(userId, {
    state: 'COLLECTING_PERSON_SERVICE',
    persons: updatedPersons,
    servicePage: 0,
  });
  return buildCollectPersonServiceMenu(lang, name, currentPersonIdx + 1, groupSize);
}

async function onCollectPersonService(userId, text, session) {
  const lang = session.language;
  const { groupSize, persons, currentPersonIdx } = session;
  const page = session.servicePage || 0;
  const currentName = persons[currentPersonIdx]?.name || `Person ${currentPersonIdx + 1}`;

  if (isBack(text, lang)) {
    // Go back to name entry for this person
    sessions.updateSession(userId, { state: 'COLLECTING_PERSON_NAME' });
    return t(lang, 'collect_person_name', { ordinal: ordinal(lang, currentPersonIdx + 1) });
  }

  const services = q.getActiveServices();

  if (/^(more|meer|más|plus|next|volgende|suivant)$/i.test(text.trim())) {
    const nextPage = page + 1;
    if (nextPage * PAGE_SIZE >= services.length) {
      return buildCollectPersonServiceMenu(lang, currentName, currentPersonIdx + 1, groupSize, page);
    }
    sessions.updateSession(userId, { servicePage: nextPage });
    return buildCollectPersonServiceMenu(lang, currentName, currentPersonIdx + 1, groupSize, nextPage);
  }

  const localIdx  = parseInt(text, 10) - 1;
  const actualIdx = page * PAGE_SIZE + localIdx;
  const pageCount = Math.min(PAGE_SIZE, services.length - page * PAGE_SIZE);

  if (isNaN(localIdx) || localIdx < 0 || localIdx >= pageCount) {
    return `${t(lang, 'invalid_choice', { max: pageCount })}\n\n${buildCollectPersonServiceMenu(lang, currentName, currentPersonIdx + 1, groupSize, page)}`;
  }

  const service = services[actualIdx];
  const updatedPersons = [...persons];
  updatedPersons[currentPersonIdx] = { name: currentName, service };

  if (currentPersonIdx < groupSize - 1) {
    // More persons to collect
    const nextIdx = currentPersonIdx + 1;
    sessions.updateSession(userId, {
      state: 'COLLECTING_PERSON_NAME',
      persons: updatedPersons,
      currentPersonIdx: nextIdx,
      servicePage: 0,
    });
    return t(lang, 'collect_person_name', { ordinal: ordinal(lang, nextIdx + 1) });
  }

  // All persons collected — find available dates
  const allEmployees = q.getActiveEmployees();
  const availableDates = q.getAvailableDates(allEmployees, lang);
  sessions.updateSession(userId, {
    state: 'SELECTING_DATE',
    persons: updatedPersons,
    groupSize,
    employees: allEmployees,
    isAnyEmployee: true,
    availableDates,
    datePage: 0,
  });
  return buildDateMenu(lang, availableDates, null, 0);
}

function onEmployee(userId, text, session) {
  const lang = session.language;
  if (isBack(text, lang)) {
    sessions.updateSession(userId, { state: 'SELECTING_SERVICE' });
    return buildServiceMenu(lang, true, session.servicePage || 0);
  }

  const { employees, selectedService } = session;
  const allowAny   = q.getSetting('allow_any_employee') !== '0';
  const menuLength = allowAny ? employees.length + 1 : employees.length;
  const idx = parseInt(text, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= menuLength) {
    return `${t(lang, 'invalid_choice', { max: menuLength })}\n\n${buildEmployeeMenu(lang, employees, selectedService, allowAny)}`;
  }

  let selectedEmployee = null;
  let isAnyEmployee    = false;

  if (allowAny && idx === 0) {
    isAnyEmployee = true;
  } else {
    const empIdx = allowAny ? idx - 1 : idx;
    selectedEmployee = employees[empIdx];
  }

  const dates = q.getAvailableDates(employees, lang);
  sessions.updateSession(userId, {
    state: 'SELECTING_DATE',
    selectedEmployee,
    isAnyEmployee,
    availableDates: dates,
    datePage: 0,
  });
  return buildDateMenu(lang, dates, selectedService, 0);
}

async function onDate(userId, text, session) {
  const lang  = session.language;
  const page  = session.datePage || 0;
  const dates = session.availableDates;

  if (isBack(text, lang)) {
    if (session.persons?.length > 1) {
      // Multi-person: back to last person's service selection
      const lastIdx = session.persons.length - 1;
      sessions.updateSession(userId, {
        state: 'COLLECTING_PERSON_SERVICE',
        currentPersonIdx: lastIdx,
        servicePage: 0,
        datePage: 0,
      });
      return buildCollectPersonServiceMenu(lang, session.persons[lastIdx].name, lastIdx + 1, session.groupSize);
    }
    // Single person: back to service selection
    sessions.updateSession(userId, { state: 'SELECTING_SERVICE', datePage: 0 });
    return buildServiceMenu(lang, true, session.servicePage || 0);
  }

  // "more" — next page of dates
  if (/^(more|meer|más|plus|next|volgende|suivant)$/i.test(text.trim())) {
    const nextPage = page + 1;
    if (nextPage * PAGE_SIZE >= dates.length) {
      return buildDateMenu(lang, dates, session.selectedService, page);
    }
    sessions.updateSession(userId, { datePage: nextPage });
    return buildDateMenu(lang, dates, session.selectedService, nextPage);
  }

  const localIdx  = parseInt(text, 10) - 1;
  const actualIdx = page * PAGE_SIZE + localIdx;
  const pageCount = Math.min(PAGE_SIZE, dates.length - page * PAGE_SIZE);

  if (isNaN(localIdx) || localIdx < 0 || localIdx >= pageCount) {
    return `${t(lang, 'invalid_choice', { max: pageCount })}\n\n${buildDateMenu(lang, dates, session.selectedService, page)}`;
  }

  const selectedDate = dates[actualIdx];
  const service      = session.selectedService;
  const employees    = session.employees || q.getActiveEmployees();
  let freeSlots;

  if (session.persons?.length > 1) {
    // Multi-person: fill barbers in parallel waves (3 at once, 4th waits, etc.)
    freeSlots = await q.getAvailableSlotsForBatchGroup(session.persons, employees, selectedDate.date);
    if (freeSlots.length === 0) {
      return `${t(lang, 'no_slots_multi', { date: selectedDate.fullDisplay })}\n\n${buildDateMenu(lang, dates, null, page)}`;
    }
    sessions.updateSession(userId, {
      state: 'SELECTING_TIME',
      selectedDate,
      availableSlots: freeSlots,
      slotPage: 0,
    });
    return buildTimeMenuMulti(lang, selectedDate, freeSlots, session.persons, 0);
  } else if (session.isAnyEmployee) {
    freeSlots = await q.getAvailableSlotsForAny(employees, selectedDate.date, service.duration);
  } else {
    freeSlots = await q.getAvailableSlotsForEmployee(session.selectedEmployee, selectedDate.date, service.duration);
  }

  if (freeSlots.length === 0) {
    return `${t(lang, 'no_slots_date', { date: selectedDate.fullDisplay })}\n\n${buildDateMenu(lang, dates, service, page)}`;
  }

  sessions.updateSession(userId, {
    state: 'SELECTING_TIME',
    selectedDate,
    availableSlots: freeSlots,
    slotPage: 0,
  });
  return buildTimeMenu(lang, selectedDate, freeSlots, service, 0);
}

async function onTime(userId, text, session) {
  const lang  = session.language;
  const page  = session.slotPage || 0;
  const slots = session.availableSlots;

  if (isBack(text, lang)) {
    sessions.updateSession(userId, { state: 'SELECTING_DATE', slotPage: 0 });
    return buildDateMenu(lang, session.availableDates, session.selectedService, session.datePage || 0);
  }

  // "more" — advance to next page
  if (/^(more|meer|más|plus|next|volgende|suivant)$/i.test(text.trim())) {
    const nextPage = page + 1;
    if (nextPage * PAGE_SIZE >= slots.length) {
      return session.persons?.length > 1
        ? buildTimeMenuMulti(lang, session.selectedDate, slots, session.persons, page)
        : buildTimeMenu(lang, session.selectedDate, slots, session.selectedService, page);
    }
    sessions.updateSession(userId, { slotPage: nextPage });
    return session.persons?.length > 1
      ? buildTimeMenuMulti(lang, session.selectedDate, slots, session.persons, nextPage)
      : buildTimeMenu(lang, session.selectedDate, slots, session.selectedService, nextPage);
  }

  // Slot selection — number is 1-based within the current page
  const localIdx  = parseInt(text, 10) - 1;
  const actualIdx = page * PAGE_SIZE + localIdx;
  const pageCount = Math.min(PAGE_SIZE, slots.length - page * PAGE_SIZE);

  if (isNaN(localIdx) || localIdx < 0 || localIdx >= pageCount) {
    const invalidMenu = session.persons?.length > 1
      ? buildTimeMenuMulti(lang, session.selectedDate, slots, session.persons, page)
      : buildTimeMenu(lang, session.selectedDate, slots, session.selectedService, page);
    return `${t(lang, 'invalid_choice', { max: pageCount })}\n\n${invalidMenu}`;
  }

  const selectedSlot = slots[actualIdx];

  // Multi-person booking: skip name entry (names already collected) and the
  // confirm step — book immediately, sending the summary alongside the
  // booked confirmation instead of waiting for a YES/NO reply.
  if (session.persons?.length > 1) {
    const summary = buildConfirmationSummaryMulti(lang, session.persons, session.selectedDate, selectedSlot);
    const updated = sessions.updateSession(userId, { selectedTime: selectedSlot, slotPage: 0 });
    const result  = await finalizeBooking(userId, updated);
    return [summary, result];
  }

  // Single person: skip name entry (and the confirm step) if customer profile already has a name
  const customerPhone  = userId.replace(/@\S+$/, '');
  const knownCustomer  = q.getCustomerByPhone(customerPhone);
  if (knownCustomer?.name) {
    const summary = buildConfirmationSummary(lang, knownCustomer.name, session.selectedService, session.selectedDate, selectedSlot, session.groupSize || 1);
    const updated = sessions.updateSession(userId, { selectedTime: selectedSlot, slotPage: 0, userName: knownCustomer.name });
    const result  = await finalizeBooking(userId, updated);
    return [summary, result];
  }

  sessions.updateSession(userId, { state: 'ENTERING_NAME', selectedTime: selectedSlot, slotPage: 0 });
  return t(lang, 'enter_name');
}

async function onName(userId, text, session) {
  const lang = session.language;
  if (text.length < 2) return t(lang, 'name_too_short');
  const name = text.trim();
  const summary = buildConfirmationSummary(lang, name, session.selectedService, session.selectedDate, session.selectedTime, session.groupSize || 1);
  const updated = sessions.updateSession(userId, { userName: name });
  const result  = await finalizeBooking(userId, updated);
  return [summary, result];
}

// Books the appointment(s) for the current session — called as soon as a name
// is known (typed, or already on file), with no separate YES/NO step.
async function finalizeBooking(userId, session) {
  const lang = session.language;

  // ── Multi-person booking path ─────────────────────────────────────────────
  if (session.persons?.length > 1) {
    return onConfirmMulti(userId, session);
  }

  const { selectedService, selectedDate, selectedTime, userName } = session;
  const groupSize     = session.groupSize || 1;
  const mainCount     = selectedTime.mainCount  || 1;
  const overflowCount = selectedTime.overflowCount || 0;
  const overflowSlot  = selectedTime.overflowSlot  || null;
  const dateStr       = selectedDate.date.toISOString().split('T')[0];
  const customerPhone = userId.replace(/@\S+$/, '');
  const shopCalId     = q.getSetting('google_calendar_id') ||
    (process.env.GOOGLE_CALENDAR_ID !== 'primary' ? process.env.GOOGLE_CALENDAR_ID : null);

  // Link all appointments from this booking so they can be cancelled together.
  // Only set for real groups (2+ people); single bookings stay ungrouped.
  const totalToBook = mainCount + overflowCount;
  const groupId     = totalToBook > 1 ? newGroupId() : '';

  // ── Helper: create one appointment + calendar event ───────────────────────
  // candidatePool: other barber IDs who were also free for this slot, so a
  // clash (someone else just booked `barber`) can retry with an alternate
  // before giving up on the whole slot.
  async function bookOne(slot, barber, candidatePool) {
    const apptData = empId => ({
      employee_id:      empId || null,
      customer_name:    userName,
      customer_phone:   customerPhone,
      booking_group:    groupId,
      service_id:       selectedService.id,
      service_name:     selectedService.name,
      service_emoji:    selectedService.emoji,
      service_duration: selectedService.duration,
      service_price:    selectedService.price,
      start_time:       slot.start,
      end_time:         slot.end,
    });

    let dbResult = q.createAppointment(apptData(barber?.id));

    if (dbResult.clash) {
      const alt = (candidatePool || []).filter(id => String(id) !== String(barber?.id));
      if (alt.length) {
        const altId = q.pickLeastBusyEmployee(alt, dateStr);
        barber   = q.getEmployee(altId);
        dbResult = q.createAppointment(apptData(barber?.id));
      }
    }
    if (dbResult.clash) throw new SlotTakenError();

    if (shopCalId && !dbResult.duplicate) {
      try {
        const r = await calendarCreate({
          calendarId:    shopCalId,
          service:       selectedService,
          startTime:     new Date(slot.start),
          endTime:       new Date(slot.end),
          customerName:  userName,
          bookingCode:   dbResult.booking_code,
          employeeName:  barber?.name,
          employeeColor: barber?.color,
        });
        if (r.success) {
          q.updateAppointment(dbResult.lastInsertRowid, { google_event_id: r.eventId, google_event_link: r.eventLink });
          console.log(`✅ Shop calendar event: ${r.eventLink}`);
        } else {
          console.error(`❌ Shop calendar sync failed: ${r.error}`);
        }
      } catch (err) {
        console.error('❌ Calendar sync exception (booking still saved):', err.message);
      }
    }
    return { id: dbResult.lastInsertRowid, code: dbResult.booking_code, barber, slot };
  }

  // ── Pick barbers & book main group ────────────────────────────────────────
  const mainEmpPool = [...(selectedTime.availableEmployees || [])];
  const usedMain    = new Set();
  const mainBookings = [];
  const overflowBookings = [];

  try {
    for (let i = 0; i < mainCount; i++) {
      const pool  = mainEmpPool.filter(id => !usedMain.has(String(id)));
      const candidatePool = pool.length ? pool : mainEmpPool;
      const empId = q.pickLeastBusyEmployee(candidatePool, dateStr);
      usedMain.add(String(empId));
      mainBookings.push(await bookOne(selectedTime, q.getEmployee(empId), candidatePool));
    }

    // ── Pick barbers & book overflow group ──────────────────────────────────
    // Overflow barbers are NOT excluded from the main pool — they finished the
    // main appointment and are free again by the overflow start time.
    if (overflowCount > 0 && overflowSlot) {
      const ovPool  = [...(overflowSlot.availableEmployees || mainEmpPool)];
      const usedOv  = new Set();
      for (let i = 0; i < overflowCount; i++) {
        const pool  = ovPool.filter(id => !usedOv.has(String(id)));
        const candidatePool = pool.length ? pool : ovPool;
        const empId = q.pickLeastBusyEmployee(candidatePool, dateStr);
        usedOv.add(String(empId));
        overflowBookings.push(await bookOne(overflowSlot, q.getEmployee(empId), candidatePool));
      }
    }
  } catch (err) {
    if (!(err instanceof SlotTakenError)) throw err;
    // Another customer grabbed this slot mid-flow. Roll back anything this
    // call already wrote so we don't leave a half-booked, uncommunicated
    // group, then send the customer back to a freshly-fetched time menu.
    for (const b of [...mainBookings, ...overflowBookings]) {
      if (b.id) q.cancelAppointment(b.id);
    }
    const employees = session.employees || q.getActiveEmployees();
    const freeSlots  = session.isAnyEmployee
      ? await q.getAvailableSlotsForAny(employees, selectedDate.date, selectedService.duration)
      : await q.getAvailableSlotsForEmployee(session.selectedEmployee, selectedDate.date, selectedService.duration);
    sessions.updateSession(userId, { state: 'SELECTING_TIME', selectedTime: null, availableSlots: freeSlots, slotPage: 0 });
    return freeSlots.length
      ? `${t(lang, 'slot_taken_retry')}\n\n${buildTimeMenu(lang, selectedDate, freeSlots, selectedService, 0)}`
      : `${t(lang, 'slot_taken_retry')}\n\n${t(lang, 'no_slots_date', { date: selectedDate.fullDisplay })}`;
  }

  sessions.resetSession(userId);

  // ── Build reply message ───────────────────────────────────────────────────
  const totalCount   = mainCount + overflowCount;
  // Footer is auto-translated. Point customers to the self-service "manage" menu
  // option for cancel/reschedule; fall back to "contact us" if that option is off.
  const manageNum  = manageMenuNumber();
  const cancelLine = manageNum ? t(lang, 'booked_cancel_self', { option: manageNum }) : t(lang, 'booked_cancel_note');
  const footer       = `${t(lang, 'booked_footer_default')}\n\n_${cancelLine}_`;
  // Only mention the calendar invite when the .ics attachment will actually be sent.
  const calendarNote = q.getSetting('ics_enabled') !== '0' ? t(lang, 'calendar_invite_note') : null;
  const totalPrice   = (+selectedService.price * totalCount).toFixed(0);

  const lines = [
    totalCount > 1
      ? t(lang, 'booked_header_group', { count: totalCount })
      : t(lang, 'booked_header'),
    ``,
  ];

  if (totalCount === 1) {
    // Minimal single-booking confirmation: booking code only. Customer name,
    // service, date, barber, time and price are intentionally omitted.
    const b = mainBookings[0];
    lines.push(t(lang, 'booked_code', { code: b.code }));
  } else {
    // Group — show customer, service/date, time slots, then codes per person
    lines.push(`👤 *${userName}*`);
    lines.push(`${selectedService.emoji} ${selectedService.name}  |  📅 ${selectedDate.fullDisplay}`);
    lines.push(``);
    lines.push(`⏰ *${selectedTime.display}* — ${mainCount} ${t(lang, 'group_people_lower')}:`);
    mainBookings.forEach((b, i) => {
      const barberPart = b.barber ? ` (${b.barber.name})` : '';
      lines.push(`   ${i + 1}. 🎫 *${b.code}*${barberPart}`);
    });

    if (overflowBookings.length > 0) {
      lines.push(``);
      lines.push(`⏰ *${overflowSlot.display}* — ${overflowCount} ${t(lang, 'group_people_lower')}:`);
      overflowBookings.forEach((b, i) => {
        const barberPart = b.barber ? ` (${b.barber.name})` : '';
        lines.push(`   ${i + 1}. 🎫 *${b.code}*${barberPart}`);
      });
    }

    lines.push(``);
    lines.push(t(lang, 'booked_code_note'));
    lines.push(`${t(lang, 'confirm_price')}: *${CUR()} ${totalPrice} (${totalCount}×${selectedService.price})*`);
  }

  const shopAddress  = q.getSetting('shop_address') || '';
  const mapsLink     = q.getSetting('google_maps_link') || '';
  const addressLine  = mapsLink ? `📍 ${shopAddress}\n${mapsLink}` : `📍 ${shopAddress}`;

  lines.push(
    ``,
    addressLine,
    `📞 ${q.getSetting('shop_phone') || ''}`,
    ``,
    footer,
  );
  if (calendarNote) lines.push(``, calendarNote);
  lines.push(``, t(lang, 'payment_methods'));

  const replyText = lines.filter(l => l !== undefined && l !== null).join('\n');

  // ICS for the first (main) slot
  const firstBooking = mainBookings[0];
  const ics = generateIcs({
    bookingCode:     firstBooking.code,
    customerName:    userName,
    serviceName:     selectedService.name,
    serviceEmoji:    selectedService.emoji,
    serviceDuration: selectedService.duration,
    startTime:       new Date(selectedTime.start),
    endTime:         new Date(selectedTime.end),
    barberName:      firstBooking.barber?.name,
    shopName:        q.getSetting('shop_name')    || "Jayden's Barbershop",
    shopAddress:     q.getSetting('shop_address') || '',
    shopPhone:       q.getSetting('shop_phone')   || '',
  });

  // ── Register / update customer profile ───────────────────────────────────
  q.getOrCreateCustomer(userName, customerPhone);

  // ── Send QR check-in code to customer (best-effort, non-blocking) ─────────
  // QR encodes only the booking code — check-in happens via the authenticated
  // dashboard scanner. Customers cannot self-check-in by scanning their own QR.
  try {
    const { getClient }   = require('../whatsapp-client');
    const { MessageMedia } = require('whatsapp-web.js');
    const QRCode  = require('qrcode');
    const wClient = getClient();
    if (wClient) {
      for (const booking of [...mainBookings, ...overflowBookings]) {
        const qrDataUrl = await QRCode.toDataURL(booking.code, {
          width: 300, margin: 2,
          color: { dark: '#0f172a', light: '#ffffff' },
        });
        const base64  = qrDataUrl.split(',')[1];
        const media   = new MessageMedia('image/png', base64, `checkin-${booking.code}.png`);
        const caption = `🔲 *Check-in code: ${booking.code}*`;
        await wClient.sendMessage(userId, media, { caption });
      }
    }
  } catch (e) {
    console.error('⚠️  QR send failed (booking still confirmed):', e.message);
  }

  // ── CS / notification number forwarding ──────────────────────────────────
  const isNewCust     = session.isNewCustomer;
  const allCodes      = [...mainBookings, ...overflowBookings].map(b => b.code).join(', ');
  const firstBarber  = mainBookings[0]?.barber?.name || '—';
  const csLines = [
    isNewCust
      ? `🆕 *NEW CUSTOMER — First-Time Visit!*\n⚡ Assigned to ${firstBarber} as per new-customer policy.\n`
      : `📋 *New Booking Confirmed*`,
    ``,
    `👤 ${userName}`,
    `📱 ${customerPhone}`,
    `${selectedService.emoji} ${selectedService.name}`,
    `💈 ${firstBarber}`,
    `📅 ${selectedDate.fullDisplay}  ⏰ ${selectedTime.display}`,
    totalCount > 1 ? `👥 Group of ${totalCount}` : null,
    `🎫 Code(s): ${allCodes}`,
    `💰 ${CUR()} ${totalPrice}`,
  ].filter(Boolean).join('\n');
  notifyCS(csLines).catch(() => {});

  return { text: replyText, ics, filename: `appointment-${firstBooking.code}.ics` };
}

// ── Multi-person booking confirmation ────────────────────────────────────────

async function onConfirmMulti(userId, session) {
  const lang = session.language;
  const { persons, selectedDate, selectedTime } = session;
  const dateStr       = selectedDate.date.toISOString().split('T')[0];
  const customerPhone = userId.replace(/@\S+$/, '');
  const allEmployees  = q.getActiveEmployees();
  const shopCalId     = q.getSetting('google_calendar_id') ||
    (process.env.GOOGLE_CALENDAR_ID !== 'primary' ? process.env.GOOGLE_CALENDAR_ID : null);

  // Multi-person bookings are always 2+ people → always one group.
  const groupId = newGroupId();

  const bookings = [];

  try {
    for (const assignment of selectedTime.assignments) {
      const person  = persons[assignment.personIdx];
      const service = person.service;
      const barber  = allEmployees.find(e => e.id === assignment.employeeId) || null;
      const slot    = { start: assignment.start, end: assignment.end, display: assignment.display };

      const dbResult = q.createAppointment({
        employee_id:      barber?.id || null,
        customer_name:    person.name,
        customer_phone:   customerPhone,
        booking_group:    groupId,
        service_id:       service.id,
        service_name:     service.name,
        service_emoji:    service.emoji,
        service_duration: service.duration,
        service_price:    service.price,
        start_time:       slot.start,
        end_time:         slot.end,
      });
      // Each person here has a specific barber fixed by the slot-finding
      // algorithm (parallel/sequential/batch) — unlike the single-service
      // flow there's no interchangeable pool to retry with, so a clash just
      // aborts this whole multi-person booking for a clean re-pick.
      if (dbResult.clash) throw new SlotTakenError();

      if (shopCalId && !dbResult.duplicate) {
        try {
          const r = await calendarCreate({
            calendarId:    shopCalId,
            service,
            startTime:     new Date(slot.start),
            endTime:       new Date(slot.end),
            customerName:  person.name,
            bookingCode:   dbResult.booking_code,
            employeeName:  barber?.name,
            employeeColor: barber?.color,
          });
          if (r.success) {
            q.updateAppointment(dbResult.lastInsertRowid, { google_event_id: r.eventId, google_event_link: r.eventLink });
          }
        } catch (err) {
          console.error('❌ Calendar sync exception (booking still saved):', err.message);
        }
      }

      bookings.push({ id: dbResult.lastInsertRowid, code: dbResult.booking_code, barber, slot, person, service });
    }
  } catch (err) {
    if (!(err instanceof SlotTakenError)) throw err;
    for (const b of bookings) if (b.id) q.cancelAppointment(b.id);
    const freeSlots = await q.getAvailableSlotsForBatchGroup(persons, allEmployees, selectedDate.date);
    sessions.updateSession(userId, { state: 'SELECTING_TIME', selectedTime: null, availableSlots: freeSlots, slotPage: 0 });
    return freeSlots.length
      ? `${t(lang, 'slot_taken_retry')}\n\n${buildTimeMenuMulti(lang, selectedDate, freeSlots, persons, 0)}`
      : `${t(lang, 'slot_taken_retry')}\n\n${t(lang, 'no_slots_multi', { date: selectedDate.fullDisplay })}`;
  }

  sessions.resetSession(userId);

  // Build confirmation message
  // Footer is auto-translated. Point customers to the self-service "manage" menu
  // option for cancel/reschedule; fall back to "contact us" if that option is off.
  const manageNum  = manageMenuNumber();
  const cancelLine = manageNum ? t(lang, 'booked_cancel_self', { option: manageNum }) : t(lang, 'booked_cancel_note');
  const footer = `${t(lang, 'booked_footer_default')}\n\n_${cancelLine}_`;

  const totalPrice = bookings.reduce((sum, b) => sum + (+b.service.price || 0), 0).toFixed(0);

  const lines = [
    t(lang, 'booked_header_multi', { count: persons.length }),
    ``,
    `📅 *${selectedDate.fullDisplay}*`,
    ``,
  ];

  for (const b of bookings) {
    lines.push(t(lang, 'booked_person_divider'));
    lines.push(`👤 *${b.person.name}*`);
    lines.push(`${b.service.emoji} ${b.service.name}  |  ⏰ ${b.slot.display}${selectedTime.isParallel ? '' : ''}`);
    if (b.barber) lines.push(`💈 ${b.barber.name}`);
    lines.push(`🎫 *${b.code}*  |  💰 ${CUR()} ${b.service.price}`);
    lines.push(``);
  }

  lines.push(t(lang, 'booked_code_note'));
  lines.push(t(lang, 'multi_total_price', { currency: CUR(), total: totalPrice }));

  const shopAddress = q.getSetting('shop_address') || '';
  const mapsLink    = q.getSetting('google_maps_link') || '';
  const addressLine = mapsLink ? `📍 ${shopAddress}\n${mapsLink}` : `📍 ${shopAddress}`;

  lines.push(``, addressLine, `📞 ${q.getSetting('shop_phone') || ''}`, ``, footer);
  lines.push(``, t(lang, 'payment_methods'));

  const replyText = lines.filter(l => l !== undefined && l !== null).join('\n');

  // Register/update customer profiles (use first person as "primary" for the phone)
  q.getOrCreateCustomer(persons[0].name, customerPhone);

  // Send QR check-in codes
  try {
    const { getClient }    = require('../whatsapp-client');
    const { MessageMedia } = require('whatsapp-web.js');
    const QRCode  = require('qrcode');
    const wClient = getClient();
    if (wClient) {
      for (const b of bookings) {
        const qrDataUrl = await QRCode.toDataURL(b.code, { width: 300, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } });
        const base64  = qrDataUrl.split(',')[1];
        const media   = new MessageMedia('image/png', base64, `checkin-${b.code}.png`);
        const caption = `🔲 *Check-in code: ${b.code}* (${b.person.name})`;
        await wClient.sendMessage(userId, media, { caption });
      }
    }
  } catch (e) {
    console.error('⚠️  QR send failed (booking still confirmed):', e.message);
  }

  // Notify CS
  const allCodes = bookings.map(b => b.code).join(', ');
  notifyCS([
    `📋 *New Group Booking Confirmed*`,
    ``,
    `📱 ${customerPhone}`,
    `📅 ${selectedDate.fullDisplay}`,
    `👥 Group of ${persons.length}`,
    ...bookings.map(b => `  • ${b.person.name}: ${b.service.emoji} ${b.service.name} @ ${b.slot.display} (${b.barber?.name || '—'}) 🎫 ${b.code}`),
    `💰 ${CUR()} ${totalPrice}`,
  ].join('\n')).catch(() => {});

  return replyText;
}

// ── Appointment management handlers ──────────────────────────────────────────

// ── Post-appointment survey ───────────────────────────────────────────────────

async function onRating(userId, text, session) {
  const lang   = session.language || 'nl';
  const rating = parseInt(text.trim(), 10);

  if (isNaN(rating) || rating < 1 || rating > 5) {
    return t(lang, 'survey_invalid');
  }

  // Save rating to the appointment
  const apptId = session.pendingRatingId;
  if (apptId) {
    q.saveRating(apptId, rating);

    // Notify management + CS numbers (best-effort — never block the thank-you)
    try {
      const appt   = q.getAppointmentById(apptId);
      const stars  = '⭐'.repeat(rating);
      const notify = [
        `📊 *New Rating Received*`,
        ``,
        `${stars} (${rating}/5)`,
        `👤 ${appt?.customer_name || 'Customer'}`,
        `✂️  ${appt?.service_name  || ''} — ${appt?.employee_name || ''}`,
        `📅 ${appt?.start_time ? new Date(appt.start_time).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }) : ''}`,
      ].join('\n');
      // Management phone
      const mgmtPhone = getManagementPhone().replace(/\D/g, '');
      if (mgmtPhone) {
        const { getClient } = require('../whatsapp-client');
        const wClient = getClient();
        if (wClient) await wClient.sendMessage(`${mgmtPhone}@c.us`, notify);
      }
      // CS / notification numbers
      notifyCS(notify).catch(() => {});
    } catch (e) { /* don't let notification failure break thank-you */ }
  }

  sessions.updateSession(userId, { state: 'MAIN_MENU', pendingRatingId: null });
  const stars = '⭐'.repeat(rating);
  return t(lang, 'survey_thanks', { stars, rating });
}

// ── Appointment management ────────────────────────────────────────────────────

/** Step 1: Customer enters their booking code. */
/** Customer picks one of their listed appointments (or types a code as a fallback). */
function onManageSelect(userId, text, session) {
  const lang = session.language;
  const list = session.manageList || [];

  if (isBack(text, lang)) {
    sessions.updateSession(userId, { state: 'MAIN_MENU' });
    return buildMainMenu(lang);
  }

  const idx = parseInt(text.trim(), 10) - 1;
  if (!isNaN(idx) && idx >= 0 && idx < list.length) {
    const appt = list[idx];
    sessions.updateSession(userId, { state: 'MANAGING_OPTIONS', managedAppointment: appt });
    return buildManageOptions(lang, appt);
  }

  // The extra "cancel all my appointments" option (shown only when 2+)
  if (list.length > 1 && idx === list.length) {
    sessions.updateSession(userId, { state: 'CONFIRMING_CANCEL', cancelList: list, managedAppointment: null });
    return buildCancelConfirmGroup(lang, list);
  }

  // Allow a booking code too (e.g. for an appointment booked under another number)
  const byCode = q.getAppointmentByCode(text.trim().toUpperCase());
  if (byCode && !['cancelled', 'completed', 'no-show'].includes(byCode.status)) {
    sessions.updateSession(userId, { state: 'MANAGING_OPTIONS', managedAppointment: byCode });
    return buildManageOptions(lang, byCode);
  }

  const maxOpt = list.length > 1 ? list.length + 1 : list.length;
  return `${t(lang, 'invalid_choice', { max: maxOpt })}\n\n${buildManageList(lang, list)}`;
}

function onManageBooking(userId, text, session) {
  const lang = session.language;
  if (isBack(text, lang)) {
    sessions.updateSession(userId, { state: 'MAIN_MENU' });
    return buildMainMenu(lang);
  }

  const code = text.trim().toUpperCase();
  const appt = q.getAppointmentByCode(code);

  if (!appt) return t(lang, 'manage_not_found');

  if (['cancelled', 'completed', 'no-show'].includes(appt.status)) {
    return t(lang, 'manage_invalid_status', { status: appt.status });
  }

  sessions.updateSession(userId, { state: 'MANAGING_OPTIONS', managedAppointment: appt });
  return buildManageOptions(lang, appt);
}

/** Step 2: Customer chooses reschedule (1) or cancel (2). */
function onManageOptions(userId, text, session) {
  const lang = session.language;
  const appt = session.managedAppointment;

  if (isBack(text, lang)) {
    sessions.updateSession(userId, { state: 'MANAGING_BOOKING' });
    return t(lang, 'manage_prompt');
  }

  switch (text.trim()) {
    case '1': {
      // Reschedule — use the same assigned employee
      const employee  = appt.employee_id ? q.getEmployee(appt.employee_id) : null;
      const employees = employee ? [employee] : q.getActiveEmployees();
      const dates     = q.getAvailableDates(employees, lang);

      if (dates.length === 0) {
        return `${t(lang, 'no_dates_available')}\n\n${buildManageOptions(lang, appt)}`;
      }

      const service = {
        id: appt.service_id, name: appt.service_name,
        emoji: appt.service_emoji || '', duration: appt.service_duration, price: appt.service_price,
      };
      sessions.updateSession(userId, {
        state: 'RESCHEDULING_DATE',
        rescheduleEmployee: employee,
        rescheduleService: service,
        rescheduleAvailableDates: dates,
        rescheduleDatePage: 0,
      });
      return buildDateMenu(lang, dates, service, 0);
    }
    case '2': {
      // Cancellation window check
      if (q.getSetting('cancel_window_enabled') === '1') {
        const windowMins = parseInt(q.getSetting('cancel_window_minutes') || '120', 10);
        const apptTime   = new Date(appt.start_time).getTime();
        const minsLeft   = (apptTime - Date.now()) / 60000;
        if (minsLeft >= 0 && minsLeft < windowMins) {
          const hrs = Math.floor(windowMins / 60);
          const min = windowMins % 60;
          const windowStr = hrs > 0
            ? (min > 0 ? `${hrs}h ${min}m` : `${hrs} hour${hrs > 1 ? 's' : ''}`)
            : `${min} minutes`;
          const shopPhone = q.getSetting('shop_phone') || '';
          return `❌ *Cancellations are no longer accepted* within ${windowStr} of your appointment.\n\nTo cancel, please contact us directly${shopPhone ? ` at ${shopPhone}` : ''}.\n\n${buildMainMenu(lang)}`;
        }
      }
      // Group booking? Offer "only this one" vs "all" first.
      // Primary: explicit booking_group (new bookings). Fallback: same phone +
      // same day (covers bookings made before booking_group existed).
      let group = q.getActiveGroupAppointments(appt.booking_group);
      if (group.length <= 1) group = q.getActiveSiblingAppointments(appt);
      if (group.length > 1) {
        sessions.updateSession(userId, { state: 'CONFIRMING_CANCEL_SCOPE', cancelGroup: group });
        return buildCancelScope(lang, appt, group.length);
      }

      sessions.updateSession(userId, { state: 'CONFIRMING_CANCEL', cancelList: [appt] });
      return buildCancelConfirm(lang, appt);
    }
    default:
      return `${t(lang, 'invalid_choice', { max: 2 })}\n\n${buildManageOptions(lang, appt)}`;
  }
}

/** Group cancel: customer chooses to cancel only this one (1) or the whole group (2). */
function onConfirmCancelScope(userId, text, session) {
  const lang  = session.language;
  const appt  = session.managedAppointment;
  const group = session.cancelGroup || [];

  if (isBack(text, lang)) {
    sessions.updateSession(userId, { state: 'MANAGING_OPTIONS' });
    return buildManageOptions(lang, appt);
  }

  switch (text.trim()) {
    case '1':
      sessions.updateSession(userId, { state: 'CONFIRMING_CANCEL', cancelList: [appt] });
      return buildCancelConfirm(lang, appt);
    case '2':
      sessions.updateSession(userId, { state: 'CONFIRMING_CANCEL', cancelList: group });
      return buildCancelConfirmGroup(lang, group);
    default:
      return `${t(lang, 'invalid_choice', { max: 2 })}\n\n${buildCancelScope(lang, appt, group.length)}`;
  }
}

/** Cancel one appointment in the DB + remove its shop-calendar event (best-effort). */
async function cancelOne(appt, shopCalId) {
  q.cancelAppointment(appt.id);
  try {
    if (shopCalId && appt.google_event_id) {
      const r = await calendarCancel({ calendarId: shopCalId, eventId: appt.google_event_id });
      if (r.success) console.log(`🗑️  Shop calendar event removed for booking ${appt.booking_code}`);
      else           console.error(`⚠️  Shop calendar cancel failed: ${r.error}`);
    }
  } catch (err) {
    console.error('⚠️  Calendar cancel exception (appointment still cancelled):', err.message);
  }
}

/** Cancel confirmation — handles a single appointment or a whole group. */
async function onConfirmCancel(userId, text, session) {
  const lang    = session.language;
  const list    = (session.cancelList && session.cancelList.length)
    ? session.cancelList
    : [session.managedAppointment];
  const isGroup = list.length > 1;

  if (isNo(text, lang) || isBack(text, lang)) {
    if (session.managedAppointment) {
      sessions.updateSession(userId, { state: 'MANAGING_OPTIONS' });
      return buildManageOptions(lang, session.managedAppointment);
    }
    sessions.updateSession(userId, { state: 'MAIN_MENU' });
    return buildMainMenu(lang);
  }
  if (!isYes(text, lang)) {
    return isGroup ? buildCancelConfirmGroup(lang, list) : buildCancelConfirm(lang, list[0]);
  }

  const shopCalId = q.getSetting('google_calendar_id') ||
    (process.env.GOOGLE_CALENDAR_ID !== 'primary' ? process.env.GOOGLE_CALENDAR_ID : null);

  for (const appt of list) {
    await cancelOne(appt, shopCalId);
  }

  // Notify CS — one combined message covering every cancelled code
  const cancelPhone = userId.replace(/@\S+$/, '');
  const first       = list[0];
  notifyCS([
    isGroup ? `❌ *Group Booking Cancelled by Customer (${list.length})*` : `❌ *Booking Cancelled by Customer*`,
    ``,
    `👤 ${first.customer_name}`,
    `📱 ${cancelPhone}`,
    isGroup ? null : `${first.service_emoji || ''} ${first.service_name}`,
    `📅 ${new Date(first.start_time).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}`,
    `🎫 Code${isGroup ? 's' : ''}: ${list.map(a => a.booking_code).join(', ')}`,
  ].filter(l => l !== null).join('\n')).catch(() => {});

  sessions.resetSession(userId);
  return isGroup ? t(lang, 'manage_cancelled_group', { count: list.length }) : t(lang, 'manage_cancelled');
}

/** Reschedule — pick new date. */
async function onRescheduleDate(userId, text, session) {
  const lang    = session.language;
  const dates   = session.rescheduleAvailableDates;
  const service = session.rescheduleService;
  const page    = session.rescheduleDatePage || 0;

  if (isBack(text, lang)) {
    sessions.updateSession(userId, { state: 'MANAGING_OPTIONS' });
    return buildManageOptions(lang, session.managedAppointment);
  }

  // "more" — next page of dates
  if (/^(more|meer|más|plus|next|volgende|suivant)$/i.test(text.trim())) {
    const nextPage = page + 1;
    if (nextPage * PAGE_SIZE >= dates.length) {
      return buildDateMenu(lang, dates, service, page);
    }
    sessions.updateSession(userId, { rescheduleDatePage: nextPage });
    return buildDateMenu(lang, dates, service, nextPage);
  }

  const localIdx  = parseInt(text, 10) - 1;
  const actualIdx = page * PAGE_SIZE + localIdx;
  const pageCount = Math.min(PAGE_SIZE, dates.length - page * PAGE_SIZE);

  if (isNaN(localIdx) || localIdx < 0 || localIdx >= pageCount) {
    return `${t(lang, 'invalid_choice', { max: pageCount })}\n\n${buildDateMenu(lang, dates, service, page)}`;
  }

  const selectedDate = dates[actualIdx];
  const employee     = session.rescheduleEmployee;

  // Exclude the current appointment so its own time slot shows as free
  const slots = employee
    ? await q.getAvailableSlotsForEmployee(employee, selectedDate.date, service.duration, { excludeId: session.managedAppointment.id })
    : await q.getAvailableSlotsForAny(q.getActiveEmployees(), selectedDate.date, service.duration);

  if (slots.length === 0) {
    return `${t(lang, 'no_slots_date', { date: selectedDate.fullDisplay })}\n\n${buildDateMenu(lang, dates, service, page)}`;
  }

  sessions.updateSession(userId, { state: 'RESCHEDULING_TIME', rescheduleDate: selectedDate, rescheduleSlots: slots, rescheduleSlotPage: 0 });
  return buildTimeMenu(lang, selectedDate, slots, service, 0);
}

/** Reschedule — pick new time. */
function onRescheduleTime(userId, text, session) {
  const lang    = session.language;
  const slots   = session.rescheduleSlots;
  const service = session.rescheduleService;
  const page    = session.rescheduleSlotPage || 0;

  if (isBack(text, lang)) {
    sessions.updateSession(userId, { state: 'RESCHEDULING_DATE', rescheduleSlotPage: 0 });
    return buildDateMenu(lang, session.rescheduleAvailableDates, service, session.rescheduleDatePage || 0);
  }

  // "more" — next page
  if (/^(more|meer|más|plus|next|volgende|suivant)$/i.test(text.trim())) {
    const nextPage = page + 1;
    if (nextPage * PAGE_SIZE >= slots.length) {
      return buildTimeMenu(lang, session.rescheduleDate, slots, service, page);
    }
    sessions.updateSession(userId, { rescheduleSlotPage: nextPage });
    return buildTimeMenu(lang, session.rescheduleDate, slots, service, nextPage);
  }

  const localIdx  = parseInt(text, 10) - 1;
  const actualIdx = page * PAGE_SIZE + localIdx;
  const pageCount = Math.min(PAGE_SIZE, slots.length - page * PAGE_SIZE);

  if (isNaN(localIdx) || localIdx < 0 || localIdx >= pageCount) {
    return `${t(lang, 'invalid_choice', { max: pageCount })}\n\n${buildTimeMenu(lang, session.rescheduleDate, slots, service, page)}`;
  }

  sessions.updateSession(userId, { state: 'CONFIRMING_RESCHEDULE', rescheduleTime: slots[actualIdx], rescheduleSlotPage: 0 });
  return buildRescheduleConfirm(lang, session, slots[actualIdx]);
}

/** Reschedule — confirm. */
async function onConfirmReschedule(userId, text, session) {
  const lang = session.language;

  if (isNo(text, lang)) {
    sessions.updateSession(userId, { state: 'MANAGING_OPTIONS' });
    return buildManageOptions(lang, session.managedAppointment);
  }
  if (isBack(text, lang)) {
    sessions.updateSession(userId, { state: 'RESCHEDULING_TIME' });
    return buildTimeMenu(lang, session.rescheduleDate, session.rescheduleSlots, session.rescheduleService, session.rescheduleSlotPage || 0);
  }
  if (!isYes(text, lang)) return buildRescheduleConfirm(lang, session, session.rescheduleTime);

  const appt     = session.managedAppointment;
  const newStart = session.rescheduleTime.start;
  const newEnd   = session.rescheduleTime.end;
  const service  = session.rescheduleService;
  const employee = session.rescheduleEmployee;

  // Update DB
  q.rescheduleAppointment(appt.id, newStart, newEnd);

  // Update Google Calendar event (best-effort)
  try {
    const shopCalId = q.getSetting('google_calendar_id') ||
      (process.env.GOOGLE_CALENDAR_ID !== 'primary' ? process.env.GOOGLE_CALENDAR_ID : null);
    if (shopCalId && appt.google_event_id) {
      const r = await calendarUpdate({
        calendarId:    shopCalId,
        eventId:       appt.google_event_id,
        startTime:     new Date(newStart),
        endTime:       new Date(newEnd),
        service,
        customerName:  appt.customer_name,
        bookingCode:   appt.booking_code,
        employeeName:  employee?.name,
        employeeColor: employee?.color,
      });
      if (r.success) console.log(`✅ Shop calendar event rescheduled: ${r.eventLink}`);
      else           console.error(`⚠️  Shop calendar reschedule failed: ${r.error}`);
    }
  } catch (err) {
    console.error('⚠️  Calendar reschedule exception (appointment still rescheduled):', err.message);
  }

  sessions.resetSession(userId);

  const replyText = [
    t(lang, 'manage_rescheduled'), ``,
    `👤 *${appt.customer_name}*`,
    employee ? t(lang, 'booked_barber', { barber: employee.name }) : '',
    `${service.emoji} ${t(lang, 'confirm_service')}: *${service.name}*`,
    `${t(lang, 'confirm_date')}: *${session.rescheduleDate.fullDisplay}*`,
    `${t(lang, 'confirm_time')}: *${session.rescheduleTime.display}*`,
    ...(q.getSetting('ics_enabled') !== '0' ? [``, t(lang, 'calendar_invite_note')] : []),
  ].filter(l => l !== '').join('\n');

  const ics = generateIcs({
    bookingCode:     appt.booking_code,
    customerName:    appt.customer_name,
    serviceName:     service.name,
    serviceEmoji:    service.emoji,
    serviceDuration: service.duration,
    startTime:       new Date(newStart),
    endTime:         new Date(newEnd),
    barberName:      employee?.name,
    shopName:        q.getSetting('shop_name')    || "Jayden's Barbershop",
    shopAddress:     q.getSetting('shop_address') || '',
    shopPhone:       q.getSetting('shop_phone')   || '',
  });

  return { text: replyText, ics, filename: `reschedule-${appt.booking_code}.ics` };
}

// ── Message builders ──────────────────────────────────────────────────────────

// ── Gallery ───────────────────────────────────────────────────────────────────

// Post the entire photo gallery — every uploaded picture, no category picker.
async function sendGallery(userId, lang) {
  const path   = require('path');
  const fs     = require('fs');
  const photos = q.getPhotos()
    .filter(p => fs.existsSync(path.join(process.cwd(), 'data', 'uploads', p.filename)));

  if (photos.length === 0) {
    sessions.updateSession(userId, { state: 'MAIN_MENU' });
    return `${t(lang, 'gallery_no_tags')}\n\n${buildMainMenu(lang)}`;
  }

  try {
    const { getClient }    = require('../whatsapp-client');
    const { MessageMedia } = require('whatsapp-web.js');
    const wClient = getClient();
    if (wClient) {
      await wClient.sendMessage(userId, t(lang, 'gallery_header'));
      // Send every photo. The last one carries the "return to menu" hint so it
      // stays the final message in the chat.
      for (let i = 0; i < photos.length; i++) {
        const photo    = photos[i];
        const isLast   = i === photos.length - 1;
        const filepath = path.join(process.cwd(), 'data', 'uploads', photo.filename);
        const ext      = photo.filename.split('.').pop().toLowerCase();
        const mime     = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
        const b64      = fs.readFileSync(filepath).toString('base64');
        const media    = new MessageMedia(mime, b64, photo.filename);
        let caption    = photo.caption || '';
        if (isLast) caption += `${caption ? '\n\n' : ''}${t(lang, 'media_return_hint')}`;
        await wClient.sendMessage(userId, media, { caption: caption || undefined });
      }
      // Park the customer: any next message just re-shows the menu.
      sessions.updateSession(userId, { state: 'AWAITING_MENU_RETURN' });
      return null;
    }
  } catch (e) {
    console.error('⚠️  Gallery send error:', e.message);
  }

  // No client or nothing sent — fall back to showing the menu.
  sessions.updateSession(userId, { state: 'MAIN_MENU' });
  return buildMainMenu(lang);
}

const TRAINING_MIME_TYPES = {
  mov:  'video/quicktime',
  mp4:  'video/mp4',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  webp: 'image/webp',
};

/**
 * Send training video/picture + caption to the customer.
 * Returns a text fallback string if no video is configured.
 */
async function onTraining(userId, lang) {
  const videos = q.getTrainingVideos();

  if (videos.length === 0) {
    return `${t(lang, 'training_unavailable')}\n\n${buildMainMenu(lang)}`;
  }

  try {
    const fs               = require('fs');
    const path             = require('path');
    const { getClient }    = require('../whatsapp-client');
    const { MessageMedia } = require('whatsapp-web.js');
    const wClient          = getClient();

    if (wClient) {
      // Only videos whose files actually exist — so the return hint lands on
      // the genuinely last message in the chat.
      const existing = videos.filter(v =>
        fs.existsSync(path.join(process.cwd(), 'data', 'uploads', v.filename)));
      if (existing.length === 0) {
        return `${t(lang, 'training_unavailable')}\n\n${buildMainMenu(lang)}`;
      }
      for (let i = 0; i < existing.length; i++) {
        const video    = existing[i];
        const isLast   = i === existing.length - 1;
        const filepath = path.join(process.cwd(), 'data', 'uploads', video.filename);
        const ext      = video.filename.split('.').pop().toLowerCase();
        const mime     = TRAINING_MIME_TYPES[ext] || 'video/mp4';
        const b64      = fs.readFileSync(filepath).toString('base64');
        const media    = new MessageMedia(mime, b64, video.filename);
        const caption  = isLast
          ? `${video.caption ? video.caption + '\n\n' : ''}${t(lang, 'media_return_hint')}`
          : (video.caption || undefined);
        await wClient.sendMessage(userId, media, { caption });
      }
      // Park the customer: any next message just re-shows the menu.
      sessions.updateSession(userId, { state: 'AWAITING_MENU_RETURN' });
      return null;
    }
  } catch (e) {
    console.error('⚠️  Training send error:', e.message);
  }

  return `${t(lang, 'training_unavailable')}\n\n${buildMainMenu(lang)}`;
}

/**
 * Build the main menu message.
 * @param {string}  lang         - Language code
 * @param {string}  [customHeader] - Override the standard welcome header (e.g. for new customers)
 */
const MENU_ITEM_LABEL = {
  booking:  (lang) => t(lang, 'menu_book'),
  hours:    (lang) => t(lang, 'menu_hours'),
  location: (lang) => t(lang, 'menu_location'),
  prices:   (lang) => t(lang, 'menu_prices'),
  contact:  (lang) => t(lang, 'menu_contact'),
  gallery:  (lang) => t(lang, 'menu_gallery'),
  language: (lang) => `🌐 ${t(lang, 'menu_language')}`,
  manage:   (lang) => `📋 ${t(lang, 'menu_manage')}`,
  training: (lang) => t(lang, 'menu_training'),
  feedback: (lang) => t(lang, 'menu_feedback'),
  privacy:  (lang) => t(lang, 'menu_privacy'),
};

const MENU_ITEM_EMOJI = {
  booking:  '📅',
  hours:    '🕐',
  location: '📍',
  prices:   '💰',
  contact:  '📞',
  gallery:  '📸',
  language: '🌐',
  manage:   '📋',
  training: '🎓',
  feedback: '💬',
  privacy:  '🔒',
};

function getMenuItems() {
  try {
    const raw = q.getSetting('menu_order');
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  // Fallback to hardcoded defaults
  return [
    { action: 'booking',  enabled: true  },
    { action: 'hours',    enabled: true  },
    { action: 'location', enabled: true  },
    { action: 'prices',   enabled: true  },
    { action: 'contact',  enabled: true  },
    { action: 'gallery',  enabled: true  },
    { action: 'language', enabled: true  },
    { action: 'manage',   enabled: true  },
    { action: 'training', enabled: false },
    { action: 'feedback', enabled: true  },
    { action: 'privacy',  enabled: true  },
  ];
}

// Live menu number of the "manage" option (cancel/reschedule self-service),
// or null if that option is disabled. Stays correct if the menu is reordered.
function manageMenuNumber() {
  const items = getMenuItems().filter(m => m.enabled);
  const idx   = items.findIndex(m => m.action === 'manage');
  return idx >= 0 ? idx + 1 : null;
}

function buildMainMenu(lang, customHeader = null) {
  const shop   = q.getSetting('shop_name') || "Jayden's Barbershop";
  const defaultWelcome = lang === 'nl'
    ? (q.getBotMessage('welcome_header') || t(lang, 'welcome'))
    : t(lang, 'welcome');
  const header = customHeader || defaultWelcome.replace('{shop_name}', shop);
  const activeItems = getMenuItems().filter(m => m.enabled);
  const lines = activeItems.map((m, i) => {
    const customText = m.labels?.[lang] || m.labels?.['en'];
    const label = customText
      ? `${MENU_ITEM_EMOJI[m.action] || ''} ${customText}`.trim()
      : (MENU_ITEM_LABEL[m.action] || (() => m.action))(lang);
    return `${num(i)} ${label}`;
  });
  return [header, '', ...lines].join('\n');
}

// Read-only price list for the "Service Prices" menu option. Shows every active
// service (toggling a service off in the dashboard hides it here automatically).
function buildPriceList(lang) {
  const services = q.getActiveServices();
  if (!services.length) {
    return `${t(lang, 'services_header')}\n\n${t(lang, 'back_menu')}`;
  }
  const list = services.map(s =>
    `${s.emoji ? `${s.emoji} ` : ''}*${s.name}* — 💰 ${CUR()} ${s.price}${s.description ? `\n   _${s.description}_` : ''}`
  ).join('\n\n');
  return `${t(lang, 'services_header')}\n\n${list}\n\n${t(lang, 'back_menu')}`;
}

function buildServiceMenu(lang, isBooking, page = 0) {
  const services    = q.getActiveServices();
  const start       = page * PAGE_SIZE;
  const pageServices = services.slice(start, start + PAGE_SIZE);
  const hasMore     = services.length > start + PAGE_SIZE;
  const hdr         = isBooking ? t(lang, 'book_header') : t(lang, 'services_header');
  const list        = pageServices.map((s, i) =>
    `${num(i)} ${s.emoji} *${s.name}*\n   💰 ${CUR()} ${s.price}\n   ${s.description}`
  ).join('\n\n');
  const moreHint    = hasMore ? `\n\n➡️ _${t(lang, 'more_services')}_` : '';
  return `${hdr}\n\n${list}${moreHint}\n\n_${t(lang, isBooking ? 'reply_or_back' : 'reply_number')}_`;
}

function buildServiceList(lang) {
  const services = q.getActiveServices();
  const list = services.map((s, i) =>
    `${num(i)} ${s.emoji} *${s.name}* — ${CUR()} ${s.price}`
  ).join('\n\n');
  return `${t(lang, 'services_header')}\n\n${list}\n\n${t(lang, 'book_prompt')}\n${t(lang, 'back_menu')}`;
}

function buildGroupSizeMenu(lang, service, maxBarbers) {
  const maxAllowed = maxGroupSize(maxBarbers);
  const lines = [];
  for (let i = 1; i <= maxAllowed; i++) {
    let label = i === 1
      ? `${t(lang, 'group_just_me')}`
      : `${i} ${t(lang, 'group_people')}`;
    lines.push(`${num(i - 1)} ${label}`);
  }
  const serviceLine = service ? `\n_${t(lang, 'service_label')}: ${service.emoji} ${service.name}_` : '';
  return `${t(lang, 'group_size_prompt')}${serviceLine}\n\n${lines.join('\n')}\n\n_${t(lang, 'reply_or_back')}_`;
}

/**
 * Service selection menu for a specific person in a multi-person booking.
 */
function buildCollectPersonServiceMenu(lang, personName, personNum, total, page = 0) {
  const services    = q.getActiveServices();
  const start       = page * PAGE_SIZE;
  const pageServices = services.slice(start, start + PAGE_SIZE);
  const hasMore     = services.length > start + PAGE_SIZE;
  const header      = t(lang, 'collect_person_service', { n: personNum, name: personName, total });
  const list        = pageServices.map((s, i) =>
    `${num(i)} ${s.emoji} *${s.name}*\n   💰 ${CUR()} ${s.price}${s.description ? `\n   ${s.description}` : ''}`
  ).join('\n\n');
  const moreHint    = hasMore ? `\n\n➡️ _${t(lang, 'more_services')}_` : '';
  return `${header}\n\n${list}${moreHint}\n\n_${t(lang, 'reply_or_back')}_`;
}

/**
 * Time selection menu for multi-person bookings.
 * Shows each time slot and briefly describes who's parallel / sequential.
 */
function buildTimeMenuMulti(lang, date, slots, persons, page = 0) {
  const start     = page * PAGE_SIZE;
  const pageSlots = slots.slice(start, start + PAGE_SIZE);
  const hasMore   = slots.length > start + PAGE_SIZE;

  const list = pageSlots.map((s, i) => `${num(i)} ${s.display}`).join('\n');

  const moreHint = hasMore ? `\n\n➡️ _${t(lang, 'more_times')}_` : '';
  return `${t(lang, 'select_time')}\n_${date.fullDisplay}_\n\n${list}${moreHint}\n\n_${t(lang, 'reply_or_back')}_`;
}

/**
 * Confirmation summary for multi-person booking.
 */
function buildConfirmationSummaryMulti(lang, persons, date, slot) {
  const allEmployees = q.getActiveEmployees();
  const lines = [`📅 *${date.fullDisplay}*`, ``];

  const totalPrice = persons.reduce((sum, p) => sum + (+p.service?.price || 0), 0).toFixed(0);

  for (let i = 0; i < persons.length; i++) {
    const person     = persons[i];
    const assignment = slot.assignments?.find(a => a.personIdx === i);
    const timeDisplay = assignment?.display || slot.display;
    const barber     = allEmployees.find(e => e.id === assignment?.employeeId);
    lines.push(`👤 *${person.name}*`);
    lines.push(`${person.service.emoji} ${person.service.name}  |  ⏰ ${timeDisplay}`);
    if (barber) lines.push(`💈 ${barber.name}`);
    lines.push(`💰 ${CUR()} ${person.service.price}`);
    if (i < persons.length - 1) lines.push(``);
  }

  lines.push(``);
  lines.push(t(lang, 'multi_total_price', { currency: CUR(), total: totalPrice }));
  return lines.join('\n');
}

function buildEmployeeMenu(lang, employees, service, allowAny) {
  const prompt = q.getBotMessage('select_employee_prompt') || t(lang, 'choose_barber');
  const lines  = [];
  if (allowAny) lines.push(`${num(0)} ${t(lang, 'any_barber')}`);
  employees.forEach((e, i) => lines.push(`${num(allowAny ? i + 1 : i)} ${e.name}`));
  return `${prompt}\n_${t(lang, 'service_label')}: ${service.emoji} ${service.name}_\n\n${lines.join('\n')}\n\n_${t(lang, 'reply_or_back')}_`;
}

function buildDateMenu(lang, dates, service, page = 0) {
  const start     = page * PAGE_SIZE;
  const pageDates = dates.slice(start, start + PAGE_SIZE);
  const hasMore   = dates.length > start + PAGE_SIZE;
  const list      = pageDates.map((d, i) => `${num(i)} ${d.fullDisplay}`).join('\n');
  const moreHint  = hasMore ? `\n\n➡️ _${t(lang, 'more_dates')}_` : '';
  const svcLine   = service ? `\n_${t(lang, 'service_label')}: ${service.emoji} ${service.name}_` : '';
  return `${t(lang, 'select_date')}${svcLine}\n\n${list}${moreHint}\n\n_${t(lang, 'reply_or_back')}_`;
}

function buildTimeMenu(lang, date, slots, service, page = 0) {
  const start      = page * PAGE_SIZE;
  const pageSlots  = slots.slice(start, start + PAGE_SIZE);
  const hasMore    = slots.length > start + PAGE_SIZE;

  const list = pageSlots.map((s, i) => {
    let line = `${num(i)} ${s.display}`;
    if (s.overflowCount > 0) {
      const extra = s.overflowSlot
        ? ` _(+${s.overflowCount} ${t(lang, 'group_people_lower')} ${t(lang, 'group_follow_up')}: ${s.overflowSlot.display})_`
        : ` _(+${s.overflowCount} ${t(lang, 'group_follow_up')} TBD)_`;
      line += extra;
    }
    return line;
  }).join('\n');

  // Group note (shown when multiple barbers serve simultaneously)
  const firstSlot = pageSlots[0] || slots[0];
  const groupNote = (firstSlot?.mainCount > 1)
    ? `_${t(lang, 'group_slots_note', { count: firstSlot.mainCount })}_\n\n`
    : '';

  // Pagination footer
  const moreHint  = hasMore ? `\n\n➡️ _${t(lang, 'more_times')}_` : '';

  return `${t(lang, 'select_time')}\n_${date.fullDisplay} — ${service.emoji} ${service.name}_\n\n${groupNote}${list}${moreHint}\n\n_${t(lang, 'reply_or_back')}_`;
}

function buildConfirmationSummary(lang, name, service, date, time, groupSize = 1) {
  const mainCount     = time.mainCount     || 1;
  const overflowCount = time.overflowCount || 0;
  const totalCount    = mainCount + overflowCount;
  const totalPrice    = (+service.price * totalCount).toFixed(0);

  const lines = [];
  lines.push(`${t(lang, 'confirm_name')}: *${name}*`);

  if (totalCount > 1) {
    lines.push(`${t(lang, 'confirm_group')}: *${totalCount} ${t(lang, 'group_people_lower')}*`);
    lines.push(`${service.emoji} ${t(lang, 'confirm_service')}: *${service.name}*`);
    lines.push(`${t(lang, 'confirm_date')}: *${date.fullDisplay}*`);
    lines.push(`⏰ *${time.display}* — ${mainCount} ${t(lang, 'group_people_lower')}`);
    if (overflowCount > 0 && time.overflowSlot) {
      lines.push(`⏰ *${time.overflowSlot.display}* — ${overflowCount} ${t(lang, 'group_people_lower')}`);
    } else if (overflowCount > 0) {
      lines.push(`⏰ +${overflowCount} ${t(lang, 'group_follow_up')}`);
    }
    lines.push(`${t(lang, 'confirm_price')}: *${CUR()} ${totalPrice} (${totalCount}×${service.price})*`);
  } else {
    lines.push(`${service.emoji} ${t(lang, 'confirm_service')}  : *${service.name}*`);
    lines.push(`${t(lang, 'confirm_date')}    : *${date.fullDisplay}*`);
    lines.push(`${t(lang, 'confirm_time')}    : *${time.display}*`);
    lines.push(`${t(lang, 'confirm_price')}   : *${CUR()} ${service.price}*`);
  }

  return lines.join('\n');
}

function buildHours(lang) {
  const days = t(lang, 'days');
  const rows  = q.getWeeklyHours(null);
  const lines = rows.map(r =>
    `${days[r.day_of_week]}: ${r.is_open ? `*${fmt24(r.open_time)} – ${fmt24(r.close_time)}*` : `*${t(lang, 'hours_closed')}*`}`
  );
  return `${t(lang, 'hours_header')}\n\n${lines.join('\n')}\n\n${t(lang, 'hours_back')}`;
}

function buildPrivacy(lang) {
  // Shown in the customer's chosen language (falls back to Dutch).
  const text = PRIVACY_POLICY[lang] || PRIVACY_POLICY.nl;
  return `${text}\n\n${t(lang, 'back_menu')}`;
}

function buildLocation(lang) {
  const addr    = q.getSetting('shop_address') || '';
  const link    = q.getSetting('google_maps_link') || '';
  const mapLine = link ? `\n\n🗺️ *Bekijk op Google Maps:*\n${link}` : '';
  return `${t(lang, 'location_header')}\n\n${addr}${mapLine}\n\n${t(lang, 'back_menu')}`;
}

function buildContact(lang) {
  const phone     = q.getSetting('shop_phone');
  const landline  = q.getSetting('shop_landline');
  const email     = q.getSetting('shop_email');
  const instagram = q.getSetting('shop_instagram');
  const facebook  = q.getSetting('shop_facebook');
  const tiktok    = q.getSetting('shop_tiktok');

  const lines = [t(lang, 'contact_header'), ''];
  if (phone)     lines.push(`💬 WhatsApp: ${phone}`);
  if (landline)  lines.push(`📞 Telefoon: ${landline}`);
  if (email)     lines.push(`📧 ${t(lang, 'contact_email')}: ${email}`);
  if (instagram) lines.push(`📸 Instagram: ${instagram}`);
  if (facebook)  lines.push(`📘 Facebook: ${facebook}`);
  if (tiktok) {
    const tiktokHandle = tiktok.startsWith('@') ? tiktok.slice(1) : tiktok;
    lines.push(`🎵 TikTok: https://www.tiktok.com/@${tiktokHandle}`);
  }
  lines.push('', t(lang, 'back_menu'));
  return lines.join('\n');
}

function buildFeedbackMenu(lang) {
  return [
    t(lang, 'feedback_header'), '',
    t(lang, 'feedback_option_complaint'),
    t(lang, 'feedback_option_suggestion'),
    '', t(lang, 'back_menu'),
  ].join('\n');
}

function onFeedbackMenu(userId, text, session) {
  const lang    = session.language;
  const trimmed = text.trim();
  if (isBack(trimmed, lang)) {
    sessions.updateSession(userId, { state: 'MAIN_MENU' });
    return buildMainMenu(lang);
  }
  if (trimmed === '1') {
    const phone = q.getSetting('complaint_phone') || q.getSetting('management_phone') || q.getSetting('shop_phone') || '';
    sessions.updateSession(userId, { state: 'MAIN_MENU' });
    return t(lang, 'feedback_complaint_msg', { phone: phone || '—' });
  }
  if (trimmed === '2') {
    sessions.updateSession(userId, { state: 'FEEDBACK_SUGGESTION' });
    return t(lang, 'feedback_suggestion_prompt');
  }
  return `${t(lang, 'feedback_invalid')}\n\n${buildFeedbackMenu(lang)}`;
}

async function onFeedbackSuggestion(userId, text, session) {
  const lang    = session.language;
  const trimmed = text.trim();
  if (isBack(trimmed, lang)) {
    sessions.updateSession(userId, { state: 'FEEDBACK_MENU' });
    return buildFeedbackMenu(lang);
  }
  if (trimmed.length < 3) {
    return t(lang, 'feedback_suggestion_prompt');
  }

  // Forward suggestion to cs_phone_1 and cs_phone_2
  const customerPhone = userId.replace(/@\S+$/, '');
  const msg = `💡 *Nieuwe Suggestie / New Suggestion*\n\n📱 Van / From: +${customerPhone}\n\n"${trimmed}"`;
  notifyCS(msg).catch(() => {});

  sessions.updateSession(userId, { state: 'MAIN_MENU' });
  return t(lang, 'feedback_suggestion_thanks');
}

/** Numbered list of the customer's own upcoming appointments. */
function buildManageList(lang, appts) {
  const lines = [t(lang, 'manage_list_header'), ``];
  appts.forEach((a, i) => {
    const emp = a.employee_id ? q.getEmployee(a.employee_id) : null;
    lines.push(`${num(i)} ${a.service_emoji || ''} *${a.service_name}* — ${fmtApptDate(a.start_time, lang)} ${fmtApptTime(a.start_time, lang)}${emp ? ` · ${emp.name}` : ''}`);
  });
  // Extra option: cancel everything at once (only worth showing for 2+)
  if (appts.length > 1) lines.push(``, `${num(appts.length)} ${t(lang, 'cancel_all_mine')}`);
  lines.push(``, `_${t(lang, 'reply_or_back')}_`);
  return lines.join('\n');
}

/** Show appointment details + reschedule/cancel options. */
function buildManageOptions(lang, appt) {
  const emp     = appt.employee_id ? q.getEmployee(appt.employee_id) : null;
  const dateStr = appt.start_time ? fmtApptDate(appt.start_time, lang) : '—';
  const timeStr = appt.start_time ? fmtApptTime(appt.start_time, lang) : '—';
  return [
    t(lang, 'manage_header'), ``,
    `🎫 *${appt.booking_code}*`,
    `👤 ${appt.customer_name}`,
    emp ? `💈 ${emp.name}` : '',
    `${appt.service_emoji || ''} ${appt.service_name}`,
    `📅 ${dateStr}  ⏰ ${timeStr}`,
    ``,
    `${num(0)} ${t(lang, 'manage_option_1')}`,
    `${num(1)} ${t(lang, 'manage_option_2')}`,
    ``,
    `_${t(lang, 'reply_or_back')}_`,
  ].filter(l => l !== '').join('\n');
}

/** Cancel confirmation prompt. */
function buildCancelConfirm(lang, appt) {
  return [
    t(lang, 'manage_cancel_confirm'), ``,
    `🎫 *${appt.booking_code}*  ${appt.service_emoji || ''} ${appt.service_name}`,
    `📅 ${fmtApptDate(appt.start_time, lang)}  ⏰ ${fmtApptTime(appt.start_time, lang)}`,
  ].join('\n');
}

/** Group cancel — ask whether to cancel only this appointment or the whole group. */
function buildCancelScope(lang, appt, count) {
  return [
    t(lang, 'cancel_scope_prompt', { count }),
    ``,
    `🎫 *${appt.booking_code}*  ${appt.service_emoji || ''} ${appt.service_name}`,
    ``,
    `${num(0)} ${t(lang, 'cancel_scope_one')}`,
    `${num(1)} ${t(lang, 'cancel_scope_all', { count })}`,
    ``,
    `_${t(lang, 'reply_or_back')}_`,
  ].join('\n');
}

/** Group cancel — confirmation listing every appointment that will be cancelled. */
function buildCancelConfirmGroup(lang, list) {
  const lines = [t(lang, 'cancel_confirm_group', { count: list.length }), ``];
  for (const a of list) {
    lines.push(`🎫 *${a.booking_code}*  ${a.service_emoji || ''} ${a.service_name} — ${fmtApptDate(a.start_time, lang)} ${fmtApptTime(a.start_time, lang)}`);
  }
  return lines.join('\n');
}

/** Reschedule confirmation summary. */
function buildRescheduleConfirm(lang, session, time) {
  const appt     = session.managedAppointment;
  const employee = session.rescheduleEmployee;
  const service  = session.rescheduleService;
  return [
    t(lang, 'confirm_prompt'),
    `👤 *${appt.customer_name}*`,
    employee ? `${t(lang, 'confirm_barber')}: *${employee.name}*` : '',
    `${service.emoji} ${t(lang, 'confirm_service')}: *${service.name}*`,
    `${t(lang, 'confirm_date')}: *${session.rescheduleDate.fullDisplay}*`,
    `${t(lang, 'confirm_time')}: *${time.display}*`,
    ``,
    t(lang, 'manage_reschedule_confirm'),
  ].filter(l => l !== '').join('\n');
}

/** Format an ISO timestamp → localized short date ("wo 3 jun" / "Wed, Jun 3"). */
function fmtApptDate(iso, lang = 'en') {
  return q.localeLongDate(iso, lang);
}

/** Format an ISO timestamp → English 12-hour "3:00 PM", other languages 24-hour "15:00". */
function fmtApptTime(iso, lang = 'en') {
  const d = new Date(iso);
  const h = d.getHours(), m = d.getMinutes();
  if (lang === 'en') {
    const p  = h >= 12 ? 'PM' : 'AM';
    const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hr}:${String(m).padStart(2, '0')} ${p}`;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fmt24(ti) {
  if (!ti) return '';
  const [h, m] = ti.split(':').map(Number);
  const p  = h >= 12 ? 'PM' : 'AM';
  const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hr}:${String(m).padStart(2,'0')} ${p}`;
}

module.exports = { handleMessage };
