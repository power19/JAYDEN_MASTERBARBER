/**
 * Database — creates all collections and seeds default data on first run.
 * Uses pure-JavaScript JSON file storage (no native compilation required).
 */
const path = require('path');
const { JsonCollection, JsonKVStore } = require('./store');

const DATA_DIR = path.dirname(
  process.env.DB_PATH || path.join(process.cwd(), 'data', 'barbershop.db')
);

const db = {
  employees:     new JsonCollection(path.join(DATA_DIR, 'employees.json')),
  businessHours: new JsonCollection(path.join(DATA_DIR, 'business_hours.json')),
  services:      new JsonCollection(path.join(DATA_DIR, 'services.json')),
  appointments:  new JsonCollection(path.join(DATA_DIR, 'appointments.json')),
  botMessages:   new JsonCollection(path.join(DATA_DIR, 'bot_messages.json')),
  blockedDates:  new JsonCollection(path.join(DATA_DIR, 'blocked_dates.json')),
  customers:     new JsonCollection(path.join(DATA_DIR, 'customers.json')),
  photos:        new JsonCollection(path.join(DATA_DIR, 'photos.json')),
  leaves:        new JsonCollection(path.join(DATA_DIR, 'leaves.json')),
  settings:      new JsonKVStore(path.join(DATA_DIR, 'settings.json')),
};

// ── Seed defaults (only if collections are empty) ─────────────────────────────

