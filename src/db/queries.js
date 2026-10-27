/**
 * All data access functions — pure JavaScript, no SQL required.
 */
const db              = require('./database');
const { listEvents }  = require('../services/googleCalendar');

// ── Settings ──────────────────────────────────────────────────────────────────

const getSetting     = key      => db.settings.get(key);
const setSetting     = (k, v)   => db.settings.set(k, v);
const getAllSettings  = ()       => db.settings.getAll();
const setManySettings = obj     => db.settings.setMany(obj);

// ── Employees ─────────────────────────────────────────────────────────────────

const getEmployees       = ()    => db.employees.find().sort((a,b) => a.id - b.id);
const getActiveEmployees = ()    => db.employees.find(e => e.is_active).sort((a,b) => a.id - b.id);
const getEmployee        = id    => db.employees.findOne(e => String(e.id) === String(id));
const createEmployee     = (name, phone, color, gcalId, excludedServiceIds) =>
  db.employees.insert({ name, phone: phone||'', color: color||'#f59e0b', google_calendar_id: gcalId||'', is_active: 1, excluded_service_ids: excludedServiceIds||[], scan_pin: '' });
const updateEmployee     = (id, data) =>
  db.employees.updateById(id, { name: data.name, phone: data.phone||'', color: data.color, google_calendar_id: data.google_calendar_id||'', excluded_service_ids: data.excluded_service_ids||[], scan_pin: data.scan_pin||'' });

/** Returns active employees who can perform the given service.
 *  Uses excluded_service_ids — if the service is NOT in the exclusion list, the employee can do it.
 *  New services automatically appear for everyone (not in anyone's exclusion list by default). */
const getEmployeesForService = (serviceId) =>
  db.employees.find(e => e.is_active && !e.excluded_service_ids?.includes(serviceId))
    .sort((a, b) => a.id - b.id);
const toggleEmployee     = id   => db.employees.toggle(id, 'is_active');

/**
 * Returns true if the employee has an "away today" all-day block for today.
 */
function isEmployeeAwayToday(employeeId) {
  const today = _dateStr(new Date());
  return !!db.blockedDates.findOne(b =>
    b.date === today &&
    String(b.employee_id) === String(employeeId) &&
    b.all_day === 1 &&
    b.reason === 'away_today'
  );
}

/**
 * Toggle the "away today" status for an employee.
 * Adds an all-day block if not set; removes it if already set.
 * Returns the new away state (true = away, false = back).
 */
function toggleEmployeeAwayToday(employeeId) {
  const today    = _dateStr(new Date());
  const existing = db.blockedDates.findOne(b =>
    b.date === today &&
    String(b.employee_id) === String(employeeId) &&
    b.all_day === 1 &&
    b.reason === 'away_today'
  );
  if (existing) {
    db.blockedDates.removeById(existing.id);
    return false; // now available
  }
  db.blockedDates.insert({
    date:        today,
    employee_id: parseInt(employeeId, 10),
    all_day:     1,
    start_time:  null,
    end_time:    null,
    reason:      'away_today',
  });
  return true; // now away
}

// ── Business Hours ────────────────────────────────────────────────────────────

/**
 * Returns hours for a given employee+day, falling back to global default (employee_id = null).
 * Returns null if the day is closed.
 */
function getHoursForDay(employeeId, dayOfWeek) {
  const empId = employeeId != null ? parseInt(employeeId) : null;

  let h = empId != null
    ? db.businessHours.findOne(r => r.employee_id === empId && r.day_of_week === dayOfWeek)
    : null;

  if (!h) {
    h = db.businessHours.findOne(r => r.employee_id === null && r.day_of_week === dayOfWeek);
  }

  return h?.is_open ? h : null;
}

/** Returns all 7 rows for an employee (or global if employeeId=null), always falling back to global. */
function getWeeklyHours(employeeId) {
  const empId = employeeId != null ? parseInt(employeeId) : null;
  const empRows    = empId != null ? db.businessHours.find(r => r.employee_id === empId) : [];
  const globalRows = db.businessHours.find(r => r.employee_id === null);

  return Array.from({ length: 7 }, (_, dow) => {
    return empRows.find(r => r.day_of_week === dow)
        || globalRows.find(r => r.day_of_week === dow)
        || { day_of_week: dow, is_open: 0, open_time: '09:00', close_time: '18:00' };
  });
}

