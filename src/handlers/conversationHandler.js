/**
 * Conversation Handler v2 — multi-employee booking flow.
 *
 * States:
 *   IDLE → MAIN_MENU → SELECTING_SERVICE → SELECTING_EMPLOYEE* → SELECTING_DATE
 *   → SELECTING_TIME → ENTERING_NAME → CONFIRMING_BOOKING → IDLE
 *   (* skipped if only 1 employee or employee explicitly skipped)
 *
 * Global shortcuts (any state):
 *   menu / hi / hello   → restart at main menu
 *   cancel / exit       → cancel booking
 *   0 / back            → one step back
 */

const sessions = require('../utils/sessionManager');
const q        = require('../db/queries');
const { createAppointment: calendarCreate } = require('../services/googleCalendar');

const NUM    = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
const num    = i => NUM[i] || `${i + 1}.`;
const CUR    = () => q.getSetting('currency') || 'SRD';

const isMenu   = t => /^(menu|main|home|start|hi|hello|hey|hola|good\s*day)$/i.test(t.trim());
const isCancel = t => /^(cancel|exit|quit|stop)$/i.test(t.trim());
const isBack   = t => /^(0|back|b|terug)$/i.test(t.trim());

// ── Entry point ───────────────────────────────────────────────────────────────

async function handleMessage(message) {
  const userId = message.from;
  const text   = (message.body || '').trim();

  // Bot paused?
  if (q.getSetting('bot_paused') === '1') {
    const msg = (q.getBotMessage('bot_paused_message') || '😊 We are currently unavailable.')
      .replace('{shop_phone}', q.getSetting('shop_phone') || '');
    return msg;
  }

  const session = sessions.getSession(userId);

  if (isMenu(text)) {
    sessions.resetSession(userId);
    sessions.updateSession(userId, { state: 'MAIN_MENU' });
    return buildMainMenu();
  }
  if (isCancel(text)) {
    sessions.resetSession(userId);
    return `❌ Booking cancelled. Type *menu* whenever you're ready! ✂️`;
  }

  switch (session.state) {
    case 'IDLE':              return onIdle(userId);
    case 'MAIN_MENU':         return onMainMenu(userId, text);
    case 'SELECTING_SERVICE': return onService(userId, text, session);
    case 'SELECTING_EMPLOYEE':return onEmployee(userId, text, session);
    case 'SELECTING_DATE':    return onDate(userId, text, session);
    case 'SELECTING_TIME':    return onTime(userId, text, session);
    case 'ENTERING_NAME':     return onName(userId, text, session);
    case 'CONFIRMING_BOOKING':return onConfirm(userId, text, session);
    default:
      sessions.resetSession(userId);
      sessions.updateSession(userId, { state: 'MAIN_MENU' });
      return buildMainMenu();
  }
}

// ── State handlers ────────────────────────────────────────────────────────────

function onIdle(userId) {
  sessions.updateSession(userId, { state: 'MAIN_MENU' });
  return buildMainMenu();
}

function onMainMenu(userId, text) {
  switch (text.trim()) {
    case '1':
      sessions.updateSession(userId, { state: 'SELECTING_SERVICE' });
      return buildServiceMenu(true);
    case '2': return buildServiceList();
    case '3': return buildHours();
    case '4': return buildLocation();
    case '5': return buildContact();
    default:
      return `Please reply with *1 – 5*.\n\n${buildMainMenu()}`;
  }
}

async function onService(userId, text, session) {
  if (isBack(text)) {
    sessions.updateSession(userId, { state: 'MAIN_MENU' });
    return buildMainMenu();
  }

  const services = q.getActiveServices();
  const idx = parseInt(text, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= services.length) {
    return `Please reply with *1 – ${services.length}*.\n\n${buildServiceMenu(true)}`;
  }

  const service   = services[idx];
  const employees = q.getActiveEmployees();
  const allowAny  = q.getSetting('allow_any_employee') !== '0';

  // Skip employee selection if there's only one employee
  if (employees.length <= 1) {
    const selectedEmployee = employees[0] || null;
    const dates = q.getAvailableDates(employees);
    sessions.updateSession(userId, {
      state: 'SELECTING_DATE',
      selectedService: service,
      selectedEmployee,
      isAnyEmployee: !selectedEmployee,
      availableDates: dates,
      employees,
    });
    return buildDateMenu(dates, service);
  }

  sessions.updateSession(userId, {
    state: 'SELECTING_EMPLOYEE',
    selectedService: service,
    employees,
  });
  return buildEmployeeMenu(employees, service, allowAny);
}

