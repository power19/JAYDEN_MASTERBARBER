# 💈 Jayden's Barbershop — Agent Guide

Paramaribo, Suriname. WhatsApp booking bot + admin web dashboard for a barbershop with 2–3 barbers.

---

## Running the App

```bash
# Full app — WhatsApp bot + admin dashboard (port 3000)
npm start

# Dashboard only — no WhatsApp bot (for UI work)
node src/web-only.js

# Development with auto-restart
npm run dev
```

**⚠️ PowerShell sandbox** — bare `npm` opens a file dialog. Always use:
```powershell
& "C:\Program Files\nodejs\npm.cmd" install <package>
# or
node -e "require('<package>')"   # to verify it installed
```

**First run:** a QR code appears in the terminal AND in the dashboard at `http://localhost:3000`. Scan with the barber's phone → WhatsApp → Linked Devices → Link a Device. Session saved to `.wwebjs_auth/` and reused on restart.

---

## Architecture

```
index.js  ──────────────────────────────────────────────
  │  starts web server + WhatsApp bot together
  │  registers shared state on every bot event
  │
  ├── whatsapp-state.js          shared in-memory { status, qrDataUrl }
  │     written by: index.js (bot events)
  │     read by:    src/web/routes/api.js  →  GET /api/whatsapp/status
  │
  ├── whatsapp-client.js         shared client reference
  │     setClient(c) called in index.js after createBot()
  │     getClient()  used by POST /api/whatsapp/reconnect endpoint
  │
  ├── src/bot.js                 creates the whatsapp-web.js client
  ├── src/handlers/conversationHandler.js   booking state machine
  ├── src/db/                    pure-JS JSON file database (no native deps)
  └── src/web/                   Express admin dashboard
        ├── server.js            Express app, sessions (memorystore)
        ├── routes/api.js        REST API under /api
        └── public/index.html    SPA (Alpine.js + Tailwind CDN, no build step)

web-only.js  ── starts dashboard only; waState stays 'not-running'
```

---

## Database — Pure JS JSON Files

**No native modules anywhere.** `better-sqlite3` was dropped because Node.js v24 + missing Windows SDK made compilation fail. Everything lives in JSON files under `data/`.

| File | Class | Purpose |
|---|---|---|
| `src/db/store.js` | `JsonCollection` | Array store — auto-increment IDs, find/insert/update/upsert/remove/toggle |
| `src/db/store.js` | `JsonKVStore` | Flat key→value store |
| `src/db/database.js` | — | Creates all collections, seeds defaults on first run |
| `src/db/queries.js` | — | All data access — the only file that touches the DB |

Collections: `employees`, `businessHours`, `services`, `appointments`, `botMessages`  
KV store: `settings`

**Never import `store.js` directly** — always go through `queries.js`.

---

## Key Files

| File | What it does |
|---|---|
| `src/index.js` | Entry point. Bot events → `waUpdate()` + `setClient()`. No `process.exit` on disconnect (dashboard stays alive). |
| `src/handlers/conversationHandler.js` | Full booking state machine. States: IDLE → MAIN_MENU → SELECTING_SERVICE → SELECTING_EMPLOYEE → SELECTING_DATE → SELECTING_TIME → ENTERING_NAME → CONFIRMING_BOOKING |
| `src/db/queries.js` | `generateBookingCode()`, `createAppointment()`, `getAvailableSlotsForEmployee()`, `pickLeastBusyEmployee()`, `getAvailableDates()` |
| `src/services/googleCalendar.js` | Service account auth, per-employee `calendarId`, creates events with booking code (never customer phone) |
| `src/web/routes/api.js` | All REST endpoints. `/api/whatsapp/status` is intentionally **pre-auth** (QR must show before login). Everything else requires session auth. |
| `src/web/public/index.html` | Single-file SPA. Alpine.js data + methods in `<script>` at bottom. No build step — Tailwind CDN. |
| `src/config/services.js` | 6 default services with SRD prices |
| `src/config/businessHours.js` | Sun closed, Mon–Fri 09:00–18:00, Sat 09:00–16:00 |
| `.env` | Secrets — git-ignored |
| `data/*.json` | Database files — git-ignored |
| `.wwebjs_auth/` | WhatsApp session — git-ignored |
| `credentials/service-account.json` | Google service account key — git-ignored |

---

## Regional Settings

| Setting | Value |
|---|---|
| Currency | SRD (Surinamese Dollar) |
| Timezone | America/Paramaribo |
| Language | English |
| Locale | en-US for date formatting |

---

## Booking Code

Customers receive a **4-character code** (e.g. `F8CR`) instead of their phone number being shared. This prevents employees from stealing customer contacts.