function setWeeklyHours(employeeId, hoursArray) {
  const empId = employeeId != null ? parseInt(employeeId) : null;
  for (const h of hoursArray) {
    db.businessHours.upsert(
      r => r.employee_id === empId && r.day_of_week === h.day_of_week,
      { employee_id: empId, day_of_week: h.day_of_week, is_open: h.is_open ? 1 : 0, open_time: h.open_time, close_time: h.close_time }
    );
  }
}

// ── Services ──────────────────────────────────────────────────────────────────

const getActiveServices = () => db.services.find(s => s.is_active).sort((a,b) => a.sort_order - b.sort_order);
const getAllServices     = () => db.services.find().sort((a,b) => a.sort_order - b.sort_order);
const getService        = id => db.services.findOne(s => String(s.id) === String(id));

function upsertService(s) {
  const existing = db.services.findOne(r => String(r.id) === String(s.id));
  if (existing) {
    db.services.updateById(s.id, { name: s.name, emoji: s.emoji||'', description: s.description||'', duration: +s.duration, price: +s.price, is_active: s.is_active??1, sort_order: s.sort_order??0 });
  } else {
    db.services.insert({ ...s, duration: +s.duration, price: +s.price, is_active: s.is_active??1, sort_order: s.sort_order??0 });
  }
}

const toggleService = id => db.services.toggle(id, 'is_active');
const deleteService = id => db.services.removeById(id);

// ── Bot Messages ──────────────────────────────────────────────────────────────

const getBotMessages  = () => db.botMessages.find().sort((a,b) => a.key.localeCompare(b.key));
const getBotMessage   = key => db.botMessages.findOne(m => m.key === key)?.value ?? '';
const setBotMessage   = (key, value) => db.botMessages.update(m => m.key === key, { value });
const setManyMessages = obj => Object.entries(obj).forEach(([k,v]) => setBotMessage(k, v));

// ── Appointments ──────────────────────────────────────────────────────────────

function _joinEmployee(appt) {
  const emp = db.employees.findOne(e => e.id === appt.employee_id);
  return { ...appt, employee_name: emp?.name || null, employee_color: emp?.color || null };
}

function getAppointments({ date, employeeId, status, limit = 200 } = {}) {
  let results = db.appointments.find();
  if (date)       results = results.filter(a => (a.start_time || '').startsWith(date));
  if (employeeId) results = results.filter(a => String(a.employee_id) === String(employeeId));
  if (status)     results = results.filter(a => a.status === status);
  results.sort((a,b) => (b.start_time||'').localeCompare(a.start_time||''));
  return results.slice(0, limit).map(_joinEmployee);
}

function getTodayAppointments() {
  const today = _dateStr(new Date());
  return db.appointments
    .find(a => (a.start_time||'').startsWith(today) && a.status !== 'cancelled')
    .sort((a,b) => (a.start_time||'').localeCompare(b.start_time||''))
    .map(_joinEmployee);
}

function getDashboardStats() {
  const today   = _dateStr(new Date());
  const weekAgo = _dateStr(new Date(Date.now() - 6*24*60*60*1000));
  const now     = new Date().toISOString();
  const all     = db.appointments.find();

  const todayAppts = all.filter(a => (a.start_time||'').startsWith(today));

  return {
    today:     todayAppts.filter(a => a.status !== 'cancelled').length,
    week:      all.filter(a => (a.start_time||'') >= weekAgo && a.status !== 'cancelled').length,
    revenue:   todayAppts.filter(a => a.status === 'confirmed').reduce((s,a) => s + (+a.service_price||0), 0),
    employees: db.employees.count(e => e.is_active),
    upcoming:  all.filter(a => (a.start_time||'') > now && a.status === 'confirmed').length,
  };
}

/**
 * Generates a unique 4-character booking code.
 * Uses an unambiguous alphabet (no 0/O, 1/I/L) so codes are easy to read aloud.
 * The code is shown to customers and in all visible records — the actual phone
 * number is stored separately and never displayed in the UI.
 */
function generateBookingCode() {
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 32 chars, no confusables
  let code, tries = 0;
  do {
    code = Array.from({ length: 4 }, () =>
      ALPHA[Math.floor(Math.random() * ALPHA.length)]
    ).join('');
    tries++;
    // Ensure uniqueness against active/confirmed bookings
    const clash = db.appointments.findOne(a => a.booking_code === code && a.status !== 'cancelled');
    if (!clash) break;
  } while (tries < 200);
  return code;
}

