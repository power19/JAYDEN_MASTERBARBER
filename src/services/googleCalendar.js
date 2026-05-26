/**
 * Google Calendar Service — updated for multi-employee support.
 *
 * Each createAppointment() call accepts an optional calendarId so events
 * can go into an individual barber's calendar. Falls back to the global
 * GOOGLE_CALENDAR_ID env var, then to 'primary'.
 */
const { google } = require('googleapis');
const path       = require('path');

const DEFAULT_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';
const CREDENTIALS_PATH    = process.env.GOOGLE_CREDENTIALS_PATH ||
  path.join(process.cwd(), 'credentials', 'service-account.json');

let _auth = null;

async function _getAuth() {
  if (_auth) return _auth;
  _auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return _auth;
}

async function _getCalendar() {
  const auth   = await _getAuth();
  const client = await auth.getClient();
  return google.calendar({ version: 'v3', auth: client });
}

/**
 * Create a Google Calendar event for an appointment.
 * @param {object} opts
 * @param {object}  opts.service         - service object (name, emoji, duration, price)
 * @param {Date}    opts.startTime
 * @param {Date}    opts.endTime
 * @param {string}  opts.customerName
 * @param {string}  opts.customerPhone
 * @param {string}  [opts.calendarId]    - overrides the default calendar
 * @param {string}  [opts.employeeName]  - shown in event title
 */
async function createAppointment({ service, startTime, endTime, customerName, bookingCode, calendarId, employeeName }) {
  const timezone   = process.env.TIMEZONE || 'America/Paramaribo';
  const currency   = process.env.CURRENCY || 'SRD';
  const targetCal  = calendarId || DEFAULT_CALENDAR_ID;

  try {
    const cal = await _getCalendar();

    const titleParts = [`💈 ${service.name}`, customerName];
    if (employeeName) titleParts.splice(1, 0, `(${employeeName})`);

    const event = {
      summary: titleParts.join(' — '),
      description: [
        `📋 Service : ${service.name}`,
        employeeName ? `✂️  Barber  : ${employeeName}` : '',
        `👤 Customer: ${customerName}`,
        `🎫 Code    : ${bookingCode}`,
        `💰 Price   : ${currency} ${service.price}`,
        `⏱️  Duration: ${service.duration} min`,
        '',
        '📅 Booked via WhatsApp Bot',
      ].filter(Boolean).join('\n'),
      start: { dateTime: startTime.toISOString(), timeZone: timezone },
      end:   { dateTime: endTime.toISOString(),   timeZone: timezone },
      colorId: '1',
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    };

    const res = await cal.events.insert({ calendarId: targetCal, resource: event });
    console.log(`✅ Calendar event created → ${res.data.htmlLink}`);
    return { success: true, eventId: res.data.id, eventLink: res.data.htmlLink };
  } catch (err) {
    console.error('❌ Google Calendar error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { createAppointment };
