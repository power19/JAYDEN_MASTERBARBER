/**
 * All data access functions — pure JavaScript, no SQL required.
 */
const db              = require('./database');

// Maps the bot's language codes to Intl locales for date formatting.
const DATE_LOCALES = { nl: 'nl-NL', en: 'en-US', es: 'es-ES', fr: 'fr-FR', pt: 'pt-BR' };

/** Localized short date, e.g. nl → "wo 17 jun", en → "Wed, Jun 17". */
const localeLongDate = (date, lang = 'en') => {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString(DATE_LOCALES[lang] || 'en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

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
  db.employees.updateById(id, { name: data.name, phone: data.phone||'', color: data.color, google_calendar_id: data.google_calendar_id||'', excluded_service_ids: data.excluded_service_ids||[], fixed_customer_phones: data.fixed_customer_phones||[], fallback_employee_ids: data.fallback_employee_ids||[] });

/**
 * Returns the active employee whose fixed_customer_phones list contains this phone number.
 * Normalises by stripping all non-digits before comparing.
 *
 * Two-pass lookup handles @lid accounts:
 *  Pass 1 – direct digit match (works when admin entered the actual phone number and
 *            the customer's WhatsApp sends as @c.us, e.g. "5978403686").
 *  Pass 2 – customer-table cross-reference: find the customer record whose phones array
 *            includes the incoming ID, then check all their known IDs against the stored
 *            fixed_customer_phones. This lets admins enter a normal phone number even
 *            when the customer's active session comes in via a @lid ID.
 */
const getBarberForPhone = (phone) => {
  const normalise = p => String(p).replace(/\D/g, '');
  const target    = normalise(phone);

  // Pass 1: direct match
  const direct = db.employees.findOne(e =>
    e.is_active &&
    Array.isArray(e.fixed_customer_phones) &&
    e.fixed_customer_phones.some(p => normalise(p) === target)
  );
  if (direct) return direct;

  // Pass 2: look up all IDs for this customer and try each one
  const customer = db.customers.findOne(c =>
    Array.isArray(c.phones) && c.phones.some(p => normalise(p) === target)
  );
  if (!customer) return null;
  const allIds = (customer.phones || []).map(normalise);
  return db.employees.findOne(e =>
    e.is_active &&
    Array.isArray(e.fixed_customer_phones) &&
    e.fixed_customer_phones.some(p => allIds.includes(normalise(p)))
  ) || null;
};

/** Returns active employees who can perform the given service.
 *  Uses excluded_service_ids — if the service is NOT in the exclusion list, the employee can do it.
 *  New services automatically appear for everyone (not in anyone's exclusion list by default). */
const getEmployeesForService = (serviceId) =>
  db.employees.find(e => e.is_active && !e.excluded_service_ids?.includes(serviceId))
    .sort((a, b) => a.id - b.id);
const toggleEmployee     = id   => db.employees.toggle(id, 'is_active');

/**
 * Permanently removes an employee. Appointments only store employee_id and
 * resolve the barber's name/color live (see _joinEmployee) — so before the
 * employee record disappears, their name/color is frozen onto every
 * appointment that references them (employee_name/employee_color), which
 * _joinEmployee falls back to once the live lookup misses. Past bookings
 * keep showing the right barber; only the live employee record is gone.
 */
function deleteEmployee(id) {
  const emp = db.employees.findOne(e => String(e.id) === String(id));
  if (!emp) return { changes: 0 };

  db.appointments.find(a => String(a.employee_id) === String(id)).forEach(a =>
    db.appointments.updateById(a.id, { employee_name: emp.name, employee_color: emp.color })
  );

  db.businessHours.remove(r => String(r.employee_id) === String(id));
  db.leaves.remove(l => String(l.employee_id) === String(id));
  db.blockedDates.remove(b => String(b.employee_id) === String(id));
  return db.employees.removeById(id);
}

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
  // Falls back to the appointment's own frozen employee_name/employee_color
  // (set by deleteEmployee() below) once the barber no longer has a live record.
  return {
    ...appt,
    employee_name:  emp?.name  || appt.employee_name  || null,
    employee_color: emp?.color || appt.employee_color || null,
  };
}

function getAppointments({ date, employeeId, status, limit = 200 } = {}) {
  let results = db.appointments.find();
  if (date)       results = results.filter(a => a.start_time && _dateStr(new Date(a.start_time)) === date);
  if (employeeId) results = results.filter(a => String(a.employee_id) === String(employeeId));
  if (status)     results = results.filter(a => a.status === status);
  results.sort((a,b) => (b.start_time||'').localeCompare(a.start_time||''));
  return results.slice(0, limit).map(_joinEmployee);
}

function getTodayAppointments() {
  const today = _dateStr(new Date());
  return db.appointments
    .find(a => a.start_time && _dateStr(new Date(a.start_time)) === today && a.status !== 'cancelled')
    .sort((a,b) => (a.start_time||'').localeCompare(b.start_time||''))
    .map(_joinEmployee);
}

function getDashboardStats() {
  const today   = _dateStr(new Date());
  const weekAgo = _dateStr(new Date(Date.now() - 6*24*60*60*1000));
  const now     = new Date().toISOString();
  const all     = db.appointments.find();

  const todayAppts = all.filter(a => a.start_time && _dateStr(new Date(a.start_time)) === today);

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

// If Chrome wedges mid-reply (see whatsapp-client.js wedge detector) the
// customer never sees a confirmation, assumes the booking failed, and retries
// the same slot — after the DB write already succeeded. Suppress an exact
// repeat (same phone + name + service + slot) made within this window instead
// of silently creating a second appointment.
const DUPLICATE_BOOKING_WINDOW_MS = 5 * 60 * 1000;

function createAppointment(data) {
  const startIso = data.start_time instanceof Date ? data.start_time.toISOString() : data.start_time;
  const endIso   = data.end_time   instanceof Date ? data.end_time.toISOString()   : data.end_time;

  const dup = db.appointments.findOne(a =>
    a.status         !== 'cancelled' &&
    a.customer_phone === data.customer_phone &&
    a.customer_name  === data.customer_name &&
    a.service_id     === data.service_id &&
    a.start_time     === startIso &&
    (Date.now() - new Date(a.created_at).getTime()) < DUPLICATE_BOOKING_WINDOW_MS
  );
  if (dup) {
    console.warn(`⚠️  Duplicate booking suppressed for ${data.customer_name} (${data.customer_phone}) @ ${startIso} — reusing ${dup.booking_code}`);
    return { lastInsertRowid: dup.id, changes: 0, booking_code: dup.booking_code, duplicate: true };
  }

  // Authoritative overlap guard. getAvailableSlotsForEmployee() is only a
  // pre-filter — two different customers can both read it as "free" before
  // either has written (e.g. both picking the same slot within seconds).
  // This check + the insert below have no `await` between them, so it's the
  // actual serialization point that stops a double-booking from landing.
  if (data.employee_id) {
    const clash = db.appointments.findOne(a =>
      a.status !== 'cancelled' &&
      String(a.employee_id) === String(data.employee_id) &&
      a.start_time < endIso && startIso < a.end_time
    );
    if (clash) {
      console.warn(`⚠️  Slot clash refused: employee ${data.employee_id} already booked ${clash.booking_code} @ ${clash.start_time}`);
      return { clash: true, clashBookingCode: clash.booking_code };
    }
  }

  const booking_code = generateBookingCode();
  const result = db.appointments.insert({
    booking_code,                              // ← unique 4-char code shown everywhere
    booking_group:    data.booking_group || '',// ← links appointments made in one group/family booking
    employee_id:      data.employee_id || null,
    customer_name:    data.customer_name,
    customer_phone:   data.customer_phone,     // ← stored in JSON only, never shown in UI
    service_id:       data.service_id,
    service_name:     data.service_name,
    service_emoji:    data.service_emoji || '',
    service_duration: +data.service_duration,
    service_price:    +data.service_price,
    start_time:       startIso,
    end_time:         endIso,
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

/**
 * All still-cancellable (confirmed) appointments that belong to one group booking.
 * Returns [] for empty/missing groupId so single bookings never match.
 */
const getActiveGroupAppointments = (groupId) =>
  groupId
    ? db.appointments.find(a => a.booking_group === groupId && a.status === 'confirmed')
    : [];

/**
 * Fallback grouping for bookings made before booking_group existed:
 * all still-confirmed appointments for the same phone on the same calendar day.
 * Includes the given appointment itself.
 */
const getActiveSiblingAppointments = (appt) => {
  if (!appt || !appt.customer_phone) return [];
  const day = (appt.start_time || '').slice(0, 10);
  return db.appointments.find(a =>
    a.customer_phone === appt.customer_phone &&
    a.status === 'confirmed' &&
    (a.start_time || '').slice(0, 10) === day
  );
};

/** A customer's upcoming confirmed appointments, earliest first. */
const getUpcomingAppointmentsByPhone = (phone) => {
  const now = Date.now();
  return db.appointments
    .find(a => a.customer_phone === phone && a.status === 'confirmed' && new Date(a.start_time).getTime() >= now)
    .slice()
    .sort((x, y) => new Date(x.start_time) - new Date(y.start_time));
};

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

/** Save the customer's preferred language on their profile. */
function saveCustomerLanguage(phone, lang) {
  const customer = getCustomerByPhone(phone);
  if (customer) db.customers.updateById(customer.id, { preferred_lang: lang });
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

/** Permanently delete a customer record. */
const deleteCustomer  = (id) =>
  db.customers.removeById(id);

// ── Keywords ──────────────────────────────────────────────────────────────────

const getKeywords    = ()       => db.keywords.find().sort((a, b) => a.action.localeCompare(b.action) || a.keyword.localeCompare(b.keyword));
const addKeyword     = (data)   => db.keywords.insert({ keyword: (data.keyword||'').toLowerCase().trim(), action: data.action, enabled: 1 });
const updateKeyword  = (id, data) => db.keywords.updateById(id, { keyword: (data.keyword||'').toLowerCase().trim(), action: data.action, enabled: data.enabled ?? 1 });
const deleteKeyword  = (id)     => db.keywords.removeById(id);
const matchKeyword   = (text)   => db.keywords.findOne(k => k.enabled && k.keyword === text.trim().toLowerCase());

/** Return all appointments belonging to a customer (matched by phones array). */
function getAppointmentsForCustomer(customerId) {
  const customer = db.customers.findOne(c => String(c.id) === String(customerId));
  if (!customer) return [];
  const norm = p => String(p).replace(/\D/g, '');
  const phones = new Set((customer.phones || []).map(norm));
  return getAppointments({}).filter(a => phones.has(norm(a.customer_phone || '')));
}

/**
 * Returns true if a given phone number belongs to a blocked customer.
 * Used in the bot entry point to silently drop messages.
 */
const isPhoneBlocked = (phone) => {
  const c = getCustomerByPhone(phone);
  return c?.is_blocked === 1;
};

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
    a.start_time && _dateStr(new Date(a.start_time)) === dateStr &&
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

  // ── No Google Calendar read here ──────────────────────────────────────────────
  // An employee's google_calendar_id is the barber's email, used solely to share
  // the shop calendar with them (read-only). Their personal calendars are never
  // queried — availability comes from the DB plus the blocked-date checks above.

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
    ...timeBlocks,
  ];

  const now = new Date();
  return allSlots.filter(slot =>
    slot.start > now &&
    !busy.some(b => slot.start < b.end && slot.end > b.start)
  );
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

/**
 * Multi-service parallel slot finder.
 * persons = [{ service: { id, duration } }, ...]
 * employees = all active employees (union across services)
 *
 * For each 30-min start time T, tries to assign each person to a distinct barber
 * who is free at T for that person's service duration.
 * Uses greedy: assign the person with fewest available barbers first.
 *
 * Returns slots with assignments: [{ personIdx, employeeId, start, end }, ...]
 */
async function getAvailableSlotsForParallelGroup(persons, employees, date) {
  const dateStr = _dateStr(date);

  // Build appointment count per employee on this date (for fair-share sorting)
  const apptCount = new Map();
  for (const emp of employees) {
    apptCount.set(emp.id, db.appointments.count(a =>
      a.start_time && _dateStr(new Date(a.start_time)) === dateStr &&
      String(a.employee_id) === String(emp.id) &&
      a.status !== 'cancelled'
    ));
  }

  // For each employee × service, get free slots
  const slotCache = new Map(); // `${empId}-${duration}` → Set of timeKeys
  const slotObjects = new Map(); // timeKey → slot object (start/end/display)
  for (const emp of employees) {
    const durations = [...new Set(persons.map(p => p.service.duration))];
    for (const dur of durations) {
      const slots = await getAvailableSlotsForEmployee(emp, date, dur);
      const key = `${emp.id}-${dur}`;
      slotCache.set(key, new Set(slots.map(s => s.time)));
      for (const s of slots) {
        if (!slotObjects.has(`${s.time}-${dur}`)) slotObjects.set(`${s.time}-${dur}`, s);
      }
    }
  }

  // Collect all candidate times
  const allTimes = new Set();
  for (const [, timeSet] of slotCache) for (const t of timeSet) allTimes.add(t);
  const sortedTimes = [...allTimes].sort();

  const results = [];
  for (const timeKey of sortedTimes) {
    // For each person, find which employees are free — sorted least busy first
    const options = persons.map((p, idx) => ({
      personIdx: idx,
      duration: p.service.duration,
      freeEmployees: employees
        .filter(e => slotCache.get(`${e.id}-${p.service.duration}`)?.has(timeKey))
        .sort((a, b) => (apptCount.get(a.id) || 0) - (apptCount.get(b.id) || 0))
        .map(e => e.id),
    }));

    // Greedy assignment: most constrained (fewest options) first
    const sorted = [...options].sort((a, b) => a.freeEmployees.length - b.freeEmployees.length);
    const used = new Set();
    const assignment = [];
    let valid = true;

    for (const opt of sorted) {
      const chosen = opt.freeEmployees.find(id => !used.has(id));
      if (!chosen) { valid = false; break; }
      used.add(chosen);
      const slotObj = slotObjects.get(`${timeKey}-${opt.duration}`);
      assignment.push({ personIdx: opt.personIdx, employeeId: chosen, start: slotObj.start, end: slotObj.end, display: slotObj.display });
    }

    if (valid) {
      results.push({ time: timeKey, display: assignment[0].display, start: assignment[0].start, isParallel: true, assignments: assignment });
    }
  }
  return results;
}

/**
 * Multi-service sequential slot finder.
 * Chains persons one after another: person 1 at T, person 2 at T+dur1, etc.
 * Each person gets any available barber at their slot time.
 *
 * Returns slots with assignments: [{ personIdx, employeeId, start, end }, ...]
 */
async function getAvailableSlotsForSequentialGroup(persons, employees, date) {
  // Get all slots per employee (using smallest duration for initial enumeration)
  const minDur = Math.min(...persons.map(p => p.service.duration));
  const slotsByEmp = await Promise.all(employees.map(e => getAvailableSlotsForEmployee(e, date, minDur)));

  // Collect all candidate start times
  const allTimes = new Set();
  slotsByEmp.forEach(slots => slots.forEach(s => allTimes.add(s.time)));
  const sortedTimes = [...allTimes].sort();

  // For each employee, build a set of slots keyed by duration for quick lookup
  const empSlotsByDur = new Map(); // empId → Map(duration → Map(timeKey → slot))
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    empSlotsByDur.set(emp.id, new Map());
    const durations = [...new Set(persons.map(p => p.service.duration))];
    for (const dur of durations) {
      const slots = await getAvailableSlotsForEmployee(emp, date, dur);
      empSlotsByDur.get(emp.id).set(dur, new Map(slots.map(s => [s.time, s])));
    }
  }

  // Helper: format a Date to HH:MM time key
  function toTimeKey(d) {
    return d.toTimeString().slice(0, 5);
  }

  const results = [];
  for (const startTime of sortedTimes) {
    const assignment = [];
    let valid = true;
    let currentTime = null; // will be set from actual slot start

    for (let idx = 0; idx < persons.length; idx++) {
      const dur = persons[idx].service.duration;
      const tKey = idx === 0 ? startTime : toTimeKey(currentTime);

      // Find any available employee at this time for this duration
      let chosen = null;
      let chosenSlot = null;
      for (const emp of employees) {
        const slotMap = empSlotsByDur.get(emp.id)?.get(dur);
        if (slotMap?.has(tKey) && !assignment.some(a => {
          // Barber is busy if their slot overlaps with this one
          const s = slotMap.get(tKey);
          return String(a.employeeId) === String(emp.id) && a.start < s.end && a.end > s.start;
        })) {
          chosen = emp.id;
          chosenSlot = slotMap.get(tKey);
          break;
        }
      }

      if (!chosen) { valid = false; break; }
      assignment.push({ personIdx: idx, employeeId: chosen, start: chosenSlot.start, end: chosenSlot.end, display: chosenSlot.display });
      currentTime = chosenSlot.end; // next person starts when this one finishes
    }

    if (valid) {
      results.push({ time: startTime, display: assignment[0].display, start: assignment[0].start, isParallel: false, assignments: assignment });
    }
  }
  return results;
}

/**
 * Batched slot finder: fills up to employees.length persons in parallel per wave,
 * then chains the next wave after the first wave finishes.
 * e.g. 4 people + 3 barbers → wave 1: persons 0-2 at T, wave 2: person 3 at T + max_wave1_duration
 *
 * Returns slots with assignments covering all persons.
 */
async function getAvailableSlotsForBatchGroup(persons, employees, date) {
  const dateStr = _dateStr(date);

  // Only barbers actually working this day take part. Otherwise, on a day where
  // one barber is off (e.g. melly on Sundays), a group of 3+ would wrongly require
  // everyone in a single parallel wave and find nothing — instead of filling the
  // available barbers in parallel and scheduling the rest right after.
  const dow = date.getDay();
  const working = employees.filter(e =>
    getHoursForDay(e.id, dow) &&
    !db.blockedDates.findOne(b => b.date === dateStr && String(b.employee_id) === String(e.id) && b.all_day) &&
    !isEmployeeOnLeave(e.id, dateStr)
  );
  if (working.length) employees = working;

  const batchSize = employees.length;

  // Build appointment count per employee for fair-share tie-breaking
  const apptCount = new Map();
  for (const emp of employees) {
    apptCount.set(emp.id, db.appointments.count(a =>
      a.start_time && _dateStr(new Date(a.start_time)) === dateStr &&
      String(a.employee_id) === String(emp.id) &&
      a.status !== 'cancelled'
    ));
  }

  // Split persons into batches
  const batches = [];
  for (let i = 0; i < persons.length; i += batchSize) {
    batches.push({ persons: persons.slice(i, i + batchSize), startIdx: i });
  }

  // Find parallel slots for the first batch
  const batch0Slots = await getAvailableSlotsForParallelGroup(batches[0].persons, employees, date);
  if (batch0Slots.length === 0) return [];

  // Helper: format a timestamp to display string
  function fmtDisplay(ms) {
    const d = new Date(ms);
    const h = d.getHours(), m = d.getMinutes();
    const p = h >= 12 ? 'PM' : 'AM';
    const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hr}:${String(m).padStart(2, '0')} ${p}`;
  }

  const results = [];

  for (const slot of batch0Slots) {
    const allAssignments = slot.assignments.map(a => ({ ...a }));

    // Track when each barber becomes free after wave 1
    const barberFreeAt = new Map();
    for (const a of slot.assignments) {
      barberFreeAt.set(a.employeeId, new Date(a.end).getTime());
    }
    // Any barber not used in wave 1 is free from the slot start
    for (const emp of employees) {
      if (!barberFreeAt.has(emp.id)) barberFreeAt.set(emp.id, new Date(slot.start).getTime());
    }

    let valid = true;

    // Assign remaining persons one by one to the earliest-free barber
    const remainingPersons = [];
    for (let b = 1; b < batches.length; b++) {
      const batch = batches[b];
      for (let p = 0; p < batch.persons.length; p++) {
        remainingPersons.push({ person: batch.persons[p], personIdx: batch.startIdx + p });
      }
    }

    for (const { person, personIdx } of remainingPersons) {
      const dur = person.service.duration;

      // Pick the barber who becomes free soonest; break ties by least busy overall
      let bestEmpId = null;
      let bestFreeAt = Infinity;
      let bestCount = Infinity;
      for (const [empId, freeAt] of barberFreeAt) {
        const cnt = apptCount.get(empId) || 0;
        if (freeAt < bestFreeAt || (freeAt === bestFreeAt && cnt < bestCount)) {
          bestFreeAt = freeAt; bestEmpId = empId; bestCount = cnt;
        }
      }

      if (!bestEmpId) { valid = false; break; }

      const startMs = bestFreeAt;
      const endMs   = startMs + dur * 60000;
      barberFreeAt.set(bestEmpId, endMs); // barber is now busy until endMs

      allAssignments.push({
        personIdx,
        employeeId: bestEmpId,
        start:   new Date(startMs).toISOString(),
        end:     new Date(endMs).toISOString(),
        display: fmtDisplay(startMs),
      });
    }

    if (valid) {
      results.push({
        time:        slot.time,
        display:     slot.display,
        start:       slot.start,
        isParallel:  true,
        isBatched:   batches.length > 1,
        assignments: allAssignments,
      });
    }
  }

  return results;
}

function pickLeastBusyEmployee(employeeIds, dateStr) {
  const counts = employeeIds.map(id => ({
    id,
    count: db.appointments.count(a =>
      a.start_time && _dateStr(new Date(a.start_time)) === dateStr &&
      String(a.employee_id) === String(id) &&
      a.status !== 'cancelled'
    ),
  }));
  counts.sort((a,b) => a.count - b.count);
  return counts[0].id;
}

function getAvailableDates(employees, lang = 'en', daysAhead, limit = 20) {
  const ahead = daysAhead || parseInt(getSetting('booking_days_ahead')) || 20;
  const dates = [];
  const today = new Date();
  for (let i = 0; i <= ahead && dates.length < limit; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const dow     = d.getDay();
    const dateStr = _dateStr(d);

    // Skip dates blocked for the whole shop
    if (db.blockedDates.findOne(b => b.date === dateStr && b.employee_id === null && b.all_day))
      continue;

    // Global shop closed for this day-of-week → always skip, regardless of employee hours
    const globalHours = getHoursForDay(null, dow);
    if (!globalHours) continue;

    // At least one employee must have open hours AND not be blocked/on-leave all day
    const anyOpen = employees.length === 0
      ? true  // global hours already confirmed open above
      : employees.some(e =>
          !!getHoursForDay(e.id, dow) &&
          !db.blockedDates.findOne(b => b.date === dateStr && String(b.employee_id) === String(e.id) && b.all_day) &&
          !isEmployeeOnLeave(e.id, dateStr)
        );
    if (anyOpen) {
      dates.push({
        date: d,
        dayOfWeek: dow,
        fullDisplay: localeLongDate(d, lang),
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

// ── Training Videos ───────────────────────────────────────────────────────────

const getTrainingVideos  = () => db.trainingVideos.find().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
const addTrainingVideo   = (data) => db.trainingVideos.insert({
  filename:     data.filename,
  originalName: data.originalName || data.filename,
  caption:      data.caption || '',
  sort_order:   db.trainingVideos.count(),
});
const updateTrainingVideo = (id, data) => db.trainingVideos.updateById(id, {
  caption: data.caption || '',
});
const deleteTrainingVideo = (id) => db.trainingVideos.removeById(id);

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
function _dateStr(date) {
  const tz = process.env.TIMEZONE || 'America/Paramaribo';
  return date.toLocaleDateString('en-CA', { timeZone: tz }); // en-CA gives YYYY-MM-DD
}
function _toAmPm(h, m)  {
  const p  = h >= 12 ? 'PM' : 'AM';
  const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hr}:${_pad(m)} ${p}`;
}

module.exports = {
  getSetting, setSetting, getAllSettings, setManySettings,
  getEmployees, getActiveEmployees, getEmployee, getEmployeesForService, createEmployee, updateEmployee, toggleEmployee, deleteEmployee, getBarberForPhone,
  isEmployeeAwayToday, toggleEmployeeAwayToday,
  getHoursForDay, getWeeklyHours, setWeeklyHours,
  getActiveServices, getAllServices, getService, upsertService, toggleService, deleteService,
  getBotMessages, getBotMessage, setBotMessage, setManyMessages,
  getAppointments, getTodayAppointments, getDashboardStats,
  createAppointment, updateAppointment,
  getAppointmentByCode, getActiveGroupAppointments, getActiveSiblingAppointments, getUpcomingAppointmentsByPhone, getAppointmentById, cancelAppointment, rescheduleAppointment, isNewCustomer,
  getUnsurveyedAppointments, markSurveySent, saveRating, getNoShowCount,
  getAvailableSlotsForEmployee, getAvailableSlotsForAny, getAvailableSlotsForGroup,
  getAvailableSlotsForParallelGroup, getAvailableSlotsForSequentialGroup, getAvailableSlotsForBatchGroup,
  pickLeastBusyEmployee, getAvailableDates, localeLongDate,
  getPhotos, getPhotoTags, addPhoto, updatePhoto, deletePhoto,
  getTrainingVideos, addTrainingVideo, updateTrainingVideo, deleteTrainingVideo,
  getBlocks, addBlock, deleteBlock,
  getSurinameseHolidays, syncSurinameseHolidays,
  getLeaves, getLeave, addLeave, deleteLeave, isEmployeeOnLeave,
  getCustomerByPhone, getAllCustomers, getAllCustomersWithStats,
  getOrCreateCustomer, addPhoneToCustomer, removePhoneFromCustomer, saveCustomerLanguage,
  blockCustomer, unblockCustomer, updateCustomer, deleteCustomer, isPhoneBlocked,
  getAppointmentsForCustomer,
  getKeywords, addKeyword, updateKeyword, deleteKeyword, matchKeyword,
};