function createAppointment(data) {
  const booking_code = generateBookingCode();
  const result = db.appointments.insert({
    booking_code,                              // ← unique 4-char code shown everywhere
    employee_id:      data.employee_id || null,
    customer_name:    data.customer_name,
    customer_phone:   data.customer_phone,     // ← stored in JSON only, never shown in UI
    service_id:       data.service_id,
    service_name:     data.service_name,
    service_emoji:    data.service_emoji || '',
    service_duration: +data.service_duration,
    service_price:    +data.service_price,
    start_time:       data.start_time instanceof Date ? data.start_time.toISOString() : data.start_time,
    end_time:         data.end_time   instanceof Date ? data.end_time.toISOString()   : data.end_time,
    google_event_id:   data.google_event_id  || '',
    google_event_link: data.google_event_link || '',
    status:           data.status || 'confirmed',
    notes:            data.notes || '',
    reminder_sent:    0,
  });
  // Return the code alongside the insert result so callers can show it
  return { ...result, booking_code };
}

/** Look up an appointment by its 4-char booking code (case-insensitive). */
const getAppointmentByCode = (code) =>
  db.appointments.findOne(a => a.booking_code === code.trim().toUpperCase());

/** Look up an appointment by its numeric ID. */
const getAppointmentById = (id) =>
  db.appointments.findOne(a => String(a.id) === String(id));

/**
 * Find confirmed appointments whose end_time was at least `delayMinutes` ago
 * and whose survey has not yet been sent.
 */
function getUnsurveyedAppointments(delayMinutes = 30) {
  const cutoff = new Date(Date.now() - delayMinutes * 60_000).toISOString();
  return db.appointments.find(a =>
    a.status === 'confirmed' &&
    a.end_time < cutoff &&
    !a.survey_sent
  );
}

/** Mark a survey as sent so it never fires again for this appointment. */
const markSurveySent = (id) =>
  db.appointments.updateById(id, { survey_sent: 1 });

/** Save the customer's rating (1–5) on the appointment. */
const saveRating = (id, rating) =>
  db.appointments.updateById(id, { rating: parseInt(rating, 10) });

/** Count total no-show appointments for a customer phone number. */
const getNoShowCount = (phone) =>
  db.appointments.count(a => a.customer_phone === phone && a.status === 'no-show');

/**
 * Returns true if the phone number has NO previous non-cancelled appointments.
 * Used by the bot to detect first-time customers and show a warm welcome.
 */
const isNewCustomer = (phone) =>
  !db.appointments.findOne(a => a.customer_phone === phone && a.status !== 'cancelled');

/** Mark an appointment cancelled. */
const cancelAppointment = (id) =>
  db.appointments.updateById(id, { status: 'cancelled' });

/** Update start/end times (reschedule). Keeps all other fields intact. */
function rescheduleAppointment(id, startTime, endTime) {
  return db.appointments.updateById(id, {
    start_time: startTime instanceof Date ? startTime.toISOString() : startTime,
    end_time:   endTime   instanceof Date ? endTime.toISOString()   : endTime,
  });
}

function updateAppointment(id, { status, notes, google_event_id, google_event_link, reminder_sent } = {}) {
  const updates = {};
  if (status             != null) updates.status             = status;
  if (notes              != null) updates.notes              = notes;
  if (google_event_id    != null) updates.google_event_id    = google_event_id;
  if (google_event_link  != null) updates.google_event_link  = google_event_link;
  if (reminder_sent      != null) updates.reminder_sent      = reminder_sent;
  return db.appointments.updateById(id, updates);
}

// ── Customer profiles ─────────────────────────────────────────────────────────

/** Find a customer whose phones array contains this number. */
const getCustomerByPhone = (phone) =>
  db.customers.findOne(c => Array.isArray(c.phones) && c.phones.includes(phone));

/** Return all customers, sorted by name. */
const getAllCustomers = () =>
  db.customers.find().sort((a, b) => (a.name || '').localeCompare(b.name || ''));

/**
 * Returns every customer enriched with live stats from the appointments collection.
 * Used by the dashboard Customers page.
 */
