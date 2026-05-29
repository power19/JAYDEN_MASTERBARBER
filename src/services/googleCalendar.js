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

// ── Google Calendar color palette ─────────────────────────────────────────────
// Exact hex values taken from the Google Calendar API (colorId 1–11).
// The dashboard employee color picker uses these same hex values, so the color
// shown in the admin UI always matches what appears in Google Calendar.
// Reference: https://developers.google.com/calendar/api/v3/reference/colors/get
const GCAL_COLORS = [
  { id: '1',  name: 'Lavender',  hex: '#7986cb' },
  { id: '2',  name: 'Sage',      hex: '#33b679' },
  { id: '3',  name: 'Grape',     hex: '#8e24aa' },
  { id: '4',  name: 'Flamingo',  hex: '#e67c73' },
  { id: '5',  name: 'Banana',    hex: '#f6c026' },
  { id: '6',  name: 'Tangerine', hex: '#f5511d' },
  { id: '7',  name: 'Peacock',   hex: '#039be5' },
  { id: '8',  name: 'Graphite',  hex: '#616161' },
  { id: '9',  name: 'Blueberry', hex: '#3f51b5' },
  { id: '10', name: 'Basil',     hex: '#0f9d58' },
  { id: '11', name: 'Tomato',    hex: '#d50000' },
];

/** Returns the Google Calendar colorId for a hex value, defaulting to '7' (Peacock). */
function hexToCalColorId(hex) {
  if (!hex) return '7';
  const match = GCAL_COLORS.find(c => c.hex === hex.toLowerCase());
  return match ? match.id : '7';
}


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
async function createAppointment({ service, startTime, endTime, customerName, bookingCode, calendarId, employeeName, employeeColor }) {
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
      colorId: hexToCalColorId(employeeColor),
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

/**
 * Delete a Google Calendar event (used when cancelling an appointment).
 */
async function cancelEvent({ calendarId, eventId }) {
  if (!calendarId || !eventId) return { success: false, error: 'Missing calendarId or eventId' };
  try {
    const cal = await _getCalendar();
    await cal.events.delete({ calendarId, eventId });
    console.log(`🗑️  Calendar event deleted: ${eventId}`);
    return { success: true };
  } catch (err) {
    console.error('❌ Google Calendar delete error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Update (patch) an existing Google Calendar event (used when rescheduling).
 */
async function updateEvent({ calendarId, eventId, startTime, endTime, service, customerName, bookingCode, employeeName, employeeColor }) {
  if (!calendarId || !eventId) return { success: false, error: 'Missing calendarId or eventId' };
  const timezone = process.env.TIMEZONE || 'America/Paramaribo';
  const currency = process.env.CURRENCY || 'SRD';
  try {
    const cal = await _getCalendar();
    const titleParts = [`💈 ${service.name}`, customerName];
    if (employeeName) titleParts.splice(1, 0, `(${employeeName})`);
    const patch = {
      summary: titleParts.join(' — '),
      description: [
        `📋 Service : ${service.name}`,
        employeeName ? `✂️  Barber  : ${employeeName}` : '',
        `👤 Customer: ${customerName}`,
        `🎫 Code    : ${bookingCode}`,
        `💰 Price   : ${currency} ${service.price}`,
        `⏱️  Duration: ${service.duration} min`,
        '',
        '🔄 Rescheduled via WhatsApp Bot',
      ].filter(Boolean).join('\n'),
      start: { dateTime: new Date(startTime).toISOString(), timeZone: timezone },
      end:   { dateTime: new Date(endTime).toISOString(),   timeZone: timezone },
      colorId: hexToCalColorId(employeeColor),
    };
    const res = await cal.events.patch({ calendarId, eventId, resource: patch });
    console.log(`✅ Calendar event rescheduled → ${res.data.htmlLink}`);
    return { success: true, eventId: res.data.id, eventLink: res.data.htmlLink };
  } catch (err) {
    console.error('❌ Google Calendar update error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch busy periods from a Google Calendar for a given date.
 *
 * Returns an array of { start: Date, end: Date, title: string }.
 * Returns [] on any error so a Calendar outage never blocks bookings.
 *
 * All-day events are intentionally ignored — they typically represent
 * holidays or reminders, not time-specific appointments.
 *
 * @param {string} calendarId   - The calendar to query
 * @param {string} dateStr      - 'YYYY-MM-DD'
 */
async function listEvents(calendarId, dateStr) {
  // Skip if no specific calendar is configured
  if (!calendarId || calendarId === 'primary') return [];

  try {
    const cal = await _getCalendar();

    // Fetch the full UTC day — covers all business hours for UTC±12 timezones
    const timeMin = `${dateStr}T00:00:00Z`;
    const timeMax = `${dateStr}T23:59:59Z`;

    const res = await cal.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy:      'startTime',
    });

    return (res.data.items || [])
      .filter(e => e.start?.dateTime)           // skip all-day events
      .map(e => ({
        start: new Date(e.start.dateTime),
        end:   new Date(e.end.dateTime),
        title: e.summary || '(blocked)',
      }));
  } catch (err) {
    console.error(`⚠️  Google Calendar read error for ${calendarId}:`, err.message);
    return [];  // fail open — don't prevent bookings if Calendar is unreachable
  }
}

module.exports = { createAppointment, cancelEvent, updateEvent, listEvents, GCAL_COLORS };
