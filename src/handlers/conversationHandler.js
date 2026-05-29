/**
 * Conversation Handler — multi-language, multi-employee booking flow.
 *
 * States:
 *   IDLE → SELECTING_LANGUAGE → MAIN_MENU → SELECTING_SERVICE → SELECTING_GROUP_SIZE
 *   → SELECTING_DATE → SELECTING_TIME → ENTERING_NAME → CONFIRMING_BOOKING → IDLE
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
const { t, buildLanguageMenu, LANG_MAP }    = require('../i18n/translations');
const { generateIcs }                       = require('../utils/icsGenerator');

const NUM       = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
const num       = i => NUM[i] || `*${i + 1}.*`;
const PAGE_SIZE = 10; // max time slots shown per page
const CUR = () => q.getSetting('currency') || 'SRD';

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

// ── Entry point ───────────────────────────────────────────────────────────────

async function handleMessage(message) {
  const userId = message.from;
  const text   = (message.body || '').trim();

  // Human takeover — bot is completely silent for this chat
  if (chatPause.isChatPaused(userId)) return null;

  // Blocked customer — silently drop (or send a polite refusal)
  const customerPhone = userId.replace(/@\S+$/, '');
  if (q.isPhoneBlocked(customerPhone)) {
    const lang = sessions.getSession(userId).language || 'en';
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

  // Menu shortcut — preserves language
  if (isMenu(text)) {
    sessions.resetSession(userId);
    if (lang) {
      sessions.updateSession(userId, { state: 'MAIN_MENU', language: lang });
      return buildMainMenu(lang);
    }
    // No language yet — go to language selection
    sessions.updateSession(userId, { state: 'SELECTING_LANGUAGE' });
    return buildLanguageMenu();
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

  switch (session.state) {
    case 'IDLE':
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
    case 'SELECTING_DATE':
      return onDate(userId, text, session);
    case 'SELECTING_TIME':
      return onTime(userId, text, session);
    case 'ENTERING_NAME':
      return onName(userId, text, session);
    case 'CONFIRMING_BOOKING':
      return onConfirm(userId, text, session);
    case 'RATING_APPOINTMENT':
      return onRating(userId, text, session);
    case 'MANAGING_BOOKING':
      return onManageBooking(userId, text, session);
    case 'MANAGING_OPTIONS':
      return onManageOptions(userId, text, session);
    case 'CONFIRMING_CANCEL':
      return onConfirmCancel(userId, text, session);
    case 'RESCHEDULING_DATE':
      return onRescheduleDate(userId, text, session);
    case 'RESCHEDULING_TIME':
      return onRescheduleTime(userId, text, session);
    case 'CONFIRMING_RESCHEDULE':
      return onConfirmReschedule(userId, text, session);
    default:
      sessions.resetSession(userId);
      sessions.updateSession(userId, { state: 'SELECTING_LANGUAGE' });
      return buildLanguageMenu();
  }
}

// ── State handlers ────────────────────────────────────────────────────────────

function onSelectLanguage(userId, text, session, isMyContact = null) {
  const choice = text.trim();
  const lang   = LANG_MAP[choice];
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

  // New customers get a warm first-time welcome instead of the standard header
  if (isNew) {
    const shop    = q.getSetting('shop_name') || "Jayden's Barbershop";
    const welcome = (q.getBotMessage('new_customer_welcome') || t(lang, 'new_customer_welcome'))
      .replace('{shop_name}', shop);
    return buildMainMenu(lang, welcome);
  }

  return buildMainMenu(lang);
}

function onMainMenu(userId, text, session) {
  const lang = session.language;
  switch (text.trim()) {
    case '1':
    case '2':
      // Both "Book" and "Services & Prices" go to the same bookable list.
      sessions.updateSession(userId, { state: 'SELECTING_SERVICE', servicePage: 0 });
      return buildServiceMenu(lang, true, 0);
    case '3': return buildHours(lang);
    case '4': return buildLocation(lang);
    case '5': return buildContact(lang);
    case '6':
      sessions.resetSession(userId);
      sessions.updateSession(userId, { state: 'SELECTING_LANGUAGE' });
      return buildLanguageMenu();
    case '7':
      sessions.updateSession(userId, { state: 'MANAGING_BOOKING' });
      return t(lang, 'manage_prompt');
    default: {
      const trimmed = text.trim();
      // Non-numeric freeform text looks like a question/request — refer to management
      if (!/^\d+$/.test(trimmed) && trimmed.length > 0) {
        const phone = getManagementPhone();
        return `${t(lang, 'out_of_scope', { phone: phone || 'the barbershop' })}\n\n${buildMainMenu(lang)}`;
      }
      return `${t(lang, 'invalid_menu')}\n\n${buildMainMenu(lang)}`;
    }
  }
}

async function onService(userId, text, session) {
  const lang = session.language;
  const page = session.servicePage || 0;

  if (isBack(text, lang)) {
    sessions.updateSession(userId, { state: 'MAIN_MENU', servicePage: 0 });
    return `↩️ _${t(lang, 'back_to_main_menu')}_\n\n${buildMainMenu(lang)}`;
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

  // New customer logic — route to the designated barber if configured
  if (session.isNewCustomer) {
    const newCustEmpId = q.getSetting('new_customer_employee_id');
    if (newCustEmpId) {
      const dedicated = employees.filter(e => String(e.id) === String(newCustEmpId));
      // Only restrict if that barber actually offers this service; otherwise fall back to all
      if (dedicated.length > 0) employees = dedicated;
    }
  }

  // Ask how many people — barber selection skipped, fair auto-assign at confirmation
  sessions.updateSession(userId, {
    state: 'SELECTING_GROUP_SIZE',
    selectedService: service,
    employees,
  });
  return buildGroupSizeMenu(lang, service, employees.length);
}

async function onGroupSize(userId, text, session) {
  const lang = session.language;
  if (isBack(text, lang)) {
    sessions.updateSession(userId, { state: 'SELECTING_SERVICE' });
    return buildServiceMenu(lang, true, session.servicePage || 0);
  }

  const { employees, selectedService } = session;
  // Allow up to 2× the barber count (overflow), hard-capped at 6
  const maxAllowed = Math.min(employees.length * 2, 4);
  const n = parseInt(text, 10);

  if (isNaN(n) || n < 1 || n > maxAllowed) {
    return `${t(lang, 'group_invalid', { max: maxAllowed })}\n\n${buildGroupSizeMenu(lang, selectedService, employees.length)}`;
  }

  const groupSize = n;
  const dates = q.getAvailableDates(employees);
  sessions.updateSession(userId, {
    state: 'SELECTING_DATE',
    groupSize,
    isAnyEmployee: true,
    availableDates: dates,
    datePage: 0,
  });
  return buildDateMenu(lang, dates, selectedService, 0);
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

  const dates = q.getAvailableDates(employees);
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
    sessions.updateSession(userId, { state: 'SELECTING_GROUP_SIZE', datePage: 0 });
    return buildGroupSizeMenu(lang, session.selectedService, session.employees?.length || 1);
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
  const groupSize    = session.groupSize || 1;
  let freeSlots;

  if (groupSize > 1) {
    freeSlots = await q.getAvailableSlotsForGroup(employees, selectedDate.date, service.duration, groupSize);
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

function onTime(userId, text, session) {
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
      // Already on the last page — just re-show it
      return buildTimeMenu(lang, session.selectedDate, slots, session.selectedService, page);
    }
    sessions.updateSession(userId, { slotPage: nextPage });
    return buildTimeMenu(lang, session.selectedDate, slots, session.selectedService, nextPage);
  }

  // Slot selection — number is 1-based within the current page
  const localIdx  = parseInt(text, 10) - 1;
  const actualIdx = page * PAGE_SIZE + localIdx;
  const pageCount = Math.min(PAGE_SIZE, slots.length - page * PAGE_SIZE);

  if (isNaN(localIdx) || localIdx < 0 || localIdx >= pageCount) {
    return `${t(lang, 'invalid_choice', { max: pageCount })}\n\n${buildTimeMenu(lang, session.selectedDate, slots, session.selectedService, page)}`;
  }

  sessions.updateSession(userId, { state: 'ENTERING_NAME', selectedTime: slots[actualIdx], slotPage: 0 });
  return t(lang, 'enter_name');
}

function onName(userId, text, session) {
  const lang = session.language;
  if (text.length < 2) return t(lang, 'name_too_short');
  const name = text.trim();
  sessions.updateSession(userId, { state: 'CONFIRMING_BOOKING', userName: name });
  return buildConfirmationSummary(lang, name, session.selectedService, session.selectedDate, session.selectedTime, session.groupSize || 1);
}

async function onConfirm(userId, text, session) {
  const lang = session.language;

  if (isNo(text, lang)) {
    sessions.resetSession(userId);
    return t(lang, 'confirm_cancel');
  }
  if (!isYes(text, lang)) {
    return t(lang, 'confirm_invalid');
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

  // ── Helper: create one appointment + calendar event ───────────────────────
  async function bookOne(slot, barber) {
    const dbResult = q.createAppointment({
      employee_id:      barber?.id || null,
      customer_name:    userName,
      customer_phone:   customerPhone,
      service_id:       selectedService.id,
      service_name:     selectedService.name,
      service_emoji:    selectedService.emoji,
      service_duration: selectedService.duration,
      service_price:    selectedService.price,
      start_time:       slot.start,
      end_time:         slot.end,
    });
    if (shopCalId) {
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
    return { code: dbResult.booking_code, barber, slot };
  }

  // ── Pick barbers & book main group ────────────────────────────────────────
  const mainEmpPool = [...(selectedTime.availableEmployees || [])];
  const usedMain    = new Set();
  const mainBookings = [];

  for (let i = 0; i < mainCount; i++) {
    const pool  = mainEmpPool.filter(id => !usedMain.has(String(id)));
    const empId = q.pickLeastBusyEmployee(pool.length ? pool : mainEmpPool, dateStr);
    usedMain.add(String(empId));
    mainBookings.push(await bookOne(selectedTime, q.getEmployee(empId)));
  }

  // ── Pick barbers & book overflow group ────────────────────────────────────
  // Overflow barbers are NOT excluded from the main pool — they finished the
  // main appointment and are free again by the overflow start time.
  const overflowBookings = [];
  if (overflowCount > 0 && overflowSlot) {
    const ovPool  = [...(overflowSlot.availableEmployees || mainEmpPool)];
    const usedOv  = new Set();
    for (let i = 0; i < overflowCount; i++) {
      const pool  = ovPool.filter(id => !usedOv.has(String(id)));
      const empId = q.pickLeastBusyEmployee(pool.length ? pool : ovPool, dateStr);
      usedOv.add(String(empId));
      overflowBookings.push(await bookOne(overflowSlot, q.getEmployee(empId)));
    }
  }

  sessions.resetSession(userId);

  // ── Build reply message ───────────────────────────────────────────────────
  const totalCount   = mainCount + overflowCount;
  const footer       = (q.getBotMessage('confirmed_footer') || t(lang, 'booked_footer_default'))
    .replace('{shop_name}',  q.getSetting('shop_name')  || "Jayden's Barbershop")
    .replace('{shop_phone}', q.getSetting('shop_phone') || '');
  const calendarNote = t(lang, 'calendar_invite_note');
  const totalPrice   = (+selectedService.price * totalCount).toFixed(0);

  const lines = [
    totalCount > 1
      ? t(lang, 'booked_header_group', { count: totalCount })
      : t(lang, 'booked_header'),
    ``,
    `👤 *${userName}*`,
    `${selectedService.emoji} ${selectedService.name}  |  📅 ${selectedDate.fullDisplay}`,
    ``,
  ];

  if (totalCount === 1) {
    // Single appointment — same layout as before
    const b = mainBookings[0];
    lines.push(t(lang, 'booked_code', { code: b.code }));
    lines.push(t(lang, 'booked_code_note'));
    if (b.barber) lines.push(t(lang, 'booked_barber', { barber: b.barber.name }));
    lines.push(`${t(lang, 'confirm_time')}: *${selectedTime.display}*`);
    lines.push(`⏱️ ${t(lang, 'confirm_duration')}: *${selectedService.duration} min*`);
    lines.push(`💰 ${t(lang, 'confirm_price')}: *${CUR()} ${selectedService.price}*`);
  } else {
    // Group — show time slots then codes per person
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
    lines.push(`⏱️ ${t(lang, 'confirm_duration')}: *${selectedService.duration} min pp*`);
    lines.push(`💰 ${t(lang, 'confirm_price')}: *${CUR()} ${totalPrice} (${totalCount}×${selectedService.price})*`);
  }

  lines.push(
    ``,
    `📍 ${q.getSetting('shop_address') || ''}`,
    `📞 ${q.getSetting('shop_phone') || ''}`,
    ``,
    footer,
    ``,
    calendarNote,
  );

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
    `${selectedService.emoji} ${selectedService.name} (${selectedService.duration} min)`,
    `💈 ${firstBarber}`,
    `📅 ${selectedDate.fullDisplay}  ⏰ ${selectedTime.display}`,
    totalCount > 1 ? `👥 Group of ${totalCount}` : null,
    `🎫 Code(s): ${allCodes}`,
    `💰 ${CUR()} ${totalPrice}`,
  ].filter(Boolean).join('\n');
  notifyCS(csLines).catch(() => {});

  return { text: replyText, ics, filename: `appointment-${firstBooking.code}.ics` };
}

// ── Appointment management handlers ──────────────────────────────────────────

// ── Post-appointment survey ───────────────────────────────────────────────────

async function onRating(userId, text, session) {
  const lang   = session.language || 'en';
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
      const dates     = q.getAvailableDates(employees);

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
    case '2':
      sessions.updateSession(userId, { state: 'CONFIRMING_CANCEL' });
      return buildCancelConfirm(lang, appt);
    default:
      return `${t(lang, 'invalid_choice', { max: 2 })}\n\n${buildManageOptions(lang, appt)}`;
  }
}

/** Cancel confirmation. */
async function onConfirmCancel(userId, text, session) {
  const lang = session.language;
  const appt = session.managedAppointment;

  if (isNo(text, lang) || isBack(text, lang)) {
    sessions.updateSession(userId, { state: 'MANAGING_OPTIONS' });
    return buildManageOptions(lang, appt);
  }
  if (!isYes(text, lang)) return buildCancelConfirm(lang, appt);

  // Mark cancelled in DB
  q.cancelAppointment(appt.id);

  // Remove from Google Calendar (best-effort)
  try {
    const shopCalId = q.getSetting('google_calendar_id') ||
      (process.env.GOOGLE_CALENDAR_ID !== 'primary' ? process.env.GOOGLE_CALENDAR_ID : null);
    if (shopCalId && appt.google_event_id) {
      const r = await calendarCancel({ calendarId: shopCalId, eventId: appt.google_event_id });
      if (r.success) console.log(`🗑️  Shop calendar event removed for booking ${appt.booking_code}`);
      else           console.error(`⚠️  Shop calendar cancel failed: ${r.error}`);
    }
  } catch (err) {
    console.error('⚠️  Calendar cancel exception (appointment still cancelled):', err.message);
  }

  // Notify CS numbers about the cancellation
  const cancelPhone = userId.replace(/@\S+$/, '');
  notifyCS([
    `❌ *Booking Cancelled by Customer*`,
    ``,
    `👤 ${appt.customer_name}`,
    `📱 ${cancelPhone}`,
    `${appt.service_emoji || ''} ${appt.service_name}`,
    `💈 ${appt.employee_name || '—'}`,
    `📅 ${new Date(appt.start_time).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}  ⏰ ${new Date(appt.start_time).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' })}`,
    `🎫 Code: ${appt.booking_code}`,
  ].join('\n')).catch(() => {});

  sessions.resetSession(userId);
  return t(lang, 'manage_cancelled');
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
    `⏱️ ${t(lang, 'confirm_duration')}: *${service.duration} min*`,
    ``, t(lang, 'calendar_invite_note'),
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

/**
 * Build the main menu message.
 * @param {string}  lang         - Language code
 * @param {string}  [customHeader] - Override the standard welcome header (e.g. for new customers)
 */
function buildMainMenu(lang, customHeader = null) {
  const shop   = q.getSetting('shop_name') || "Jayden's Barbershop";
  const header = customHeader
    || (q.getBotMessage('welcome_header') || t(lang, 'welcome')).replace('{shop_name}', shop);
  return [
    header, ``,
    `${num(0)} ${t(lang, 'menu_book')}`,
    `${num(1)} ${t(lang, 'menu_services')}`,
    `${num(2)} ${t(lang, 'menu_hours')}`,
    `${num(3)} ${t(lang, 'menu_location')}`,
    `${num(4)} ${t(lang, 'menu_contact')}`,
    `${num(5)} 🌐 ${t(lang, 'menu_language')}`,
    `${num(6)} 📋 ${t(lang, 'menu_manage')}`,
    ``, t(lang, 'menu_reply'),
  ].join('\n');
}

function buildServiceMenu(lang, isBooking, page = 0) {
  const services    = q.getActiveServices();
  const start       = page * PAGE_SIZE;
  const pageServices = services.slice(start, start + PAGE_SIZE);
  const hasMore     = services.length > start + PAGE_SIZE;
  const hdr         = isBooking ? t(lang, 'book_header') : t(lang, 'services_header');
  const list        = pageServices.map((s, i) =>
    `${num(i)} ${s.emoji} *${s.name}*\n   ⏱️ ${s.duration} min  |  💰 ${CUR()} ${s.price}\n   _${s.description}_`
  ).join('\n\n');
  const moreHint    = hasMore ? `\n\n➡️ _Type *more* to see more services_` : '';
  return `${hdr}\n\n${list}${moreHint}\n\n_${t(lang, isBooking ? 'reply_or_back' : 'reply_number')}_`;
}

function buildServiceList(lang) {
  const services = q.getActiveServices();
  const list = services.map((s, i) =>
    `${num(i)} ${s.emoji} *${s.name}* — ${CUR()} ${s.price}\n   ⏱️ ${s.duration} min`
  ).join('\n\n');
  return `${t(lang, 'services_header')}\n\n${list}\n\n${t(lang, 'book_prompt')}\n${t(lang, 'back_menu')}`;
}

function buildGroupSizeMenu(lang, service, maxBarbers) {
  // Allow up to 2× barbers (overflow), hard cap at 4
  const maxAllowed = Math.min(maxBarbers * 2, 4);
  const lines = [];
  for (let i = 1; i <= maxAllowed; i++) {
    let label = i === 1
      ? `${t(lang, 'group_just_me')}`
      : `${i} ${t(lang, 'group_people')}`;
    if (i > maxBarbers) {
      const first = maxBarbers;
      const rest  = i - maxBarbers;
      label += ` — _${t(lang, 'group_overflow_note', { first, rest })}_`;
    }
    lines.push(`${num(i - 1)} ${label}`);
  }
  return `${t(lang, 'group_size_prompt')}\n_${t(lang, 'service_label')}: ${service.emoji} ${service.name}_\n\n${lines.join('\n')}\n\n_${t(lang, 'reply_or_back')}_`;
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
  const moreHint  = hasMore ? `\n\n➡️ _Type *more* to see more dates_` : '';
  return `${t(lang, 'select_date')}\n_${t(lang, 'service_label')}: ${service.emoji} ${service.name}_\n\n${list}${moreHint}\n\n_${t(lang, 'reply_or_back')}_`;
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
  const moreHint  = hasMore ? `\n\n➡️ _Type *more* to see more times_` : '';

  return `${t(lang, 'select_time')}\n_${date.fullDisplay} — ${service.emoji} ${service.name} (${service.duration} min)_\n\n${groupNote}${list}${moreHint}\n\n_${t(lang, 'reply_or_back')}_`;
}

function buildConfirmationSummary(lang, name, service, date, time, groupSize = 1) {
  const mainCount     = time.mainCount     || 1;
  const overflowCount = time.overflowCount || 0;
  const totalCount    = mainCount + overflowCount;
  const totalPrice    = (+service.price * totalCount).toFixed(0);

  const lines = [t(lang, 'confirm_header'), ``];
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
    lines.push(`${t(lang, 'confirm_duration')}: *${service.duration} min pp*`);
    lines.push(`${t(lang, 'confirm_price')}: *${CUR()} ${totalPrice} (${totalCount}×${service.price})*`);
  } else {
    lines.push(`${service.emoji} ${t(lang, 'confirm_service')}  : *${service.name}*`);
    lines.push(`${t(lang, 'confirm_date')}    : *${date.fullDisplay}*`);
    lines.push(`${t(lang, 'confirm_time')}    : *${time.display}*`);
    lines.push(`${t(lang, 'confirm_duration')}: *${service.duration} min*`);
    lines.push(`${t(lang, 'confirm_price')}   : *${CUR()} ${service.price}*`);
  }

  lines.push(``, t(lang, 'confirm_prompt'));
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

function buildLocation(lang) {
  const addr    = q.getSetting('shop_address') || '';
  const link    = q.getSetting('google_maps_link') || '';
  const mapLine = link ? `\n🗺️ ${link}` : '';
  return `${t(lang, 'location_header')}\n\n${addr}${mapLine}\n\n${t(lang, 'back_menu')}`;
}

function buildContact(lang) {
  return [
    t(lang, 'contact_header'), ``,
    `${t(lang, 'contact_phone')}: ${q.getSetting('shop_phone') || ''}`,
    `${t(lang, 'contact_email')}: ${q.getSetting('shop_email') || ''}`,
    `${t(lang, 'contact_instagram')}: ${q.getSetting('shop_instagram') || ''}`,
    ``, t(lang, 'back_menu'),
  ].join('\n');
}

/** Show appointment details + reschedule/cancel options. */
function buildManageOptions(lang, appt) {
  const emp     = appt.employee_id ? q.getEmployee(appt.employee_id) : null;
  const dateStr = appt.start_time ? fmtApptDate(appt.start_time) : '—';
  const timeStr = appt.start_time ? fmtApptTime(appt.start_time) : '—';
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
    `📅 ${fmtApptDate(appt.start_time)}  ⏰ ${fmtApptTime(appt.start_time)}`,
  ].join('\n');
}