function getAllCustomersWithStats() {
  return getAllCustomers().map(c => {
    const phones   = c.phones || [];
    const appts    = db.appointments.find(a => phones.includes(a.customer_phone));
    const noShows  = appts.filter(a => a.status === 'no-show').length;
    const bookings = appts.filter(a => a.status !== 'cancelled').length;
    const ratings  = appts.map(a => a.rating).filter(Boolean);
    const avgRating = ratings.length
      ? (ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1)
      : null;
    return { ...c, total_bookings: bookings, no_show_count: noShows, avg_rating: avgRating };
  });
}

/**
 * Look up a customer by phone. If not found, create a new record.
 * Returns the customer record (existing or newly created).
 */
function getOrCreateCustomer(name, phone) {
  const existing = getCustomerByPhone(phone);
  if (existing) {
    // Update name if the existing record has none
    if (!existing.name && name) db.customers.updateById(existing.id, { name });
    return db.customers.findOne(c => String(c.id) === String(existing.id));
  }
  db.customers.insert({ name: name || '', phones: [phone], is_blocked: 0, block_reason: '', notes: '' });
  return getCustomerByPhone(phone);
}

/** Add an extra phone number to an existing customer (for linked accounts). */
function addPhoneToCustomer(id, phone) {
  const customer = db.customers.findOne(c => String(c.id) === String(id));
  if (!customer) return;
  const phones = customer.phones || [];
  if (phones.includes(phone)) return; // already linked
  db.customers.updateById(id, { phones: [...phones, phone] });
}

/** Remove a phone number from a customer's linked list. */
function removePhoneFromCustomer(id, phone) {
  const customer = db.customers.findOne(c => String(c.id) === String(id));
  if (!customer) return;
  const phones = (customer.phones || []).filter(p => p !== phone);
  db.customers.updateById(id, { phones });
}

/** Block a customer (all their linked numbers are affected). */
const blockCustomer   = (id, reason = '') =>
  db.customers.updateById(id, { is_blocked: 1, block_reason: reason });

/** Unblock a customer. */
const unblockCustomer = (id) =>
  db.customers.updateById(id, { is_blocked: 0, block_reason: '' });

/** Update notes / name on a customer record. */
const updateCustomer  = (id, data) =>
  db.customers.updateById(id, data);

/**
 * Returns true if a given phone number belongs to a blocked customer.
 * Used in the bot entry point to silently drop messages.
 */
const isPhoneBlocked = (phone) => {
  const c = getCustomerByPhone(phone);
  return c?.is_blocked === 1;
};

// ── Customer-specific pricing ─────────────────────────────────────────────────

/**
 * Returns every special price configured, joined with the customer's name and
 * the service's name/standard price (for display).
 */
function getCustomerPrices() {
  return db.customerPrices.find()
    .map(r => {
      const customer = db.customers.findOne(c => String(c.id) === String(r.customer_id));
      const service  = db.services.findOne(s => String(s.id) === String(r.service_id));
      return {
        ...r,
        customer_name:  customer?.name || '(unknown customer)',
        service_name:   service?.name  || '(unknown service)',
        standard_price: service ? +service.price : null,
      };
    })
    .sort((a, b) => a.customer_name.localeCompare(b.customer_name) || a.service_name.localeCompare(b.service_name));
}

/** Create or update the special price for one customer+service combo. */
function setCustomerPrice({ customerId, serviceId, price }) {
  return db.customerPrices.upsert(
    r => String(r.customer_id) === String(customerId) && String(r.service_id) === String(serviceId),
    { customer_id: +customerId, service_id: serviceId, price: +price }
  );
}

const deleteCustomerPrice = (id) => db.customerPrices.removeById(id);

/**
 * Returns the special price (a number) set for this customer+service, or null
 * if none is configured. Used by the bot to override the standard service
 * price when a customer with a special price books that service.
 */
function getSpecialPrice(customerPhone, serviceId) {
  const customer = getCustomerByPhone(customerPhone);
  if (!customer) return null;
  const row = db.customerPrices.findOne(r =>
    String(r.customer_id) === String(customer.id) &&
    String(r.service_id)  === String(serviceId)
  );
  return row ? +row.price : null;
}

// ── Blocked dates / time-off ──────────────────────────────────────────────────

/**
 * Returns blocks sorted by date.
 * Pass date ('YYYY-MM-DD') and/or employeeId to filter.
 * employee_id === null means shop-wide; a numeric ID is barber-specific.
 */
