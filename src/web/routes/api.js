/**
 * REST API for the admin dashboard.
 * All routes are under /api and require authentication.
 */
const express   = require('express');
const router    = express.Router();
const q                  = require('../../db/queries');
const { state: waState, update: waUpdate } = require('../../whatsapp-state');
const { GCAL_COLORS, cancelEvent, createLeaveEvent, updateEvent: calUpdate } = require('../../services/googleCalendar');
const { getClient }      = require('../../whatsapp-client');
const chatPause          = require('../../utils/chatPause');
const { startBot }       = require('../../bot-runner');

// ── Auth middleware ───────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

/**
 * Best-effort: mark a completed/no-show appointment's Google Calendar event
 * with a status label, so the event itself (not just the local record)
 * reflects what happened — useful as a recovery fallback if local data is
 * ever lost. Never throws; a Calendar hiccup must never block the caller.
 */
async function syncCalendarStatus(appt, statusLabel) {
  if (!appt?.google_event_id) return; // never synced to Calendar — nothing to patch
  try {
    const calendarId = q.getSetting('google_calendar_id') ||
      (process.env.GOOGLE_CALENDAR_ID !== 'primary' ? process.env.GOOGLE_CALENDAR_ID : null);
    if (!calendarId) return;
    const employee = appt.employee_id ? q.getEmployee(appt.employee_id) : null;
    await calUpdate({
      calendarId, eventId: appt.google_event_id,
      startTime: new Date(appt.start_time), endTime: new Date(appt.end_time),
      service: { name: appt.service_name, price: appt.service_price, duration: appt.service_duration },
      customerName: appt.customer_name, bookingCode: appt.booking_code,
      employeeName: employee?.name || appt.employee_name, employeeColor: employee?.color,
      statusLabel,
    });
  } catch (e) { console.error('⚠️  Calendar status sync failed:', e.message); }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

router.post('/auth/login', (req, res) => {
  const { password } = req.body;
  const adminPw = q.getSetting('admin_password') || process.env.ADMIN_PASSWORD || 'admin';
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

router.post('/auth/change-password', requireAuth, (req, res) => {
  const { current, newPassword } = req.body;
  const adminPw = q.getSetting('admin_password') || process.env.ADMIN_PASSWORD || 'admin';
  if (current !== adminPw) return res.status(400).json({ error: 'Current password is incorrect' });
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'New password must be at least 4 characters' });
  q.setSetting('admin_password', newPassword);
  res.json({ ok: true });
});

router.get('/auth/status', (req, res) => {
  res.json({ authenticated: !!req.session?.authenticated });
});

// ── Public scan page routes (no admin auth — separate barber PIN system) ────────

/** Minimal public settings for the scan page (shop name only). */
router.get('/settings-public', (req, res) => {
  res.json({ shop_name: q.getSetting('shop_name') || "Jayden's Barbershop" });
});

/** Validate shop scanner PIN — single PIN configured in Settings → Rules. */
router.post('/scan/auth', (req, res) => {
  const { pin }      = req.body;
  const correctPin   = q.getSetting('barber_scan_pin') || '1234';
  if (String(pin) === String(correctPin)) {
    req.session.barberAuthenticated = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'Wrong PIN' });
  }
});

/** Barber check-in — requires barber PIN session (NOT admin auth), or the PIN
 *  itself in the body for server-to-server calls (e.g. the Kassa marking a
 *  booking complete when it's paid at the register — no shared session to use).
 *  Unlike /scan/auth, this path has NO fallback default — if barber_scan_pin
 *  isn't explicitly configured, the PIN-in-body path can never succeed. */
