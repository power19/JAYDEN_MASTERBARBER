/**
 * Date & time helpers for the booking flow.
 */
const {
  BUSINESS_HOURS,
  SLOT_INTERVAL,
  BOOKING_DAYS_AHEAD,
  TIMEZONE,
} = require('../config/businessHours');

/**
 * Returns the next N open business days (up to 7 shown to the user).
 */
function getAvailableDates() {
  const dates = [];
  const today = new Date();

  for (let i = 0; i <= BOOKING_DAYS_AHEAD && dates.length < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    d.setHours(0, 0, 0, 0);

    const dow = d.getDay();
    if (!BUSINESS_HOURS[dow]) continue; // closed

    const opts = { timeZone: TIMEZONE };
    dates.push({
      date: d,
      dayOfWeek: dow,
      dayName:     d.toLocaleDateString('en-US', { weekday: 'long',  ...opts }),
      displayDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...opts }),
      fullDisplay: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...opts }),
    });
  }
  return dates;
}

/**
 * Generates all possible slot start times for `date` given `serviceDuration` minutes.
 * A slot is valid when [start, start+duration] fits entirely within open hours.
 */
function generateTimeSlots(date, serviceDuration) {
  const dow   = date.getDay();
  const hours = BUSINESS_HOURS[dow];
  if (!hours) return [];

  const [openH,  openM]  = hours.open.split(':').map(Number);
  const [closeH, closeM] = hours.close.split(':').map(Number);
  const openMins  = openH  * 60 + openM;
  const closeMins = closeH * 60 + closeM;

  const slots = [];
  for (let m = openMins; m + serviceDuration <= closeMins; m += SLOT_INTERVAL) {
    const h = Math.floor(m / 60);
    const min = m % 60;

    const start = new Date(date);
    start.setHours(h, min, 0, 0);

    const end = new Date(start.getTime() + serviceDuration * 60_000);

    slots.push({
      time:    `${pad(h)}:${pad(min)}`,
      display: toAmPm(h, min),
      start,
      end,
    });
  }
  return slots;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function pad(n) {
  return String(n).padStart(2, '0');
}

function toAmPm(hour, min) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${h}:${pad(min)} ${period}`;
}

module.exports = { getAvailableDates, generateTimeSlots };
