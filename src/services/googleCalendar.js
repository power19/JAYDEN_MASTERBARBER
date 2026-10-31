/**
 * Google Calendar Service — updated for multi-employee support.
 *
 * Each createAppointment() call accepts an optional calendarId so events
 * can go into an individual barber's calendar. Falls back to the global
 * GOOGLE_CALENDAR_ID env var, then to 'primary'.
 */
const { google } = require('googleapis');
const path       = require('path');
const { mapsLinkFor } = require('../utils/geo');

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

// Colored-circle emoji per Google colorId. Google's mobile app shows every event
// on a *shared* calendar in one flat color, ignoring per-event colorId — so we also
// stamp a matching colored dot into the event title. The dot is plain text, so it
// survives in every client and lets viewers tell barbers apart at a glance.
const CIRCLE_BY_COLOR_ID = {
  '1': '🔵', '2': '🟢', '3': '🟣', '4': '🔴', '5': '🟡', '6': '🟠',
  '7': '🔵', '8': '⚫', '9': '🔵', '10': '🟢', '11': '🔴',
};

/** Returns a colored-circle emoji for a barber's hex color (matches the calendar colorId). */
function hexToCircleEmoji(hex) {
  return CIRCLE_BY_COLOR_ID[hexToCalColorId(hex)] || '🔵';
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
async function createAppointment({ service, startTime, endTime, customerName, bookingCode, calendarId, employeeName, employeeColor, houseCall }) {
  const timezone   = process.env.TIMEZONE || 'America/Paramaribo';
  const currency   = process.env.CURRENCY || 'SRD';
  const targetCal  = calendarId || DEFAULT_CALENDAR_ID;

  try {
    const cal = await _getCalendar();

    const dot = employeeName ? `${hexToCircleEmoji(employeeColor)} ` : '';
    const titleParts = [`💈 ${houseCall ? '🏠 ' : ''}${service.name}`, customerName];
    if (employeeName) titleParts.splice(1, 0, `(${employeeName})`);

    const event = {
      summary: dot + titleParts.join(' — '),
      description: [
        `📋 Service : ${service.name}`,
        employeeName ? `✂️  Barber  : ${employeeName}` : '',
        `👤 Customer: ${customerName}`,
        `🎫 Code    : ${bookingCode}`,
        `💰 Price   : ${currency} ${service.price}`,
        `⏱️  Duration: ${service.duration} min`,
        houseCall ? `🏠 House call: ${houseCall.distanceKm} km — ${mapsLinkFor(houseCall.lat, houseCall.lng)}` : '',
        houseCall?.address ? `📍 ${houseCall.address}` : '',
        '',
        '📅 Booked via WhatsApp Bot',
      ].filter(Boolean).join('\n'),
      ...(houseCall ? { location: houseCall.address || `${houseCall.lat},${houseCall.lng}` } : {}),
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
 * Create an all-day leave event on an employee's Google Calendar.
 * @param {object} opts
 * @param {string} opts.calendarId   - employee's personal calendar ID
 * @param {string} opts.employeeName
 * @param {string} opts.startDate    - 'YYYY-MM-DD'
 * @param {string} opts.endDate      - 'YYYY-MM-DD' (inclusive)
 * @param {string} [opts.reason]
 */
async function createLeaveEvent({ calendarId, employeeName, startDate, endDate, reason }) {
  if (!calendarId) return { success: false, error: 'No calendar configured for this employee' };
  try {
    const cal = await _getCalendar();

    // Google Calendar all-day end date is exclusive → add 1 day
    const endExclusive = new Date(endDate);
    endExclusive.setDate(endExclusive.getDate() + 1);
    const endStr = endExclusive.toISOString().split('T')[0];

    const event = {
      summary:     `🏖️ ${employeeName}${reason ? ` — ${reason}` : ' — Leave'}`,
      description: reason || 'Employee leave',
      start: { date: startDate },
      end:   { date: endStr },
      colorId: '8', // Graphite
    };

    const res = await cal.events.insert({ calendarId, resource: event });
    console.log(`✅ Leave event created → ${res.data.htmlLink}`);
    return { success: true, eventId: res.data.id };
  } catch (err) {
    console.error('❌ Google Calendar leave error:', err.message);
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
async function updateEvent({ calendarId, eventId, startTime, endTime, service, customerName, bookingCode, employeeName, employeeColor, statusLabel }) {
  if (!calendarId || !eventId) return { success: false, error: 'Missing calendarId or eventId' };
  const timezone = process.env.TIMEZONE || 'America/Paramaribo';
  const currency = process.env.CURRENCY || 'SRD';
  try {
    const cal = await _getCalendar();
    const dot = employeeName ? `${hexToCircleEmoji(employeeColor)} ` : '';
    const titleParts = [`💈 ${service.name}`, customerName];
    if (employeeName) titleParts.splice(1, 0, `(${employeeName})`);
    const patch = {
      summary: (statusLabel ? statusLabel + ' ' : '') + dot + titleParts.join(' — '),
      description: [
        `📋 Service : ${service.name}`,
        employeeName ? `✂️  Barber  : ${employeeName}` : '',
        `👤 Customer: ${customerName}`,
        `🎫 Code    : ${bookingCode}`,
        `💰 Price   : ${currency} ${service.price}`,
        `⏱️  Duration: ${service.duration} min`,
        '',
        statusLabel ? '🔄 Status updated via Kassa/Dashboard' : '🔄 Rescheduled via WhatsApp Bot',
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

/**
 * Share the main shop calendar with a barber's Gmail address.
 * Sends them a Google notification email automatically.
 * Requires the service account to have "Make changes and manage sharing" on the shop calendar.
 */
async function shareCalendarWithBarber(barberEmail) {
  const shopCalId = process.env.GOOGLE_CALENDAR_ID;
  if (!shopCalId || !barberEmail) return { success: false, error: 'Missing calendar ID or barber email' };
  try {
    const cal = await _getCalendar();
    await cal.acl.insert({
      calendarId:        shopCalId,
      sendNotifications: true,
      resource: {
        role:  'reader',
        scope: { type: 'user', value: barberEmail },
      },
    });
    console.log(`✅ Shop calendar shared with ${barberEmail}`);
    return { success: true };
  } catch (err) {
    // 'already exists' is fine — barber already has access
    if (err.message?.includes('Already Exists') || err.code === 409) {
      console.log(`ℹ️  Calendar already shared with ${barberEmail}`);
      return { success: true };
    }
    console.error(`❌ Failed to share calendar with ${barberEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Revoke a barber's access to the main shop calendar.
 */
async function revokeCalendarShare(barberEmail) {
  const shopCalId = process.env.GOOGLE_CALENDAR_ID;
  if (!shopCalId || !barberEmail) return { success: false };
  try {
    const cal = await _getCalendar();
    await cal.acl.delete({ calendarId: shopCalId, ruleId: `user:${barberEmail}` });
    console.log(`🗑️  Calendar access revoked for ${barberEmail}`);
    return { success: true };
  } catch (err) {
    console.error(`⚠️  Failed to revoke calendar for ${barberEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { createAppointment, cancelEvent, updateEvent, listEvents, createLeaveEvent, shareCalendarWithBarber, revokeCalendarShare, GCAL_COLORS };