function getBlocks({ date, employeeId } = {}) {
  let results = db.blockedDates.find();
  if (date)             results = results.filter(b => b.date === date);
  if (employeeId !== undefined && employeeId !== '')
    results = results.filter(b => String(b.employee_id) === String(employeeId));
  return results.sort((a, b) => a.date.localeCompare(b.date));
}

function addBlock(data) {
  return db.blockedDates.insert({
    date:        data.date,
    employee_id: (data.employee_id != null && data.employee_id !== '') ? +data.employee_id : null,
    all_day:     data.all_day ? 1 : 0,
    start_time:  data.all_day ? null : (data.start_time || null),
    end_time:    data.all_day ? null : (data.end_time   || null),
    reason:      data.reason  || '',
  });
}

const deleteBlock = (id) => db.blockedDates.removeById(id);

// ── Employee Leave ────────────────────────────────────────────────────────────

/**
 * Returns leave records, optionally filtered by employeeId and/or month ('YYYY-MM').
 */
function getLeaves({ employeeId, month } = {}) {
  let results = db.leaves.find();
  if (employeeId != null && employeeId !== '')
    results = results.filter(l => String(l.employee_id) === String(employeeId));
  if (month)
    results = results.filter(l => l.start_date.startsWith(month) || l.end_date.startsWith(month) ||
      (l.start_date < month + '-01' && l.end_date >= month + '-01'));
  return results.sort((a, b) => a.start_date.localeCompare(b.start_date));
}

function addLeave({ employeeId, startDate, endDate, reason, googleEventId }) {
  return db.leaves.insert({
    employee_id:      parseInt(employeeId, 10),
    start_date:       startDate,
    end_date:         endDate || startDate,
    reason:           reason || '',
    google_event_id:  googleEventId || '',
  });
}

const getLeave    = (id) => db.leaves.findOne(l => String(l.id) === String(id));
const deleteLeave = (id) => db.leaves.removeById(id);

/**
 * Returns true if the given employee is on approved leave for dateStr ('YYYY-MM-DD').
 */
function isEmployeeOnLeave(employeeId, dateStr) {
  return !!db.leaves.findOne(l =>
    String(l.employee_id) === String(employeeId) &&
    l.start_date <= dateStr &&
    l.end_date   >= dateStr
  );
}

// ── Slot generation ───────────────────────────────────────────────────────────

function _generateSlots(baseDate, openTime, closeTime, serviceDuration, interval = 30) {
  const [oh, om] = openTime.split(':').map(Number);
  const [ch, cm] = closeTime.split(':').map(Number);
  const openMins  = oh * 60 + om;
  const closeMins = ch * 60 + cm;
  const slots = [];

  for (let m = openMins; m + serviceDuration <= closeMins; m += interval) {
    const h   = Math.floor(m / 60);
    const min = m % 60;
    const start = new Date(baseDate);
    start.setHours(h, min, 0, 0);
    const end = new Date(start.getTime() + serviceDuration * 60_000);
    slots.push({
      time:    `${_pad(h)}:${_pad(min)}`,
      display: _toAmPm(h, min),
      start, end,
    });
  }
  return slots;
}

