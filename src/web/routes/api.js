/**
 * REST API for the admin dashboard.
 * All routes are under /api and require authentication.
 */
const express   = require('express');
const router    = express.Router();
const q         = require('../../db/queries');
const { state: waState } = require('../../whatsapp-state');

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
  res.json({
    status:    waState.status,
    qrDataUrl: waState.status === 'qr' ? waState.qrDataUrl : null,
    lastUpdated: waState.lastUpdated,
  });
});

// ── Apply auth to all routes below ───────────────────────────────────────────
router.use(requireAuth);

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

// ── Appointments ──────────────────────────────────────────────────────────────

router.get('/appointments', (req, res) => {
  try {
    const { date, employee_id, status } = req.query;
    res.json(q.getAppointments({ date, employeeId: employee_id, status }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/appointments', (req, res) => {
  try {
    const result = q.createAppointment(req.body);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/appointments/:id', (req, res) => {
  try {
    q.updateAppointment(req.params.id, req.body);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Employees ─────────────────────────────────────────────────────────────────

router.get('/employees', (req, res) => {
  try { res.json(q.getEmployees()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/employees', (req, res) => {
  try {
    const { name, phone, color, google_calendar_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const result = q.createEmployee(name, phone, color, google_calendar_id);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/employees/:id', (req, res) => {
  try {
    q.updateEmployee(req.params.id, req.body);
    res.json({ ok: true });
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

module.exports = router;
