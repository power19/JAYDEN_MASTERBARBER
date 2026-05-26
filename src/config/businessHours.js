/**
 * Business Hours
 *
 * Keys: 0 = Sunday … 6 = Saturday
 * Set a day to null to mark it as CLOSED.
 * open / close must be in "HH:MM" 24-hour format.
 *
 * SLOT_INTERVAL  → gap between bookable start times (minutes)
 * BOOKING_DAYS_AHEAD → how far in the future customers can book
 */

const BUSINESS_HOURS = {
  0: null,                              // Sunday   — Closed
  1: { open: '09:00', close: '18:00' },// Monday
  2: { open: '09:00', close: '18:00' },// Tuesday
  3: { open: '09:00', close: '18:00' },// Wednesday
  4: { open: '09:00', close: '18:00' },// Thursday
  5: { open: '09:00', close: '18:00' },// Friday
  6: { open: '09:00', close: '16:00' },// Saturday
};

const SLOT_INTERVAL    = 30; // minutes between slot start times
const BOOKING_DAYS_AHEAD = parseInt(process.env.BOOKING_DAYS_AHEAD) || 14;
const TIMEZONE         = process.env.TIMEZONE || 'America/Paramaribo';

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

module.exports = { BUSINESS_HOURS, SLOT_INTERVAL, BOOKING_DAYS_AHEAD, TIMEZONE, DAY_NAMES };