router.post('/scan/checkin/:code', (req, res) => {
  const configuredPin = q.getSetting('barber_scan_pin');
  const pinOk = !!configuredPin && req.body?.pin && String(req.body.pin) === String(configuredPin);
  if (!pinOk && !req.session?.barberAuthenticated && !req.session?.authenticated) {
    return res.status(401).json({ ok: false, message: 'Not authenticated — please enter your PIN' });
  }
  try {
    const appt = q.getAppointmentByCode(req.params.code);
    if (!appt) return res.status(404).json({ ok: false, message: 'Booking code not found' });
    if (appt.status === 'cancelled') return res.json({ ok: false, message: 'Appointment was cancelled' });
    if (appt.status === 'no-show')   return res.json({ ok: false, message: 'Marked as no-show' });
    if (appt.status === 'completed') return res.json({ ok: false, already: true, message: 'Already checked in', customer_name: appt.customer_name, service_name: appt.service_name, service_emoji: appt.service_emoji || '✂️', employee_name: appt.employee_name || '—' });

    // Optional time-window check
    if (q.getSetting('checkin_window_enabled') === '1') {
      const windowMin  = parseInt(q.getSetting('checkin_window_minutes'), 10) || 60;
      const apptTime   = new Date(appt.start_time).getTime();
      const now        = Date.now();
      const diffMin    = (now - apptTime) / 60000; // negative = before appt, positive = after
      if (diffMin < -windowMin || diffMin > windowMin) {
        const when = diffMin < 0
          ? `opens in ${Math.round(-diffMin)} min`
          : `expired ${Math.round(diffMin)} min ago`;
        return res.json({ ok: false, message: `Check-in window not open (${when}). Window: ±${windowMin} min.` });
      }
    }

    q.updateAppointment(appt.id, { status: 'completed' });
    syncCalendarStatus(appt, '✅'); // best-effort, not awaited — never delays the check-in response
    const employee    = appt.employee_id ? q.getEmployee(appt.employee_id) : null;
    const scannedBy   = req.session.barberEmployeeName || 'Admin';
    console.log(`✅ Check-in by ${scannedBy}: ${appt.customer_name} — ${appt.booking_code}`);
    res.json({
      ok:            true,
      customer_name: appt.customer_name,
      service_name:  appt.service_name,
      service_emoji: appt.service_emoji || '✂️',
      employee_name: employee?.name || appt.employee_name || '—',
      booking_code:  appt.booking_code,
    });
  } catch (e) { res.status(500).json({ ok: false, message: e.message }); }
});

// ── QR Check-In (public — no auth, accessed by barber scanning customer's QR) ──

const QRCode = require('qrcode');