- Alphabet: `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L — visually ambiguous)
- Generated in `queries.js → generateBookingCode()`, uniqueness checked, max 200 attempts
- Stored as `booking_code` on the appointment
- Shown in: WhatsApp confirmation, dashboard schedule, Google Calendar event description
- `customer_phone` is stored in the JSON DB only — **never displayed anywhere**

---

## Multi-Employee Logic

- Up to 3 barbers, each with their own color, optional Google Calendar ID, and per-employee work hours
- "Any Available" option (`allow_any_employee` setting) shown when enabled — picks the least-busy barber at confirmation time (`pickLeastBusyEmployee()`)
- Slot availability: `getAvailableSlotsForEmployee()` checks DB appointments for conflicts
- Employee can be toggled active/inactive from the dashboard

---

## WhatsApp Connection States

```
not-running   → web-only mode, bot never started
initializing  → client.initialize() called
qr            → QR ready; qrDataUrl is a base64 PNG for <img src>
authenticated → QR scanned, loading session
ready         → fully connected
disconnected  → lost connection (server stays alive — use Reconnect button)
```

Dashboard polls `GET /api/whatsapp/status` every 3 seconds (pre-auth endpoint).  
`POST /api/whatsapp/reconnect` (auth-required) calls `client.destroy()` then `client.initialize()` without restarting the server.

---

## Admin Dashboard (SPA)

- **Framework:** Alpine.js 3 (CDN) + Tailwind CSS (CDN) — no build step, no bundler
- **Sessions:** `memorystore` (pure JS, no native deps — replaced `connect-sqlite3`)
- **Auth:** single admin password from `ADMIN_PASSWORD` env var (default: `admin`)
- **Pages:** Dashboard · Appointments · Employees · Work Hours · Services · Bot Messages · Settings

### Tailwind CDN Gotchas

1. **`@apply` in `<style>` tags is unreliable** — CDN may not process it. Use plain CSS or put classes directly on HTML elements.
2. **`x-show` + flex modals** — Alpine's `x-show` sets `display:block`, overriding Tailwind's `flex` on overlay divs. Use `<template x-if>` for modals instead — element is removed/added from DOM, so flex classes apply correctly on insertion.
3. Sidebar nav uses **plain CSS** (not `@apply`) for `color:#fff; font-weight:600` to guarantee white text.

---

## API Routes

All routes under `/api`. Auth middleware applied after `/auth/*` and `/whatsapp/status`.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | No | Set session |
| POST | `/auth/logout` | No | Destroy session |
| GET | `/auth/status` | No | Check session |
| GET | `/whatsapp/status` | **No** | Bot connection state + QR data URL |
| POST | `/whatsapp/reconnect` | Yes | Reinitialize WhatsApp client |
| GET | `/dashboard` | Yes | Stats + today's appointments |
| GET/POST | `/appointments` | Yes | List / create |
| PUT | `/appointments/:id` | Yes | Update status |
| GET/POST | `/employees` | Yes | List / create |
| PUT | `/employees/:id` | Yes | Update |
| POST | `/employees/:id/toggle` | Yes | Activate / deactivate |
| GET/PUT | `/hours` | Yes | Global business hours |
| GET/PUT | `/hours/:employeeId` | Yes | Per-employee hours |
| GET/POST | `/services` | Yes | List / create |
| PUT | `/services/:id` | Yes | Update |
| POST | `/services/:id/toggle` | Yes | Show / hide |
| DELETE | `/services/:id` | Yes | Delete |
| GET/PUT | `/messages` | Yes | Bot message templates |
| GET/PUT | `/settings` | Yes | Shop settings KV store |

---

## Environment Variables

```env
ADMIN_PASSWORD=         # Dashboard login password (default: admin)
ADMIN_PORT=3000         # Web server port

SHOP_NAME=              # Shown in dashboard header + bot welcome
SHOP_ADDRESS=           # Shown in bot location menu
SHOP_PHONE=             # Shown in bot contact menu
SHOP_EMAIL=
SHOP_INSTAGRAM=
GOOGLE_MAPS_LINK=

CURRENCY=SRD
TIMEZONE=America/Paramaribo

GOOGLE_CALENDAR_ID=primary
GOOGLE_CREDENTIALS_PATH=./credentials/service-account.json

BOOKING_DAYS_AHEAD=14
SESSION_SECRET=         # Express session secret
```

---

## Dependencies

| Package | Purpose |
|---|---|
| `whatsapp-web.js` | WhatsApp Web automation (QR scan, LocalAuth) |
| `qrcode` | Generates base64 PNG from QR string for dashboard display |
| `qrcode-terminal` | Prints QR to terminal on startup |
| `googleapis` | Google Calendar API (service account auth) |
| `express` + `express-session` | Web server + sessions |
| `memorystore` | Pure-JS session store (replaces connect-sqlite3) |
| `dotenv` | Environment config |

**No native/compiled modules.** Everything must be pure JS to avoid Windows SDK compile issues on Node.js v24.

---

## Git / GitHub

- Repo: `https://github.com/power19/jayden_barbershop.git`
- Branch: `main`
- Gitignored: `.env`, `data/*.json`, `.wwebjs_auth/`, `credentials/*.json`, `node_modules/`