function seedIfEmpty() {
  // Global business hours
  if (db.businessHours.count() === 0) {
    const defaults = [
      { employee_id: null, day_of_week: 0, is_open: 0, open_time: '09:00', close_time: '18:00' }, // Sun
      { employee_id: null, day_of_week: 1, is_open: 1, open_time: '09:00', close_time: '18:00' }, // Mon
      { employee_id: null, day_of_week: 2, is_open: 1, open_time: '09:00', close_time: '18:00' }, // Tue
      { employee_id: null, day_of_week: 3, is_open: 1, open_time: '09:00', close_time: '18:00' }, // Wed
      { employee_id: null, day_of_week: 4, is_open: 1, open_time: '09:00', close_time: '18:00' }, // Thu
      { employee_id: null, day_of_week: 5, is_open: 1, open_time: '09:00', close_time: '18:00' }, // Fri
      { employee_id: null, day_of_week: 6, is_open: 1, open_time: '09:00', close_time: '16:00' }, // Sat
    ];
    defaults.forEach(h => db.businessHours.insert(h));
  }

  // Services from static config
  if (db.services.count() === 0) {
    try {
      const { SERVICES } = require('../config/services');
      SERVICES.forEach((s, i) => db.services.insert({ ...s, is_active: 1, sort_order: i }));
    } catch { /* config not found */ }
  }

  // Default bot messages
  if (db.botMessages.count() === 0) {
    [
      { key: 'welcome_header',       label: 'Welcome Message',           description: 'First message customers see. Use {shop_name} as a placeholder.',                     value: "💈 *Welcome to {shop_name}!*\n\nHow can I help you today?" },
      { key: 'confirmed_footer',     label: 'Booking Confirmed — Footer', description: 'Text added after the booking summary when a customer confirms.',                     value: 'We look forward to seeing you! ✂️\n\n_To cancel or reschedule, contact us directly._' },
      { key: 'no_slots_message',     label: 'No Available Slots',        description: 'Shown when a chosen date has no open time slots.',                                    value: '😔 No open slots on that date. Please pick another day.' },
      { key: 'bot_paused_message',   label: 'Bot Paused Message',        description: 'Shown to all customers when the bot is paused from the dashboard.',                  value: '😊 We are currently unavailable via WhatsApp. Please call us at {shop_phone}.' },
      { key: 'select_employee_prompt', label: 'Select Barber Prompt',    description: 'Header shown before the list of available barbers.',                                  value: '💈 *Choose your barber:*' },
      { key: 'reminder_message',      label: 'Appointment Reminder',     description: 'Sent to the customer X hours before their appointment. Placeholders: {customer_name} {service_name} {barber_name} {date} {time} {booking_code} {shop_name} {shop_address}', value: "⏰ *Appointment Reminder*\n\nHi {customer_name}! 👋\n\nJust a reminder that you have an appointment at *{shop_name}*:\n\n✂️ Service : *{service_name}*\n💈 Barber  : *{barber_name}*\n📅 Date    : *{date}*\n⏰ Time    : *{time}*\n🎫 Code    : *{booking_code}*\n\n📍 {shop_address}\n\nSee you soon! 💈" },
    ].forEach(m => db.botMessages.insert(m));
  }

  // Bot messages — ensure any newly-added keys exist in older databases
  const newMessages = [
    { key: 'reminder_message',      label: 'Appointment Reminder',       description: 'Sent to the customer X hours before their appointment. Placeholders: {customer_name} {service_name} {barber_name} {date} {time} {booking_code} {shop_name} {shop_address}', value: "⏰ *Appointment Reminder*\n\nHi {customer_name}! 👋\n\nJust a reminder that you have an appointment at *{shop_name}*:\n\n✂️ Service : *{service_name}*\n💈 Barber  : *{barber_name}*\n📅 Date    : *{date}*\n⏰ Time    : *{time}*\n🎫 Code    : *{booking_code}*\n\n📍 {shop_address}\n\nSee you soon! 💈" },
    { key: 'new_customer_welcome',  label: 'New Customer Welcome',       description: 'Shown to first-time customers after they select a language. Use {shop_name} as a placeholder.', value: "🌟 *Welcome to {shop_name}!*\n\nWe're so glad you found us! As a first-time visitor, feel free to explore our services or jump straight into booking your first appointment. We look forward to meeting you! 💈" },
    { key: 'survey_prompt',         label: 'Survey — Rating Request',    description: 'Sent after a completed appointment. Placeholders: {name} {service} {barber}', value: "⭐ *How was your visit today, {name}?*\n\n✂️ _{service} with {barber}_\n\n1️⃣ ⭐ Poor\n2️⃣ ⭐⭐ Fair\n3️⃣ ⭐⭐⭐ Good\n4️⃣ ⭐⭐⭐⭐ Great\n5️⃣ ⭐⭐⭐⭐⭐ Excellent!\n\n_Reply with a number 1–5_" },
    { key: 'survey_thanks',         label: 'Survey — Thank You',         description: 'Sent after the customer submits their rating. Placeholders: {stars} {rating}', value: "🙏 *Thank you for your feedback!*\n\n{stars} ({rating}/5)\n\nWe appreciate it and look forward to seeing you again! 💈" },
  ];
  newMessages.forEach(m => {
    if (!db.botMessages.findOne(r => r.key === m.key)) db.botMessages.insert(m);
  });

  // Settings
  const settingDefaults = {
    bot_paused:           '0',
    allow_any_employee:   '1',
    shop_name:            process.env.SHOP_NAME        || "Jayden's Barbershop",
    shop_address:         process.env.SHOP_ADDRESS     || 'Paramaribo, Suriname',
    shop_phone:           process.env.SHOP_PHONE       || '',
    management_phone:     process.env.MANAGEMENT_PHONE || '',
    shop_email:           process.env.SHOP_EMAIL       || '',
    shop_instagram:       process.env.SHOP_INSTAGRAM   || '',
    google_maps_link:     process.env.GOOGLE_MAPS_LINK || '',
    currency:             process.env.CURRENCY         || 'SRD',
    timezone:             process.env.TIMEZONE         || 'America/Paramaribo',
    google_calendar_id:   process.env.GOOGLE_CALENDAR_ID !== 'primary' ? (process.env.GOOGLE_CALENDAR_ID || '') : '',
    shop_url:             process.env.SHOP_URL || '',   // public URL used in QR check-in links
    booking_days_ahead:   process.env.BOOKING_DAYS_AHEAD || '20',
    reminder_enabled:     '0',
    reminder_hours:       '24',
    survey_enabled:       '0',
    survey_delay_minutes: '30',
    new_customer_employee_id: '', // barber ID who handles all new customers
    barber_scan_pin:          '1234', // PIN for the barber-only QR scanner page
    checkin_window_enabled:   '0',   // 0 = open (any time), 1 = restricted to time window
    checkin_window_minutes:   '60',  // minutes before/after appointment start allowed for check-in
    takeover_keyword:     '#human',
    release_keyword:      '#bot',
    cs_phone_1:           '',
    cs_phone_2:           '',
    warning_1_threshold:  '1',
    warning_1_message:    '⚠️ Hi {name}, we noticed you missed your appointment. Please remember to cancel in advance if you can\'t make it. We look forward to seeing you soon! 💈',
    warning_2_threshold:  '2',
    warning_2_message:    '⚠️ Hi {name}, this is your second missed appointment. Repeated no-shows make it harder for us to serve other customers. Please cancel in advance when needed.',
    warning_3_threshold:  '3',
    warning_3_message:    '🚫 Hi {name}, after {count} missed appointments your booking privileges may be restricted. Please contact us directly to discuss.',
  };
  Object.entries(settingDefaults).forEach(([k, v]) => {
    if (!db.settings.has(k)) db.settings.set(k, v);
  });
}

seedIfEmpty();

// ── One-time migrations ───────────────────────────────────────────────────────
// Bump booking_days_ahead from old default (7 or 14) to 20
const currentDaysAhead = parseInt(db.settings.get('booking_days_ahead'), 10) || 0;
if (currentDaysAhead < 20) db.settings.set('booking_days_ahead', '20');

console.log('✅ Database ready (JSON file store)');

module.exports = db;