router.get('/checkin/:code', (req, res) => {
  const shop = q.getSetting('shop_name') || "Jayden's Barbershop";

  function page(icon, title, subtitle, detailHtml, color) {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — ${shop}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
  .card{background:#fff;border-radius:24px;padding:40px 28px;max-width:380px;width:100%;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.10)}
  .icon{font-size:64px;line-height:1;margin-bottom:16px}
  .title{font-size:22px;font-weight:800;color:#0f172a;margin-bottom:6px}
  .sub{font-size:14px;color:#64748b;margin-bottom:24px}
  .detail{background:#f1f5f9;border-radius:14px;padding:16px 18px;text-align:left;font-size:14px;line-height:2;color:#374151}
  .detail strong{color:#0f172a}
  .badge{display:inline-block;background:${color};color:#fff;font-weight:700;border-radius:99px;padding:5px 18px;font-size:13px;margin-top:22px}
</style>
</head><body>
  <div class="card">
    <div class="icon">${icon}</div>
    <div class="title">${title}</div>
    <div class="sub">${subtitle}</div>
    ${detailHtml}
    <div class="badge">💈 ${shop}</div>
  </div>
</body></html>`;
  }

  function apptDetail(a) {
    const emp  = a.employee_id ? q.getEmployee(a.employee_id) : null;
    const tz   = q.getSetting('timezone') || 'America/Paramaribo';
    const date = new Date(a.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
    const time = new Date(a.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
    return `<div class="detail">
      <strong>👤</strong> ${a.customer_name}<br>
      <strong>✂️</strong> ${a.service_emoji || ''} ${a.service_name}<br>
      <strong>💈</strong> ${emp?.name || a.employee_name || '—'}<br>
      <strong>📅</strong> ${date} &nbsp;<strong>⏰</strong> ${time}<br>
      <strong>🎫</strong> ${a.booking_code}
    </div>`;
  }

  const appt = q.getAppointmentByCode(req.params.code);

  if (!appt)
    return res.status(404).send(page('❓', 'Code Not Found', 'This booking code does not exist.', '', '#ef4444'));
  if (appt.status === 'cancelled')
    return res.send(page('🚫', 'Appointment Cancelled', 'This appointment was cancelled.', apptDetail(appt), '#ef4444'));
  if (appt.status === 'completed')
    return res.send(page('✅', 'Already Checked In', 'This appointment was already marked as complete.', apptDetail(appt), '#10b981'));
  if (appt.status === 'no-show')
    return res.send(page('👻', 'Marked No-Show', 'This appointment was recorded as a no-show.', apptDetail(appt), '#f59e0b'));

  // Info-only — no status change (check-in requires the authenticated dashboard scanner)
  return res.send(page('📋', 'Appointment Info', `Show this QR to your barber on arrival.`, apptDetail(appt), '#f59e0b'));
});

/** Authenticated check-in — called by the dashboard scanner only. */
router.post('/checkin/:code', requireAuth, (req, res) => {
  try {
    const appt = q.getAppointmentByCode(req.params.code);
    if (!appt) return res.status(404).json({ ok: false, message: 'Booking code not found' });
    if (appt.status === 'cancelled') return res.json({ ok: false, message: 'This appointment was cancelled' });
    if (appt.status === 'no-show')   return res.json({ ok: false, message: 'Marked as no-show' });
    if (appt.status === 'completed') return res.json({ ok: false, already: true, message: 'Already checked in', customer_name: appt.customer_name, service_name: appt.service_name, service_emoji: appt.service_emoji || '✂️' });

    q.updateAppointment(appt.id, { status: 'completed' });
    syncCalendarStatus(appt, '✅'); // best-effort, not awaited — never delays the check-in response
    const employee = appt.employee_id ? q.getEmployee(appt.employee_id) : null;
    console.log(`✅ Check-in: ${appt.customer_name} — ${appt.booking_code}`);
    res.json({
      ok:            true,
      customer_name: appt.customer_name,
      service_name:  appt.service_name,
      service_emoji: appt.service_emoji || '✂️',
      employee_name: employee?.name || appt.employee_name || '—',
      booking_code:  appt.booking_code,
    });
  } catch (e) { res.status(500).json({ ok: false, message: e.message }); }
});

/** Returns a QR code PNG (base64) for an appointment's check-in URL. */
router.get('/appointments/:id/qr', async (req, res) => {
  try {
    const appts = q.getAppointments({});
    const appt  = appts.find(a => String(a.id) === String(req.params.id));
    if (!appt) return res.status(404).json({ error: 'Not found' });

    const shopUrl  = (q.getSetting('shop_url') || '').replace(/\/$/, '');
    const checkUrl = shopUrl
      ? `${shopUrl}/api/checkin/${appt.booking_code}`
      : appt.booking_code; // fallback to just the code if URL not configured

    const dataUrl = await QRCode.toDataURL(checkUrl, { width: 300, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } });
    res.json({ ok: true, dataUrl, checkUrl, booking_code: appt.booking_code });
  } catch (e) { res.status(500).json({ error: e.message }); }
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

// POST /api/whatsapp/reset-session — wipes saved session so a fresh QR appears.
// Use when changing the WhatsApp number linked to the bot.
router.post('/whatsapp/reset-session', async (req, res) => {
  try {
    const path = require('path');
    const fs   = require('fs');
    const { getClient }   = require('../../whatsapp-client');
    const { update: waUpdate } = require('../../whatsapp-state');

    // Destroy active client first
    const c = getClient();
    if (c) await c.destroy().catch(() => {});

    // Delete the saved session folder
    const sessionDir = path.join(process.cwd(), '.wwebjs_auth');
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });

    waUpdate({ status: 'initializing', qrDataUrl: null });

    // Re-initialize so a fresh QR appears immediately
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

      if (shopCalId && !result.duplicate) {
        const eventData = {
          service:       { name: req.body.service_name, emoji: req.body.service_emoji, duration: req.body.service_duration, price: req.body.service_price },
          startTime:     new Date(req.body.start_time),
          endTime:       new Date(req.body.end_time),
          customerName:  req.body.customer_name,
          bookingCode:   result.booking_code,
          employeeName:  employee?.name,
          employeeColor: employee?.color,
        };
        const r = await calCreate({ ...eventData, calendarId: shopCalId });
        if (r.success) {
          q.updateAppointment(id, { google_event_id: r.eventId, google_event_link: r.eventLink });
          calendarSynced = true;
        }
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
    }

    // Completed/no-show: label the calendar event rather than deleting it.
    if (req.body.status === 'completed') syncCalendarStatus(appt, '✅');
    if (req.body.status === 'no-show')   syncCalendarStatus(appt, '👻');

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

    if (!shopCalId)
      return res.status(400).json({ error: 'No calendar configured. Set a Calendar ID in Settings.' });

    const { createAppointment: calCreate, cancelEvent } = require('../../services/googleCalendar');
    const eventData = {
      service:       { name: appt.service_name, emoji: appt.service_emoji, duration: appt.service_duration, price: appt.service_price },
      startTime:     new Date(appt.start_time),
      endTime:       new Date(appt.end_time),
      customerName:  appt.customer_name,
      bookingCode:   appt.booking_code,
      employeeName:  employee?.name,
      employeeColor: employee?.color,
    };

    // If this appointment already has a live event, remove it first — otherwise
    // re-syncing leaves the old event orphaned on the calendar as a ghost
    // duplicate (same booking code, stale barber/time) alongside the new one.
    if (appt.google_event_id) {
      await cancelEvent({ calendarId: shopCalId, eventId: appt.google_event_id }).catch(() => {});
    }

    // Shop calendar — barbers see it via their read-only share
    const shopResult = await calCreate({ ...eventData, calendarId: shopCalId });
    if (shopResult.success) q.updateAppointment(appt.id, { google_event_id: shopResult.eventId, google_event_link: shopResult.eventLink });
    else return res.status(500).json({ error: shopResult.error });

    res.json({ ok: true, eventLink: shopResult.eventLink });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/appointments/sync-all-calendar
// Re-syncs ALL upcoming confirmed appointments to the currently configured calendar.
// Useful when switching calendars — wipes old event IDs and creates fresh events.
router.post('/appointments/sync-all-calendar', async (req, res) => {
  try {
    const { createAppointment: calCreate, cancelEvent } = require('../../services/googleCalendar');
    const shopCalId = q.getSetting('google_calendar_id') ||
      (process.env.GOOGLE_CALENDAR_ID !== 'primary' ? process.env.GOOGLE_CALENDAR_ID : null);

    if (!shopCalId) return res.status(400).json({ error: 'No calendar configured in Settings.' });

    const now   = new Date().toISOString();
    const appts = q.getAppointments({}).filter(a =>
      a.status !== 'cancelled' && a.start_time >= now
    );

    let synced = 0, failed = 0;
    for (const appt of appts) {
      try {
        const employee = appt.employee_id ? q.getEmployee(appt.employee_id) : null;
        const eventData = {
          service:       { name: appt.service_name, emoji: appt.service_emoji, duration: appt.service_duration, price: appt.service_price },
          startTime:     new Date(appt.start_time),
          endTime:       new Date(appt.end_time),
          customerName:  appt.customer_name,
          bookingCode:   appt.booking_code,
          employeeName:  employee?.name,
          employeeColor: employee?.color,
        };
        // Remove the previous event first — otherwise every re-sync leaves the
        // old one behind as an orphaned ghost duplicate on the calendar.
        if (appt.google_event_id) {
          await cancelEvent({ calendarId: shopCalId, eventId: appt.google_event_id }).catch(() => {});
        }
        const r = await calCreate({ ...eventData, calendarId: shopCalId });
        if (r.success) {
          q.updateAppointment(appt.id, { google_event_id: r.eventId, google_event_link: r.eventLink });
          synced++;
        } else { failed++; }
      } catch { failed++; }
    }

    res.json({ ok: true, synced, failed, total: appts.length });
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

router.post('/employees', async (req, res) => {
  try {
    const { name, phone, color, google_calendar_id, excluded_service_ids } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const result = q.createEmployee(name, phone, color, google_calendar_id, excluded_service_ids || []);
    // Auto-share shop calendar with new barber if they have a Gmail set
    if (google_calendar_id) {
      const { shareCalendarWithBarber } = require('../../services/googleCalendar');
      shareCalendarWithBarber(google_calendar_id).catch(e => console.error('⚠️  Calendar share failed:', e.message));
    }
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/employees/:id', async (req, res) => {
  try {
    const existing = q.getEmployee(req.params.id);
    const oldEmail = existing?.google_calendar_id || '';
    const newEmail = req.body.google_calendar_id  || '';

    q.updateEmployee(req.params.id, req.body);

    const { shareCalendarWithBarber, revokeCalendarShare } = require('../../services/googleCalendar');

    // New email added or changed → share with new email
    if (newEmail && newEmail !== oldEmail) {
      shareCalendarWithBarber(newEmail).catch(e => console.error('⚠️  Calendar share failed:', e.message));
    }
    // Email removed → revoke old access
    if (oldEmail && !newEmail) {
      revokeCalendarShare(oldEmail).catch(e => console.error('⚠️  Calendar revoke failed:', e.message));
    }

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

router.delete('/employees/:id', (req, res) => {
  try {
    q.deleteEmployee(req.params.id);
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

router.delete('/customers/:id', (req, res) => {
  try {
    q.deleteCustomer(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/customers/:id/appointments', (req, res) => {
  try { res.json(q.getAppointmentsForCustomer(req.params.id)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Menu order ────────────────────────────────────────────────────────────────

const VALID_ACTIONS = new Set(['booking','hours','location','prices','contact','gallery','language','manage','training','feedback','privacy']);

router.get('/menu', (req, res) => {
  try {
    const raw = q.getSetting('menu_order');
    const items = raw ? JSON.parse(raw) : [];
    res.json(items);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/menu', (req, res) => {
  try {
    const items = (req.body || []).filter(m => VALID_ACTIONS.has(m.action)).map(m => ({
      action: m.action,
      enabled: !!m.enabled,
      ...(m.labels && typeof m.labels === 'object' ? {
        labels: Object.fromEntries(
          ['en','nl','es','fr'].map(l => [l, String(m.labels[l] || '').trim().slice(0, 80)]).filter(([,v]) => v)
        )
      } : {})
    }));
    q.setSetting('menu_order', JSON.stringify(items));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Keywords ──────────────────────────────────────────────────────────────────

router.get('/keywords', (req, res) => {
  try { res.json(q.getKeywords()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/keywords', (req, res) => {
  try {
    const { keyword, action } = req.body;
    if (!keyword || !action) return res.status(400).json({ error: 'keyword and action required' });
    const k = q.addKeyword({ keyword, action });
    res.json({ ok: true, keyword: k });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/keywords/:id', (req, res) => {
  try {
    q.updateKeyword(req.params.id, req.body);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/keywords/:id', (req, res) => {
  try {
    q.deleteKeyword(req.params.id);
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

    // Create a Google Calendar all-day event on the shop calendar
    // (barbers see it through their read-only share)
    const employee  = q.getEmployee(employee_id);
    const shopCalId = q.getSetting('google_calendar_id') ||
      (process.env.GOOGLE_CALENDAR_ID !== 'primary' ? process.env.GOOGLE_CALENDAR_ID : null);
    let googleEventId = '';
    if (shopCalId && employee) {
      const gcalResult = await createLeaveEvent({
        calendarId:   shopCalId,
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
    const leave = q.getLeave(req.params.id);

    // Remove from the shop calendar
    const shopCalId = q.getSetting('google_calendar_id') ||
      (process.env.GOOGLE_CALENDAR_ID !== 'primary' ? process.env.GOOGLE_CALENDAR_ID : null);
    if (leave?.google_event_id && shopCalId) {
      cancelEvent({ calendarId: shopCalId, eventId: leave.google_event_id })
        .catch(e => console.error('⚠️  Leave calendar delete:', e.message));
    }

    q.deleteLeave(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Photo Gallery ─────────────────────────────────────────────────────────────

const fs_api   = require('fs');
const path_api = require('path');
const UPLOADS  = path_api.join(process.cwd(), 'data', 'uploads');

router.get('/photos', requireAuth, (req, res) => {
  try {
    const photos = q.getPhotos(req.query.tag || null);
    res.json(photos);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/photos/tags', requireAuth, (req, res) => {
  try { res.json(q.getPhotoTags()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/photos', requireAuth, (req, res) => {
  try {
    const { base64, filename, tags, caption } = req.body;
    if (!base64 || !filename) return res.status(400).json({ error: 'base64 and filename required' });

    const ext        = (filename.split('.').pop() || 'jpg').toLowerCase();
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const filepath   = path_api.join(UPLOADS, uniqueName);
    const data       = base64.includes(',') ? base64.split(',')[1] : base64;

    fs_api.writeFileSync(filepath, Buffer.from(data, 'base64'));

    const tagArr = (typeof tags === 'string' ? tags.split(',') : (tags || []));
    const photo  = q.addPhoto({ filename: uniqueName, originalName: filename, tags: tagArr, caption });
    res.json({ ok: true, photo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/photos/:id', requireAuth, (req, res) => {
  try {
    q.updatePhoto(req.params.id, req.body);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/photos/:id', requireAuth, (req, res) => {
  try {
    const photos = q.getPhotos();
    const photo  = photos.find(p => String(p.id) === String(req.params.id));
    if (photo) {
      const filepath = path_api.join(UPLOADS, photo.filename);
      if (fs_api.existsSync(filepath)) fs_api.unlinkSync(filepath);
    }
    q.deletePhoto(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Training Videos ───────────────────────────────────────────────────────────

router.get('/training/videos', requireAuth, (req, res) => {
  try { res.json(q.getTrainingVideos()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/training/videos', requireAuth, (req, res) => {
  try {
    const { base64, filename, caption } = req.body;
    if (!base64 || !filename) return res.status(400).json({ error: 'base64 and filename required' });
    const ext        = (filename.split('.').pop() || 'mp4').toLowerCase();
    const uniqueName = `training-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const filepath   = path_api.join(UPLOADS, uniqueName);
    const data       = base64.includes(',') ? base64.split(',')[1] : base64;
    fs_api.writeFileSync(filepath, Buffer.from(data, 'base64'));
    const video = q.addTrainingVideo({ filename: uniqueName, originalName: filename, caption: caption || '' });
    res.json({ ok: true, video });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/training/videos/:id', requireAuth, (req, res) => {
  try {
    q.updateTrainingVideo(req.params.id, req.body);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/training/videos/:id', requireAuth, (req, res) => {
  try {
    const videos  = q.getTrainingVideos();
    const video   = videos.find(v => String(v.id) === String(req.params.id));
    if (video) {
      const filepath = path_api.join(UPLOADS, video.filename);
      if (fs_api.existsSync(filepath)) fs_api.unlinkSync(filepath);
    }
    q.deleteTrainingVideo(req.params.id);
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
