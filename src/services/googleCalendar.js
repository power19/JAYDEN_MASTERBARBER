/**
 * Google Calendar Service
 *
 * Uses a Service Account for server-to-server auth (no user sign-in needed).
 * The service account must be shared on the barber's calendar with
 * "Make changes to events" permission.
 *
 * See README.md → Google Calendar Setup for full instructions.
 */
const { google } = require('googleapis');
const path       = require('path');
const { TIMEZONE } = require('../config/businessHours');

const CALENDAR_ID      = process.env.GOOGLE_CALENDAR_ID      || 'primary';
const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH ||
  path.join(process.cwd(), 'credentials', 'service-account.json');

let _calendar = null; // singleton

async function _getCalendar() {
  if (_calendar) return _calendar;

  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  const client = await auth.getClient();
  _calendar = google.calendar({ version: 'v3', auth: client });
  console.log('✅ Google Calendar connected');
  return _calendar;
}

/**
 * From a list of generated slots, remove any that overlap existing calendar events.
 * Falls back to returning all slots if the Calendar API is unreachable.
 */
async function getAvailableSlots(date, slots) {
  try {
    const cal = await _getCalendar();

    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(date); dayEnd.setHours(23, 59, 59, 999);

    const res = await cal.events.list({
      calendarId: CALENDAR_ID,
      timeMin:    dayStart.toISOString(),
      timeMax:    dayEnd.toISOString(),
      singleEvents: true,
      orderBy:    'startTime',
    });

    const events = res.data.items || [];

    return slots.filter(slot =>
      !events.some(ev => {
        if (!ev.start.dateTime) return false; // skip all-day events
        const evStart = new Date(ev.start.dateTime);
        const evEnd   = new Date(ev.end.dateTime);
        return slot.start < evEnd && slot.end > evStart;
      })
    );
  } catch (err) {
    console.error('⚠️  Calendar read error (showing all slots as fallback):', err.message);
    return slots; // graceful degradation
  }
}

/**
 * Creates a Google Calendar event for the booked appointment.
 * Returns { success, eventId, eventLink } or { success: false, error }.
 */
async function createAppointment({ service, startTime, endTime, customerName, customerPhone }) {
  try {
    const cal = await _getCalendar();

    const event = {
      summary: `💈 ${service.name} — ${customerName}`,
      description: [
        `📋 Service : ${service.name}`,
        `👤 Customer: ${customerName}`,
        `📱 WhatsApp: +${customerPhone}`,
        `💰 Price   : ${process.env.CURRENCY || 'SRD'} ${service.price}`,
        `⏱️  Duration: ${service.duration} min`,
        '',
        '📅 Booked via WhatsApp Bot',
      ].join('\n'),
      start: { dateTime: startTime.toISOString(), timeZone: TIMEZONE },
      end:   { dateTime: endTime.toISOString(),   timeZone: TIMEZONE },
      colorId: '1', // Tomato red — easy to spot
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    };

    const res = await cal.events.insert({
      calendarId: CALENDAR_ID,
      resource:   event,
    });

    console.log(`✅ Calendar event created: ${res.data.htmlLink}`);
    return { success: true, eventId: res.data.id, eventLink: res.data.htmlLink };
  } catch (err) {
    console.error('❌ Calendar write error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { getAvailableSlots, createAppointment };