async function getAvailableSlotsForEmployee(employee, date, serviceDuration, { excludeId } = {}) {
  const dayOfWeek = date.getDay();
  const hours     = getHoursForDay(employee.id, dayOfWeek);
  if (!hours) return [];

  // Employee on approved leave → no slots
  const dateStr0 = _dateStr(date);
  if (isEmployeeOnLeave(employee.id, dateStr0)) return [];

  const allSlots = _generateSlots(date, hours.open_time, hours.close_time, serviceDuration);
  const dateStr  = _dateStr(date);

  // ── Local DB conflicts ────────────────────────────────────────────────────────
  const booked = db.appointments.find(a =>
    (a.start_time||'').startsWith(dateStr) &&
    String(a.employee_id) === String(employee.id) &&
    a.status !== 'cancelled' &&
    (!excludeId || String(a.id) !== String(excludeId))   // skip the appt being rescheduled
  );

  // ── Blocked date / time-off checks ───────────────────────────────────────────
  // Shop-wide all-day closure?
  if (db.blockedDates.findOne(b => b.date === dateStr && b.employee_id === null && b.all_day))
    return [];
  // Barber all-day off?
  if (db.blockedDates.findOne(b => b.date === dateStr && String(b.employee_id) === String(employee.id) && b.all_day))
    return [];

  // ── Google Calendar conflicts (personal blocks on the barber's own calendar) ──
  // IMPORTANT: only use the employee's OWN calendar here — never the shop-wide
  // fallback. The shop calendar holds every barber's appointments mixed together,
  // so querying it per-employee would block all barbers whenever any one of them
  // is booked. The DB check above already handles per-barber conflicts correctly;
  // the calendar check exists only to catch personal blocks the barber adds
  // manually (days off, personal appointments, etc.).
  const calId     = employee.google_calendar_id || null;
  const calEvents = calId ? await listEvents(calId, dateStr) : [];

  // ── Partial time blocks (shop-wide or barber-specific) ───────────────────────
  const timeBlocks = db.blockedDates.find(b =>
    b.date === dateStr && !b.all_day &&
    (b.employee_id === null || String(b.employee_id) === String(employee.id)) &&
    b.start_time && b.end_time
  ).map(b => {
    const [sh, sm] = b.start_time.split(':').map(Number);
    const [eh, em] = b.end_time.split(':').map(Number);
    const s = new Date(date); s.setHours(sh, sm, 0, 0);
    const e = new Date(date); e.setHours(eh, em, 0, 0);
    return { start: s, end: e };
  });

  // ── Merge and filter ──────────────────────────────────────────────────────────
  const busy = [
    ...booked.map(b => ({ start: new Date(b.start_time), end: new Date(b.end_time) })),
    ...calEvents,
    ...timeBlocks,
  ];

  return allSlots.filter(slot => !busy.some(b => slot.start < b.end && slot.end > b.start));
}

async function getAvailableSlotsForAny(employees, date, serviceDuration) {
  const map = new Map();
  for (const emp of employees) {
    for (const slot of await getAvailableSlotsForEmployee(emp, date, serviceDuration)) {
      if (map.has(slot.time)) {
        map.get(slot.time).availableEmployees.push(emp.id);
      } else {
        map.set(slot.time, { ...slot, availableEmployees: [emp.id] });
      }
    }
  }
  return [...map.values()].sort((a,b) => a.start - b.start);
}

/**
 * Returns time slots where at least min(groupSize, employees.length) barbers
 * are simultaneously free.
 *
 * Each slot includes:
 *   - availableEmployees : employee IDs free for the main block
 *   - mainCount          : how many people we serve in this slot
 *   - overflowCount      : how many need a follow-up slot (0 if no overflow)
 *   - overflowSlot       : next available slot for overflow people, or null
 *
 * Overflow happens when groupSize > employees.length.
 * Example: 3 people, 2 barbers → mainCount=2, overflowCount=1,
 *   overflowSlot = first slot at/after this slot's end where ≥1 barber is free.
 */
async function getAvailableSlotsForGroup(employees, date, duration, groupSize) {
  // Collect per-employee free slots in parallel
  const slotsByEmp = await Promise.all(
    employees.map(emp => getAvailableSlotsForEmployee(emp, date, duration))
  );

  // Build a union map: timeKey → { ...slot, availableEmployees: [id, ...] }
  const map = new Map();
  employees.forEach((emp, i) => {
    for (const slot of slotsByEmp[i]) {
      if (map.has(slot.time)) {
        map.get(slot.time).availableEmployees.push(emp.id);
      } else {
        map.set(slot.time, { ...slot, availableEmployees: [emp.id] });
      }
    }
  });

  const allSlots      = [...map.values()].sort((a, b) => a.start - b.start);
  const maxConcurrent = employees.length;
  const mainCount     = Math.min(groupSize, maxConcurrent);
  const overflowCount = Math.max(0, groupSize - maxConcurrent);

  // Only slots where at least mainCount barbers are simultaneously free
  const mainSlots = allSlots.filter(s => s.availableEmployees.length >= mainCount);

  return mainSlots.map(slot => {
    // For overflow: find earliest slot starting at/after this slot's end
    // where at least overflowCount barbers are free.
    // (The main-slot barbers finish at slot.end and are free again — they'll
    //  appear in overflowSlot.availableEmployees if no other booking conflicts.)
    const overflowSlot = overflowCount > 0
      ? (allSlots.find(s =>
          s.start >= slot.end && s.availableEmployees.length >= overflowCount
        ) || null)
      : null;
    return { ...slot, mainCount, overflowCount, overflowSlot };
  });
}