function onEmployee(userId, text, session) {
  if (isBack(text)) {
    sessions.updateSession(userId, { state: 'SELECTING_SERVICE' });
    return buildServiceMenu(true);
  }

  const { employees, selectedService } = session;
  const allowAny = q.getSetting('allow_any_employee') !== '0';
  const menuLength = allowAny ? employees.length + 1 : employees.length;
  const idx = parseInt(text, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= menuLength) {
    return `Please reply with *1 – ${menuLength}*.\n\n${buildEmployeeMenu(employees, selectedService, allowAny)}`;
  }

  let selectedEmployee = null;
  let isAnyEmployee    = false;

  if (allowAny && idx === 0) {
    // "Any Available" chosen
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
  });
  return buildDateMenu(dates, selectedService);
}

async function onDate(userId, text, session) {
  if (isBack(text)) {
    const employees = session.employees;
    const allowAny  = q.getSetting('allow_any_employee') !== '0';
    if (employees && employees.length > 1) {
      sessions.updateSession(userId, { state: 'SELECTING_EMPLOYEE' });
      return buildEmployeeMenu(employees, session.selectedService, allowAny);
    }
    sessions.updateSession(userId, { state: 'SELECTING_SERVICE' });
    return buildServiceMenu(true);
  }

  const dates = session.availableDates;
  const idx   = parseInt(text, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= dates.length) {
    return `Please reply with *1 – ${dates.length}*.\n\n${buildDateMenu(dates, session.selectedService)}`;
  }

  const selectedDate = dates[idx];
  const service      = session.selectedService;
  const employees    = q.getActiveEmployees();
  let freeSlots;

  if (session.isAnyEmployee) {
    freeSlots = q.getAvailableSlotsForAny(employees, selectedDate.date, service.duration);
  } else {
    freeSlots = q.getAvailableSlotsForEmployee(session.selectedEmployee, selectedDate.date, service.duration);
  }

  if (freeSlots.length === 0) {
    return `😔 No open slots on *${selectedDate.fullDisplay}*. Please pick another day.\n\n${buildDateMenu(dates, service)}`;
  }

  sessions.updateSession(userId, {
    state: 'SELECTING_TIME',
    selectedDate,
    availableSlots: freeSlots,
  });
  return buildTimeMenu(selectedDate, freeSlots, service);
}

function onTime(userId, text, session) {
  if (isBack(text)) {
    sessions.updateSession(userId, { state: 'SELECTING_DATE' });
    return buildDateMenu(session.availableDates, session.selectedService);
  }

  const slots = session.availableSlots;
  const idx   = parseInt(text, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= slots.length) {
    return `Please reply with *1 – ${slots.length}*.\n\n${buildTimeMenu(session.selectedDate, slots, session.selectedService)}`;
  }

  sessions.updateSession(userId, {
    state: 'ENTERING_NAME',
    selectedTime: slots[idx],
  });
  return `👤 *Almost done!*\n\nPlease type your *full name* to reserve your spot:`;
}

function onName(userId, text, session) {
  if (text.length < 2) return `✏️ Please enter your *full name* to continue.`;
  const name = text.trim();
  sessions.updateSession(userId, { state: 'CONFIRMING_BOOKING', userName: name });
  return buildConfirmationSummary(name, session.selectedService, session.selectedDate, session.selectedTime, session.selectedEmployee);
}

