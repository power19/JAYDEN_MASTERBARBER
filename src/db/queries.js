/**
 * All data access functions — pure JavaScript, no SQL required.
 */
const db = require('./database');

// ── Settings ──────────────────────────────────────────────────────────────────

const getSetting     = key      => db.settings.get(key);
const setSetting     = (k, v)   => db.settings.set(k, v);
const getAllSettings  = ()       => db.settings.getAll();
const setManySettings = obj     => db.settings.setMany(obj);

// ── Employees ─────────────────────────────────────────────────────────────────

const getEmployees       = ()    => db.employees.find().sort((a,b) => a.id - b.id);
const getActiveEmployees = ()    => db.employees.find(e => e.is_active).sort((a,b) => a.id - b.id);
const getEmployee        = id    => db.employees.findOne(e => String(e.id) === String(id));
const createEmployee     = (name, phone, color, gcalId) =>
  db.employees.insert({ name, phone: phone||'', color: color||'#f59e0b', google_calendar_id: gcalId||'', is_active: 1 });
const updateEmployee     = (id, data) =>
  db.employees.updateById(id, { name: data.name, phone: data.phone||'', color: data.color, google_calendar_id: data.google_calendar_id||'' });
const toggleEmployee     = id   => db.employees.toggle(id, 'is_active');

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
    google_event_id:  data.google_event_id || '',
    status:           data.status || 'confirmed',
    notes:            data.notes || '',
  });
  // Return the code alongside the insert result so callers can show it
  return { ...result, booking_code };
}

function updateAppointment(id, { status, notes, google_event_id } = {}) {
  const updates = {};
  if (status         != null) updates.status         = status;
  if (notes          != null) updates.notes          = notes;
  if (google_event_id != null) updates.google_event_id = google_event_id;
  return db.appointments.updateById(id, updates);
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

function getAvailableSlotsForEmployee(employee, date, serviceDuration) {
  const dayOfWeek = date.getDay();
  const hours     = getHoursForDay(employee.id, dayOfWeek);
  if (!hours) return [];

  const allSlots = _generateSlots(date, hours.open_time, hours.close_time, serviceDuration);
  const dateStr  = _dateStr(date);

  const booked = db.appointments.find(a =>
    (a.start_time||'').startsWith(dateStr) &&
    String(a.employee_id) === String(employee.id) &&
    a.status !== 'cancelled'
  );

  return allSlots.filter(slot =>
    !booked.some(b => {
      const bs = new Date(b.start_time), be = new Date(b.end_time);
      return slot.start < be && slot.end > bs;
    })
  );
}

function getAvailableSlotsForAny(employees, date, serviceDuration) {
  const map = new Map();
  for (const emp of employees) {
    for (const slot of getAvailableSlotsForEmployee(emp, date, serviceDuration)) {
      if (map.has(slot.time)) {
        map.get(slot.time).availableEmployees.push(emp.id);
      } else {
        map.set(slot.time, { ...slot, availableEmployees: [emp.id] });
      }
    }
  }
  return [...map.values()].sort((a,b) => a.start - b.start);
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

function getAvailableDates(employees, daysAhead, limit = 7) {
  const ahead = daysAhead || parseInt(getSetting('booking_days_ahead')) || 14;
  const dates = [];
  const today = new Date();
  for (let i = 1; i <= ahead && dates.length < limit; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay();
    const anyOpen = employees.length === 0
      ? !!getHoursForDay(null, dow)
      : employees.some(e => !!getHoursForDay(e.id, dow));
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
  getEmployees, getActiveEmployees, getEmployee, createEmployee, updateEmployee, toggleEmployee,
  getHoursForDay, getWeeklyHours, setWeeklyHours,
  getActiveServices, getAllServices, getService, upsertService, toggleService, deleteService,
  getBotMessages, getBotMessage, setBotMessage, setManyMessages,
  getAppointments, getTodayAppointments, getDashboardStats, createAppointment, updateAppointment,
  getAvailableSlotsForEmployee, getAvailableSlotsForAny, pickLeastBusyEmployee, getAvailableDates,
};