/** Reschedule confirmation summary. */
function buildRescheduleConfirm(lang, session, time) {
  const appt     = session.managedAppointment;
  const employee = session.rescheduleEmployee;
  const service  = session.rescheduleService;
  return [
    t(lang, 'confirm_header'), ``,
    `👤 *${appt.customer_name}*`,
    employee ? `${t(lang, 'confirm_barber')}: *${employee.name}*` : '',
    `${service.emoji} ${t(lang, 'confirm_service')}: *${service.name}*`,
    `${t(lang, 'confirm_date')}: *${session.rescheduleDate.fullDisplay}*`,
    `${t(lang, 'confirm_time')}: *${time.display}*`,
    `⏱️ ${t(lang, 'confirm_duration')}: *${service.duration} min*`,
    ``,
    t(lang, 'manage_reschedule_confirm'),
    t(lang, 'confirm_prompt'),
  ].filter(l => l !== '').join('\n');
}

/** Format an ISO timestamp → "Wed, Jun 3" (local time). */
function fmtApptDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Format an ISO timestamp → "3:00 PM" (local time). */
function fmtApptTime(iso) {
  const d = new Date(iso);
  const h = d.getHours(), m = d.getMinutes();
  const p = h >= 12 ? 'PM' : 'AM';
  const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hr}:${String(m).padStart(2, '0')} ${p}`;
}

function fmt24(ti) {
  if (!ti) return '';
  const [h, m] = ti.split(':').map(Number);
  const p  = h >= 12 ? 'PM' : 'AM';
  const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hr}:${String(m).padStart(2,'0')} ${p}`;
}

module.exports = { handleMessage };