function pickLeastBusyEmployee(employeeIds, dateStr) {
  const counts = employeeIds.map(id => ({
    id,
    count: db.appointments.count(a =>
      (a.start_time||'').startsWith(dateStr) &&
      String(a.employee_id) === String(id) &&
      a.status !== 'cancelled'
    ),
  }));
  counts.sort((a,b) => a.count - b.count);
  return counts[0].id;
}

function getAvailableDates(employees, daysAhead, limit = 20) {
  const ahead = daysAhead || parseInt(getSetting('booking_days_ahead')) || 20;
  const dates = [];
  const today = new Date();
  for (let i = 1; i <= ahead && dates.length < limit; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const dow     = d.getDay();
    const dateStr = _dateStr(d);

    // Skip dates blocked for the whole shop
    if (db.blockedDates.findOne(b => b.date === dateStr && b.employee_id === null && b.all_day))
      continue;

    // At least one employee must have open hours AND not be blocked/on-leave all day
    const anyOpen = employees.length === 0
      ? !!getHoursForDay(null, dow)
      : employees.some(e =>
          !!getHoursForDay(e.id, dow) &&
          !db.blockedDates.findOne(b => b.date === dateStr && String(b.employee_id) === String(e.id) && b.all_day) &&
          !isEmployeeOnLeave(e.id, dateStr)
        );
    if (anyOpen) {
      dates.push({
        date: d,
        dayOfWeek: dow,
        fullDisplay: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      });
    }
  }
  return dates;
}

// ── Photo Gallery ─────────────────────────────────────────────────────────────

const getPhotos      = (tag) => tag
  ? db.photos.find(p => Array.isArray(p.tags) && p.tags.map(t => t.toLowerCase()).includes(tag.toLowerCase()))
  : db.photos.find();

const getPhotoTags   = () => {
  const tagSet = new Set();
  db.photos.find().forEach(p => (p.tags || []).forEach(t => tagSet.add(t.toLowerCase())));
  return [...tagSet].sort();
};

const addPhoto       = (data) => db.photos.insert({
  filename:      data.filename,
  original_name: data.originalName || data.filename,
  tags:          (data.tags || []).map(t => t.toLowerCase().trim()).filter(Boolean),
  caption:       data.caption || '',
});

const updatePhoto    = (id, data) => db.photos.updateById(id, {
  tags:    (data.tags || []).map(t => t.toLowerCase().trim()).filter(Boolean),
  caption: data.caption || '',
});

const deletePhoto    = (id) => db.photos.removeById(id);

// ── Surinamese Public Holidays ────────────────────────────────────────────────

