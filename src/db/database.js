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
    ].forEach(m => db.botMessages.insert(m));
  }

  // Settings
  const settingDefaults = {
    bot_paused:           '0',
    allow_any_employee:   '1',
    shop_name:            process.env.SHOP_NAME      || "Jayden's Barbershop",
    shop_address:         process.env.SHOP_ADDRESS   || 'Paramaribo, Suriname',
    shop_phone:           process.env.SHOP_PHONE     || '',
    shop_email:           process.env.SHOP_EMAIL     || '',
    shop_instagram:       process.env.SHOP_INSTAGRAM || '',
    google_maps_link:     process.env.GOOGLE_MAPS_LINK || '',
    currency:             process.env.CURRENCY       || 'SRD',
    timezone:             process.env.TIMEZONE       || 'America/Paramaribo',
  };
  Object.entries(settingDefaults).forEach(([k, v]) => {
    if (!db.settings.has(k)) db.settings.set(k, v);
  });
}

seedIfEmpty();
console.log('✅ Database ready (JSON file store)');

module.exports = db;
