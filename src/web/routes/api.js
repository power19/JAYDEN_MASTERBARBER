/**
 * REST API for the admin dashboard.
 * All routes are under /api and require authentication.
 */
const express   = require('express');
const router    = express.Router();
const q                  = require('../../db/queries');
const { state: waState, update: waUpdate } = require('../../whatsapp-state');
const { GCAL_COLORS, cancelEvent, createLeaveEvent } = require('../../services/googleCalendar');
const { getClient }      = require('../../whatsapp-client');
const chatPause          = require('../../utils/chatPause');
const { startBot }       = require('../../bot-runner');

// ── Auth middleware ───────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// ── Auth ──────────────────────────────────────────────────────────────────────

router.post('/auth/login', (req, res) => {
  const { password } = req.body;
  const adminPw = process.env.ADMIN_PASSWORD || 'admin';
  if (password === adminPw) {
    req.session.authenticated = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Wrong password' });
  }
});

router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/auth/status', (req, res) => {
  res.json({ authenticated: !!req.session?.authenticated });
});

// ── WhatsApp status (no auth — needed to show QR before login) ───────────────
// Returns connection status and QR data URL when available.
// The QR image itself is safe to expose publicly — it's a one-time-use code
// and expires in ~60 seconds anyway.
router.get('/whatsapp/status', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    status:      waState.status,
    lastUpdated: waState.lastUpdated,
  });
});

// ── WhatsApp QR image (no auth — PNG bytes, cache-busted by ?t= timestamp) ───
// Serving as real PNG bytes (not a base64 data URL) guarantees every browser
// fetches the latest image when the URL's ?t= query-string changes.
router.get('/whatsapp/qr', (req, res) => {
  if (waState.status !== 'qr' || !waState.qrDataUrl) {
    return res.status(404).end();
  }
  const base64 = waState.qrDataUrl.replace(/^data:image\/png;base64,/, '');
  const buf    = Buffer.from(base64, 'base64');
  res.set('Content-Type',  'image/png');
  res.set('Cache-Control', 'no-store');
  res.send(buf);
});

// ── WhatsApp reconnect (auth-protected) ──────────────────────────────────────
// POST /api/whatsapp/reconnect — tears down the existing session and calls
// client.initialize() again so a fresh QR is generated without a server restart.
// Only works when the bot is running (status !== 'not-running').

// ── Apply auth to all routes below ───────────────────────────────────────────
router.use(requireAuth);