async function onConfirm(userId, text, session) {
  const answer = text.toLowerCase().trim();
  if (answer === 'no' || answer === 'n') {
    sessions.resetSession(userId);
    return '❌ Booking cancelled. Type *1* to start again or *menu* for the main menu.';
  }
  if (answer !== 'yes' && answer !== 'y') {
    return 'Please reply *YES* to confirm or *NO* to cancel.';
  }

  const { selectedService, selectedDate, selectedTime, selectedEmployee, isAnyEmployee, userName } = session;

  // Pick the least-busy employee when "Any Available" was chosen
  let assignedEmployee = selectedEmployee;
  if (isAnyEmployee && selectedTime.availableEmployees?.length) {
    const dateStr = selectedDate.date.toISOString().split('T')[0];
    const empId   = q.pickLeastBusyEmployee(selectedTime.availableEmployees, dateStr);
    assignedEmployee = q.getEmployee(empId);
  }

  // Save to database — phone stored privately in JSON, booking_code shown everywhere
  const dbResult = q.createAppointment({
    employee_id:      assignedEmployee?.id || null,
    customer_name:    userName,
    customer_phone:   userId.replace('@c.us', ''), // never displayed; stored in data/appointments.json only
    service_id:       selectedService.id,
    service_name:     selectedService.name,
    service_emoji:    selectedService.emoji,
    service_duration: selectedService.duration,
    service_price:    selectedService.price,
    start_time:       selectedTime.start,
    end_time:         selectedTime.end,
  });

  const bookingCode = dbResult.booking_code; // unique 4-char code, e.g. "AX7K"

  // Sync to Google Calendar (best-effort)
  try {
    const calId = assignedEmployee?.google_calendar_id || process.env.GOOGLE_CALENDAR_ID;
    if (calId) {
      const calResult = await calendarCreate({
        service:       selectedService,
        startTime:     selectedTime.start,
        endTime:       selectedTime.end,
        customerName:  userName,
        bookingCode,                    // ← code replaces phone in calendar event
        employeeName:  assignedEmployee?.name,
        calendarId:    calId,
      });
      if (calResult.success) {
        q.updateAppointment(dbResult.lastInsertRowid, { google_event_id: calResult.eventId });
      }
    }
  } catch (err) {
    console.error('⚠️  Google Calendar sync failed (appointment still saved):', err.message);
  }

  sessions.resetSession(userId);

  const footer = (q.getBotMessage('confirmed_footer') || 'We look forward to seeing you! ✂️')
    .replace('{shop_name}', q.getSetting('shop_name') || "Jayden's Barbershop")
    .replace('{shop_phone}', q.getSetting('shop_phone') || '');

  return [
    `🎉 *Appointment Confirmed!*`,
    ``,
    `🎫 *Booking Code: ${bookingCode}*`,
    `   _Save this code — you may need it to reschedule._`,
    ``,
    `👤 *${userName}*`,
    assignedEmployee ? `💈 Barber: *${assignedEmployee.name}*` : '',
    `${selectedService.emoji} Service: *${selectedService.name}*`,
    `📅 Date: *${selectedDate.fullDisplay}*`,
    `⏰ Time: *${selectedTime.display}*`,
    `⏱️ Duration: *${selectedService.duration} min*`,
    `💰 Price: *${CUR()} ${selectedService.price}*`,
    ``,
    `📍 ${q.getSetting('shop_address') || ''}`,
    `📞 ${q.getSetting('shop_phone') || ''}`,
    ``,
    footer,
  ].filter(l => l !== '').join('\n');
}

// ── Message builders ──────────────────────────────────────────────────────────

function buildMainMenu() {
  const shop    = q.getSetting('shop_name') || "Jayden's Barbershop";
  const header  = (q.getBotMessage('welcome_header') || `💈 *Welcome to {shop_name}!*\n\nHow can I help you today?`)
    .replace('{shop_name}', shop);
  return [
    header, ``,
    `${num(0)} 📅 Book an Appointment`,
    `${num(1)} 💈 Our Services & Prices`,
    `${num(2)} ⏰ Business Hours`,
    `${num(3)} 📍 Location`,
    `${num(4)} 📞 Contact Us`,
    ``, `Reply with a number to continue.`,
  ].join('\n');
}

