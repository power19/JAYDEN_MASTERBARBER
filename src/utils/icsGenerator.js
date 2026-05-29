/**
 * Generates an iCalendar (.ics) file content for a booking.
 * Tapping the attachment on iPhone opens Apple Calendar.
 * Tapping on Android opens Google Calendar or the default calendar app.
 */

/**
 * Format a JS Date to iCal UTC string: YYYYMMDDTHHMMSSZ
 */
function toIcalDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Escape special characters in iCal text fields.
 */
function escIcal(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Fold long iCal lines (max 75 octets per RFC 5545).
 */
function foldLine(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let start = 0;
  while (start < line.length) {
    // Take up to 75 bytes (chars) on first line, 74 on continuation (1 byte for space)
    const limit = start === 0 ? 75 : 74;
    parts.push((start === 0 ? '' : ' ') + line.slice(start, start + limit));
    start += limit;
  }
  return parts.join('\r\n');
}

/**
 * Generate ICS file content for an appointment.
 *
 * @param {object} opts
 * @param {string}  opts.bookingCode
 * @param {string}  opts.customerName
 * @param {string}  opts.serviceName
 * @param {string}  opts.serviceEmoji
 * @param {number}  opts.serviceDuration  minutes
 * @param {Date}    opts.startTime
 * @param {Date}    opts.endTime
 * @param {string}  [opts.barberName]
 * @param {string}  [opts.shopName]
 * @param {string}  [opts.shopAddress]
 * @param {string}  [opts.shopPhone]
 */
function generateIcs(opts) {
  const {
    bookingCode, customerName, serviceName, serviceEmoji = '',
    startTime, endTime,
    barberName, shopName = "Jayden's Barbershop",
    shopAddress = '', shopPhone = '',
  } = opts;

  const now     = new Date();
  const uid     = `${bookingCode}-${now.getTime()}@jayden-barbershop`;
  const summary = escIcal(`${serviceEmoji} ${serviceName} — ${shopName}`);
  const descParts = [
    `Booking Code: ${bookingCode}`,
    customerName  ? `Customer: ${customerName}` : '',
    barberName    ? `Barber: ${barberName}` : '',
    shopPhone     ? `Phone: ${shopPhone}` : '',
  ].filter(Boolean);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${escIcal(shopName)}//Booking Bot//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcalDate(now)}`,
    `DTSTART:${toIcalDate(new Date(startTime))}`,
    `DTEND:${toIcalDate(new Date(endTime))}`,
    foldLine(`SUMMARY:${summary}`),
    foldLine(`DESCRIPTION:${escIcal(descParts.join('\\n'))}`),
    foldLine(`LOCATION:${escIcal(shopAddress)}`),
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.join('\r\n');
}

module.exports = { generateIcs };