// Works for all states: not-running, disconnected, or stuck.
// startBot() is idempotent — safe to call even if already active.
router.post('/whatsapp/reconnect', async (req, res) => {
  try {
    await startBot();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

router.get('/dashboard', (req, res) => {
  try {
    const stats    = q.getDashboardStats();
    const today    = q.getTodayAppointments();
    const upcoming = q.getAppointments({ limit: 10 }).filter(a =>
      new Date(a.start_time) > new Date() && a.status !== 'cancelled'
    ).slice(0, 5);
    res.json({ stats, today, upcoming });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Available slots ───────────────────────────────────────────────────────────
// GET /api/slots?employee_id=&date=YYYY-MM-DD&duration=30
// Returns array of "HH:MM" strings the employee is free for that duration.
router.get('/slots', async (req, res) => {
  try {
    const { employee_id, date, duration } = req.query;
    if (!employee_id || !date || !duration)
      return res.status(400).json({ error: 'employee_id, date and duration are required' });
    const employee = q.getEmployee(employee_id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    const slots = await q.getAvailableSlotsForEmployee(employee, new Date(date + 'T00:00:00'), +duration);
    res.json(slots.map(s => s.time)); // just the "HH:MM" strings
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Appointments ──────────────────────────────────────────────────────────────

router.get('/appointments', (req, res) => {
  try {
    const { date, employee_id, status } = req.query;
    res.json(q.getAppointments({ date, employeeId: employee_id, status }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/appointments', async (req, res) => {
  try {
    const result = q.createAppointment(req.body);
    const id     = result.lastInsertRowid;

    // Auto-sync to Google Calendar (non-fatal if it fails)
    let calendarSynced = false;
    try {
      const { createAppointment: calCreate } = require('../../services/googleCalendar');
      const employee    = req.body.employee_id ? q.getEmployee(req.body.employee_id) : null;
      const shopCalId   = q.getSetting('google_calendar_id') ||
        (process.env.GOOGLE_CALENDAR_ID !== 'primary' ? process.env.GOOGLE_CALENDAR_ID : null);
      const barberCalId = employee?.google_calendar_id || null;

      if (shopCalId || barberCalId) {
        const eventData = {
          service:       { name: req.body.service_name, emoji: req.body.service_emoji, duration: req.body.service_duration, price: req.body.service_price },
          startTime:     new Date(req.body.start_time),
          endTime:       new Date(req.body.end_time),
          customerName:  req.body.customer_name,
          bookingCode:   result.booking_code,
          employeeName:  employee?.name,
          employeeColor: employee?.color,
        };
        // Shop calendar — always
        if (shopCalId) {
          const r = await calCreate({ ...eventData, calendarId: shopCalId });
          if (r.success) {
            q.updateAppointment(id, { google_event_id: r.eventId, google_event_link: r.eventLink });
            calendarSynced = true;
          }
        }
        // Barber's personal calendar — if different from shop calendar
        if (barberCalId && barberCalId !== shopCalId)
          await calCreate({ ...eventData, calendarId: barberCalId });
      }
    } catch (calErr) {
      console.error('⚠️  Calendar sync skipped:', calErr.message);
    }

    res.json({ ok: true, id, calendarSynced });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/appointments/:id', async (req, res) => {
  try {
    const appt = q.getAppointmentById(req.params.id);
    q.updateAppointment(req.params.id, req.body);

    // When status changes to no-show, check warning thresholds and notify customer
    if (req.body.status === 'no-show' && appt?.customer_phone) {
      try {
        const phone    = appt.customer_phone.replace(/\D/g, '');
        const count    = q.getNoShowCount(appt.customer_phone);
        const client   = getClient();

        if (client && phone) {
          for (let i = 1; i <= 3; i++) {
            const threshold = parseInt(q.getSetting(`warning_${i}_threshold`), 10);
            const message   = q.getSetting(`warning_${i}_message`) || '';
            if (threshold > 0 && count === threshold && message) {
              const text = message
                .replace(/\{name\}/g,  appt.customer_name || 'there')
                .replace(/\{count\}/g, count);
              client.sendMessage(`${phone}@c.us`, text)
                .catch(e => console.error(`⚠️  Warning ${i} send failed:`, e.message));
              console.log(`⚠️  No-show warning ${i} sent to ${appt.customer_name} (${count} no-shows)`);
              break; // only send the first matching warning
            }
          }
        }
      } catch (e) {
        console.error('⚠️  No-show warning check failed:', e.message);
      }
    }

    // When status changes to cancelled, remove the Google Calendar event
    if (req.body.status === 'cancelled' && appt?.google_event_id) {
      const shopCalId = q.getSetting('google_calendar_id') ||
        (process.env.GOOGLE_CALENDAR_ID !== 'primary' ? process.env.GOOGLE_CALENDAR_ID : null);

      // Delete from shop calendar
      if (shopCalId) {
        cancelEvent({ calendarId: shopCalId, eventId: appt.google_event_id })
          .catch(e => console.error('⚠️  Calendar cancel (shop):', e.message));
      }

      // Delete from barber's personal calendar if set
      const employee = appt.employee_id ? q.getEmployee(appt.employee_id) : null;
      if (employee?.google_calendar_id) {
        cancelEvent({ calendarId: employee.google_calendar_id, eventId: appt.google_event_id })
          .catch(e => console.error('⚠️  Calendar cancel (barber):', e.message));
      }
    }

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/appointments/:id/sync-calendar
// Retroactively create a Google Calendar event for an appointment that missed it.
router.post('/appointments/:id/sync-calendar', async (req, res) => {
  try {
    const appts = q.getAppointments({});
    const appt  = appts.find(a => String(a.id) === String(req.params.id));
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    const employee    = appt.employee_id ? q.getEmployee(appt.employee_id) : null;
    const shopCalId   = q.getSetting('google_calendar_id') ||
      (process.env.GOOGLE_CALENDAR_ID !== 'primary' ? process.env.GOOGLE_CALENDAR_ID : null);
    const barberCalId = employee?.google_calendar_id || null;

    if (!shopCalId && !barberCalId)
      return res.status(400).json({ error: 'No calendar configured. Set a Calendar ID in Settings.' });

    const { createAppointment: calCreate } = require('../../services/googleCalendar');
    const eventData = {
      service:       { name: appt.service_name, emoji: appt.service_emoji, duration: appt.service_duration, price: appt.service_price },
      startTime:     new Date(appt.start_time),
      endTime:       new Date(appt.end_time),
      customerName:  appt.customer_name,
      bookingCode:   appt.booking_code,
      employeeName:  employee?.name,
      employeeColor: employee?.color,
    };

    // Shop calendar — always (owner sees all appointments)
    let shopResult = { success: false, error: 'No shop calendar set' };
    if (shopCalId) {
      shopResult = await calCreate({ ...eventData, calendarId: shopCalId });
      if (shopResult.success) q.updateAppointment(appt.id, { google_event_id: shopResult.eventId, google_event_link: shopResult.eventLink });
    }

    // Barber's personal calendar — if configured and different from shop calendar
    if (barberCalId && barberCalId !== shopCalId)
      await calCreate({ ...eventData, calendarId: barberCalId });

    if (!shopResult.success && !barberCalId)
      return res.status(500).json({ error: shopResult.error });

    res.json({ ok: true, eventLink: shopResult.eventLink });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Reminder test — sends the reminder for one appointment without marking it sent
router.post('/reminders/test/:bookingCode', async (req, res) => {
  try {
    const { getClient }    = require('../../whatsapp-client');
    const { state: waState } = require('../../whatsapp-state');
    const client = getClient();
    if (!client || waState.status !== 'ready')
      return res.status(503).json({ error: 'WhatsApp bot is not connected. Start the bot first.' });

    const appts = q.getAppointments({});
    const appt  = appts.find(a => a.booking_code === req.params.bookingCode.toUpperCase());
    if (!appt) return res.status(404).json({ error: 'Booking code not found' });

    const { checkReminders } = require('../../reminder-scheduler');
    // Temporarily call sendReminder directly (import the internals via the scheduler module)
    const employee = appt.employee_id ? q.getEmployee(appt.employee_id) : null;
    const tz       = q.getSetting('timezone') || 'America/Paramaribo';
    const start    = new Date(appt.start_time);
    const dateStr  = start.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: tz });
    const timeStr  = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz });

    const template = q.getBotMessage('reminder_message') || '⏰ Reminder: {service_name} on {date} at {time}. Code: {booking_code}';
    const message  = template
      .replace(/{customer_name}/g,  appt.customer_name      || '')
      .replace(/{service_name}/g,   appt.service_name       || '')
      .replace(/{barber_name}/g,    employee?.name          || 'your barber')
      .replace(/{date}/g,           dateStr)
      .replace(/{time}/g,           timeStr)
      .replace(/{booking_code}/g,   appt.booking_code       || '')
      .replace(/{shop_name}/g,      q.getSetting('shop_name')    || "Jayden's Barbershop")
      .replace(/{shop_address}/g,   q.getSetting('shop_address') || '');

    const waId = appt.customer_phone.includes('@') ? appt.customer_phone : `${appt.customer_phone}@c.us`;
    await client.sendMessage(waId, message);
    res.json({ ok: true, sentTo: appt.customer_name, waId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Color palette (Google Calendar colors) ────────────────────────────────────
router.get('/colors', (req, res) => res.json(GCAL_COLORS));

// ── Employees ─────────────────────────────────────────────────────────────────

router.get('/employees', (req, res) => {
  try {
    const employees = q.getEmployees().map(e => ({
      ...e,
      isAwayToday: q.isEmployeeAwayToday(e.id),
    }));
    res.json(employees);
  }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/employees', (req, res) => {
  try {
    const { name, phone, color, google_calendar_id, excluded_service_ids } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const result = q.createEmployee(name, phone, color, google_calendar_id, excluded_service_ids || []);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/employees/:id', (req, res) => {
  try {
    q.updateEmployee(req.params.id, req.body);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/employees/:id/away', (req, res) => {
  try {
    const isAway = q.toggleEmployeeAwayToday(req.params.id);
    res.json({ ok: true, isAway });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/employees/:id/toggle', (req, res) => {
  try {
    q.toggleEmployee(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Business Hours ────────────────────────────────────────────────────────────

// GET global hours
router.get('/hours', (req, res) => {
  try { res.json(q.getWeeklyHours(null)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT global hours
router.put('/hours', (req, res) => {
  try {
    q.setWeeklyHours(null, req.body);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET employee-specific hours
router.get('/hours/:employeeId', (req, res) => {
  try { res.json(q.getWeeklyHours(req.params.employeeId)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT employee-specific hours
router.put('/hours/:employeeId', (req, res) => {
  try {
    q.setWeeklyHours(req.params.employeeId, req.body);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Services ──────────────────────────────────────────────────────────────────

router.get('/services', (req, res) => {
  try { res.json(q.getAllServices()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/services', (req, res) => {
  try {
    const id = `svc_${Date.now()}`;
    const count = q.getAllServices().length;
    q.upsertService({ ...req.body, id, sort_order: count });
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/services/:id', (req, res) => {
  try {
    q.upsertService({ ...req.body, id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/services/:id/toggle', (req, res) => {
  try { q.toggleService(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/services/:id', (req, res) => {
  try { q.deleteService(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Bot Messages ──────────────────────────────────────────────────────────────

router.get('/messages', (req, res) => {
  try { res.json(q.getBotMessages()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/messages', (req, res) => {
  try {
    q.setManyMessages(req.body);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Settings ──────────────────────────────────────────────────────────────────

router.get('/settings', (req, res) => {
  try { res.json(q.getAllSettings()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/settings', (req, res) => {
  try {
    q.setManySettings(req.body);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/settings/test-calendar — verifies the Calendar ID is accessible
router.post('/settings/test-calendar', async (req, res) => {
  const { calendarId } = req.body;
  if (!calendarId) return res.status(400).json({ error: 'No Calendar ID provided' });
  try {
    const { google } = require('googleapis');
    const path       = require('path');
    const credPath   = process.env.GOOGLE_CREDENTIALS_PATH ||
      path.join(process.cwd(), 'credentials', 'service-account.json');
    const auth = new google.auth.GoogleAuth({
      keyFile: credPath,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const client = await auth.getClient();
    const cal    = google.calendar({ version: 'v3', auth: client });
    const r      = await cal.calendars.get({ calendarId });
    res.json({ ok: true, name: r.data.summary, timezone: r.data.timeZone });
  } catch (e) {
    const msg = e.message.includes('Not Found')
      ? 'Calendar not found — check the ID and make sure it\'s shared with the service account'
      : e.message.includes('disabled')
      ? 'Google Calendar API is not enabled in Google Cloud Console'
      : e.message.includes('ENOENT')
      ? 'Service account file not found at credentials/service-account.json'
      : e.message;
    res.status(400).json({ error: msg });
  }
});

// ── Customer Profiles ─────────────────────────────────────────────────────────

router.get('/customers', (req, res) => {
  try { res.json(q.getAllCustomersWithStats()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/customers/:id', (req, res) => {
  try {
    q.updateCustomer(req.params.id, req.body);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/customers/:id/block', (req, res) => {
  try {
    q.blockCustomer(req.params.id, req.body.reason || '');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/customers/:id/unblock', (req, res) => {
  try {
    q.unblockCustomer(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/customers/:id/phones', (req, res) => {
  try {
    const phone = (req.body.phone || '').replace(/\D/g, '');
    if (!phone) return res.status(400).json({ error: 'Phone number required' });
    q.addPhoneToCustomer(req.params.id, phone);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/customers/:id/phones/:phone', (req, res) => {
  try {
    q.removePhoneFromCustomer(req.params.id, req.params.phone);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Human Takeover ────────────────────────────────────────────────────────────

router.get('/chat-pauses', (req, res) => {
  res.json(chatPause.getPausedChats());
});

router.post('/chat-pauses/:chatId/resume', (req, res) => {
  chatPause.resumeChat(decodeURIComponent(req.params.chatId));
  res.json({ ok: true });
});

// ── Employee Leave ────────────────────────────────────────────────────────────

router.get('/leaves', (req, res) => {
  try {
    const { employee_id, month } = req.query;
    res.json(q.getLeaves({ employeeId: employee_id, month }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/leaves', async (req, res) => {
  try {
    const { employee_id, start_date, end_date, reason } = req.body;
    if (!employee_id || !start_date) return res.status(400).json({ error: 'employee_id and start_date required' });
    if (end_date && end_date < start_date) return res.status(400).json({ error: 'end_date must be on or after start_date' });

    // Create Google Calendar all-day event on the employee's personal calendar
    const employee = q.getEmployee(employee_id);
    let googleEventId = '';
    if (employee?.google_calendar_id) {
      const gcalResult = await createLeaveEvent({
        calendarId:   employee.google_calendar_id,
        employeeName: employee.name,
        startDate:    start_date,
        endDate:      end_date || start_date,
        reason,
      });
      if (gcalResult.success) googleEventId = gcalResult.eventId;
    }

    const result = q.addLeave({
      employeeId:    employee_id,
      startDate:     start_date,
      endDate:       end_date || start_date,
      reason,
      googleEventId,
    });
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/leaves/:id', async (req, res) => {
  try {
    const leave    = q.getLeave(req.params.id);
    const employee = leave?.employee_id ? q.getEmployee(leave.employee_id) : null;

    // Remove from Google Calendar
    if (leave?.google_event_id && employee?.google_calendar_id) {
      cancelEvent({ calendarId: employee.google_calendar_id, eventId: leave.google_event_id })
        .catch(e => console.error('⚠️  Leave calendar delete:', e.message));
    }

    q.deleteLeave(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Surinamese Public Holidays ────────────────────────────────────────────────

router.get('/holidays/:year', (req, res) => {
  try { res.json(q.getSurinameseHolidays(req.params.year)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/holidays/sync', (req, res) => {
  try {
    const year   = parseInt(req.body.year, 10) || new Date().getFullYear();
    const result = q.syncSurinameseHolidays(year);
    res.json({ ok: true, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Blocked Dates (shop closures, barber days-off, time blocks) ───────────────

router.get('/blocks', (req, res) => {
  try {
    const { date, employee_id } = req.query;
    res.json(q.getBlocks({ date, employeeId: employee_id }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/blocks', (req, res) => {
  try {
    const result = q.addBlock(req.body);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/blocks/:id', (req, res) => {
  try {
    q.deleteBlock(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