function buildServiceMenu(isBooking) {
  const services = q.getActiveServices();
  const hdr = isBooking ? `📅 *Book an Appointment*\n\nSelect a service:\n` : `💈 *Services*\n`;
  const list = services.map((s, i) =>
    `${num(i)} ${s.emoji} *${s.name}*\n   ⏱️ ${s.duration} min  |  💰 ${CUR()} ${s.price}\n   _${s.description}_`
  ).join('\n\n');
  return `${hdr}\n${list}\n\n_Reply with a number${isBooking ? ', or *0* to go back' : ''}_`;
}

function buildServiceList() {
  const services = q.getActiveServices();
  const list = services.map((s, i) =>
    `${num(i)} ${s.emoji} *${s.name}* — ${CUR()} ${s.price}\n   ⏱️ ${s.duration} min`
  ).join('\n\n');
  return `💈 *Services & Prices*\n\n${list}\n\n📅 Reply *1* to book\n🏠 Reply *menu* to go back`;
}

function buildEmployeeMenu(employees, service, allowAny) {
  const prompt = q.getBotMessage('select_employee_prompt') || '💈 *Choose your barber:*';
  const lines = [];
  if (allowAny) lines.push(`${num(0)} 🎲 Any Available Barber`);
  employees.forEach((e, i) => lines.push(`${num(allowAny ? i + 1 : i)} ${e.name}`));
  return `${prompt}\n_Service: ${service.emoji} ${service.name}_\n\n${lines.join('\n')}\n\n_Reply with a number, or *0* to go back._`;
}

function buildDateMenu(dates, service) {
  const list = dates.map((d, i) => `${num(i)} ${d.fullDisplay}`).join('\n');
  return `📅 *Select a Date*\n_Service: ${service.emoji} ${service.name}_\n\n${list}\n\n_Reply with a number, or *0* to go back._`;
}

function buildTimeMenu(date, slots, service) {
  const list = slots.map((s, i) => `${num(i)} ${s.display}`).join('\n');
  return `⏰ *Available Times*\n_${date.fullDisplay} — ${service.emoji} ${service.name} (${service.duration} min)_\n\n${list}\n\n_Reply with a number, or *0* to go back._`;
}

function buildConfirmationSummary(name, service, date, time, employee) {
  const empLine = employee ? `💈 Barber   : *${employee.name}*\n` : '';
  return [
    `✅ *Booking Summary*`, ``,
    `👤 Name    : *${name}*`,
    empLine + `${service.emoji} Service  : *${service.name}*`,
    `📅 Date    : *${date.fullDisplay}*`,
    `⏰ Time    : *${time.display}*`,
    `⏱️  Duration: *${service.duration} min*`,
    `💰 Price   : *${CUR()} ${service.price}*`,
    ``,
    `Reply *YES* to confirm ✅  |  *NO* to cancel ❌`,
  ].join('\n');
}

function buildHours() {
  const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const rows = q.getWeeklyHours(null);
  const lines = rows.map(r =>
    `${DAY_NAMES[r.day_of_week]}: ${r.is_open ? `*${fmt24(r.open_time)} – ${fmt24(r.close_time)}*` : '*Closed*'}`
  );
  return `⏰ *Business Hours*\n\n${lines.join('\n')}\n\n🏠 Type *menu* to go back`;
}

function buildLocation() {
  const addr = q.getSetting('shop_address') || '';
  const link = q.getSetting('google_maps_link') || '';
  const mapLine = link ? `\n🗺️ ${link}` : '';
  return `📍 *Location*\n\n${addr}${mapLine}\n\n🏠 Type *menu* to go back`;
}

function buildContact() {
  return [
    `📞 *Contact Us*`, ``,
    `📱 WhatsApp / Phone: ${q.getSetting('shop_phone') || ''}`,
    `📧 Email: ${q.getSetting('shop_email') || ''}`,
    `📸 Instagram: ${q.getSetting('shop_instagram') || ''}`,
    ``, `🏠 Type *menu* to go back`,
  ].join('\n');
}

function fmt24(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const p  = h >= 12 ? 'PM' : 'AM';
  const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hr}:${String(m).padStart(2,'0')} ${p}`;
}

module.exports = { handleMessage };