/** Gregorian Easter algorithm — returns a Date object. */
function _easterDate(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function _addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Variable Islamic/Hindu holidays per year (approximate — based on official announcements).
 * Dates may shift by ±1 day depending on moon sighting.
 * Extend this table when new years approach.
 */
const VARIABLE_HOLIDAYS = {
  2024: [
    { date: '2024-03-25', name: 'Holi Phagwa' },
    { date: '2024-04-10', name: 'Eid al-Fitr (Id ul Fitr)' },
    { date: '2024-06-17', name: 'Eid al-Adha (Id ul Adha)' },
    { date: '2024-10-31', name: 'Divali (Deepavali)' },
  ],
  2025: [
    { date: '2025-03-14', name: 'Holi Phagwa' },
    { date: '2025-03-31', name: 'Eid al-Fitr (Id ul Fitr)' },
    { date: '2025-06-07', name: 'Eid al-Adha (Id ul Adha)' },
    { date: '2025-10-20', name: 'Divali (Deepavali)' },
  ],
  2026: [
    { date: '2026-03-03', name: 'Holi Phagwa' },
    { date: '2026-03-20', name: 'Eid al-Fitr (Id ul Fitr)' },
    { date: '2026-05-27', name: 'Eid al-Adha (Id ul Adha)' },
    { date: '2026-11-08', name: 'Divali (Deepavali)' },
  ],
  2027: [
    { date: '2027-03-22', name: 'Holi Phagwa' },
    { date: '2027-03-09', name: 'Eid al-Fitr (Id ul Fitr)' },
    { date: '2027-05-17', name: 'Eid al-Adha (Id ul Adha)' },
    { date: '2027-10-28', name: 'Divali (Deepavali)' },
  ],
  2028: [
    { date: '2028-03-11', name: 'Holi Phagwa' },
    { date: '2028-02-26', name: 'Eid al-Fitr (Id ul Fitr)' },
    { date: '2028-05-05', name: 'Eid al-Adha (Id ul Adha)' },
    { date: '2028-10-16', name: 'Divali (Deepavali)' },
  ],
};

/**
 * Returns the full list of Surinamese public holidays for a given year.
 * Fixed holidays + Easter (calculated) + Islamic/Hindu (lookup table).
 */
function getSurinameseHolidays(year) {
  const y = parseInt(year, 10);
  const holidays = [
    { date: `${y}-01-01`, name: 'Nieuwjaarsdag (New Year\'s Day)' },
    { date: `${y}-01-06`, name: 'Driekoningen (Three Kings\' Day)' },
    { date: `${y}-05-01`, name: 'Dag van de Arbeid (Labour Day)' },
    { date: `${y}-07-01`, name: 'Keti Koti (Emancipation Day)' },
    { date: `${y}-11-25`, name: 'Onafhankelijkheidsdag (Independence Day)' },
    { date: `${y}-12-25`, name: 'Eerste Kerstdag (Christmas Day)' },
    { date: `${y}-12-26`, name: 'Tweede Kerstdag (Boxing Day)' },
  ];

  // Easter & related
  const easter = _easterDate(y);
  holidays.push({ date: _dateStr(_addDays(easter, -2)), name: 'Goede Vrijdag (Good Friday)' });
  holidays.push({ date: _dateStr(easter),               name: 'Eerste Paasdag (Easter Sunday)' });
  holidays.push({ date: _dateStr(_addDays(easter,  1)), name: 'Tweede Paasdag (Easter Monday)' });

  // Variable (Islamic / Hindu)
  const variable = VARIABLE_HOLIDAYS[y] || [];
  holidays.push(...variable);

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Insert Surinamese holidays for a given year into blockedDates (shop-wide, all-day).
 * Skips duplicates. Returns counts.
 */
function syncSurinameseHolidays(year) {
  const holidays = getSurinameseHolidays(year);
  let added = 0;
  for (const h of holidays) {
    const reason = `🇸🇷 ${h.name}`;
    const exists = db.blockedDates.findOne(b =>
      b.date === h.date && b.employee_id === null && b.all_day === 1 && b.reason === reason
    );
    if (!exists) {
      db.blockedDates.insert({ date: h.date, employee_id: null, all_day: 1, start_time: null, end_time: null, reason });
      added++;
    }
  }
  return { added, total: holidays.length };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _pad(n)        { return String(n).padStart(2, '0'); }
function _dateStr(date) { return date.toISOString().split('T')[0]; }
function _toAmPm(h, m)  {
  const p  = h >= 12 ? 'PM' : 'AM';
  const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hr}:${_pad(m)} ${p}`;
}

module.exports = {
  getSetting, setSetting, getAllSettings, setManySettings,
  getEmployees, getActiveEmployees, getEmployee, getEmployeesForService, createEmployee, updateEmployee, toggleEmployee,
  isEmployeeAwayToday, toggleEmployeeAwayToday,
  getHoursForDay, getWeeklyHours, setWeeklyHours,
  getActiveServices, getAllServices, getService, upsertService, toggleService, deleteService,
  getBotMessages, getBotMessage, setBotMessage, setManyMessages,
  getAppointments, getTodayAppointments, getDashboardStats,
  createAppointment, updateAppointment,
  getAppointmentByCode, getAppointmentById, cancelAppointment, rescheduleAppointment, isNewCustomer,
  getUnsurveyedAppointments, markSurveySent, saveRating, getNoShowCount,
  getAvailableSlotsForEmployee, getAvailableSlotsForAny, getAvailableSlotsForGroup, pickLeastBusyEmployee, getAvailableDates,
  getPhotos, getPhotoTags, addPhoto, updatePhoto, deletePhoto,
  getBlocks, addBlock, deleteBlock,
  getSurinameseHolidays, syncSurinameseHolidays,
  getLeaves, getLeave, addLeave, deleteLeave, isEmployeeOnLeave,
  getCustomerByPhone, getAllCustomers, getAllCustomersWithStats,
  getOrCreateCustomer, addPhoneToCustomer, removePhoneFromCustomer,
  blockCustomer, unblockCustomer, updateCustomer, isPhoneBlocked,
  getCustomerPrices, setCustomerPrice, deleteCustomerPrice, getSpecialPrice,
};
