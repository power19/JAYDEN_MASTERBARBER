# 💈 Jayden's Barbershop — WhatsApp Booking Bot

A WhatsApp chatbot that lets customers browse services and book appointments directly into Google Calendar — no app download required.

## Features

| Feature | Details |
|---------|---------|
| 📋 Interactive menu | Services, prices, hours, location, contact |
| 📅 Appointment booking | Multi-step conversation flow (service → date → time → name → confirm) |
| 🗓️ Google Calendar sync | Checks real-time availability; creates events automatically |
| 🔁 Session management | 30-minute inactivity timeout; back/cancel/menu shortcuts at any point |
| ⚙️ Fully configurable | All services, prices, hours, and shop info live in config files or `.env` |

---

## Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **Google Chrome / Chromium** — installed by Puppeteer automatically
- **A WhatsApp account** — the barber's number that will act as the bot

---

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/power19/jayden_barbershop.git
cd jayden_barbershop

# 2. Install dependencies (this also downloads Chromium via Puppeteer)
npm install

# 3. Copy the example environment file
cp .env.example .env
```

---

## Configuration

Open `.env` and fill in your values:

```env
SHOP_NAME=Jayden's Barbershop
SHOP_ADDRESS=Your Street, Paramaribo, Suriname
SHOP_PHONE=+597 XXX-XXXX
SHOP_EMAIL=info@jaydensbarbershop.com
SHOP_INSTAGRAM=@jaydensbarbershop
GOOGLE_MAPS_LINK=https://maps.google.com/?q=...

CURRENCY=SRD
TIMEZONE=America/Paramaribo

GOOGLE_CALENDAR_ID=primary          # or the specific calendar ID
GOOGLE_CREDENTIALS_PATH=./credentials/service-account.json

BOOKING_DAYS_AHEAD=14
```

### Customising services

Edit [`src/config/services.js`](src/config/services.js) to add/remove/rename services, change prices and durations.

### Customising hours

Edit [`src/config/businessHours.js`](src/config/businessHours.js) to change open/close times or mark days as closed.

---

## Google Calendar Setup

The bot uses a **Service Account** — it never asks the barber to log in.

### Step 1 — Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. `Jayden Barbershop Bot`)
3. Enable the **Google Calendar API** → *APIs & Services* → *Enable APIs* → search "Calendar"

### Step 2 — Create a Service Account

1. Go to *APIs & Services* → *Credentials* → *Create Credentials* → *Service Account*
2. Give it any name (e.g. `barbershop-bot`)
3. Click **Done** (no roles needed at project level)
4. Click the new service account → *Keys* tab → *Add Key* → *Create new key* → **JSON**
5. A `.json` file downloads — move it to `credentials/service-account.json`

### Step 3 — Share your Google Calendar with the service account

1. Open [Google Calendar](https://calendar.google.com) as the barber
2. Hover over the calendar you want to use → three dots → *Settings and sharing*
3. Scroll to **Share with specific people** → *Add people*
4. Paste the service account email address (looks like `barbershop-bot@your-project.iam.gserviceaccount.com`)
5. Set permission to **Make changes to events** → *Send*

### Step 4 — Copy the Calendar ID

On the same settings page scroll to **Integrate calendar** → copy the **Calendar ID**.  
Paste it as `GOOGLE_CALENDAR_ID` in your `.env`.  
(For your primary/main calendar, `primary` works without copying the ID.)

---

## Running the Bot

```bash
# Production
npm start

# Development (auto-restarts on file changes)
npm run dev
```

**First run only:** A QR code appears in the terminal.  
Open WhatsApp on the barber's phone → *Linked Devices* → *Link a Device* → scan.  
The session is saved to `.wwebjs_auth/` and reused on future restarts.

---

## Conversation Flow

```
Customer sends any message
        │
        ▼
   Main Menu (1-5)
   ├─ 1 → Book Appointment
   │       ├─ Select Service
   │       ├─ Select Date (next 7 open days)
   │       ├─ Select Time (Google Calendar free slots)
   │       ├─ Enter Name
   │       └─ Confirm YES/NO → Calendar event created ✅
   ├─ 2 → Services & Prices (info)
   ├─ 3 → Business Hours
   ├─ 4 → Location
   └─ 5 → Contact
```

**Shortcuts available at any point:**
- `menu` / `hi` / `hello` → back to main menu
- `0` / `back` → one step back
- `cancel` / `exit` → cancel booking

---

## Project Structure

```
jayden_barbershop/
├── src/
│   ├── index.js                    # Entry point & WhatsApp events
│   ├── bot.js                      # WhatsApp client factory
│   ├── config/
│   │   ├── services.js             # ✏️  Edit to change services & prices
│   │   ├── businessHours.js        # ✏️  Edit to change open/close times
│   │   └── shopInfo.js             # Reads from .env
│   ├── handlers/
│   │   └── conversationHandler.js  # State machine — the bot's brain
│   ├── services/
│   │   └── googleCalendar.js       # Calendar API (read + write)
│   └── utils/
│       ├── sessionManager.js       # Per-user conversation state
│       └── dateUtils.js            # Slot generation helpers
├── credentials/
│   └── service-account.json        # 🔒 Git-ignored — put your key here
├── .env                            # 🔒 Git-ignored — your secrets
├── .env.example                    # Template to copy
└── .gitignore
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| QR code keeps appearing | Delete `.wwebjs_auth/` and rescan |
| "Calendar auth error" | Check `credentials/service-account.json` path and that the calendar is shared |
| No available slots shown | Verify the calendar ID and that the service account has edit access |
| Bot not responding | Check that the WhatsApp number is not linked to another device |

---

## Tech Stack

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) — WhatsApp Web automation
- [googleapis](https://github.com/googleapis/google-api-nodejs-client) — Google Calendar API
- [dotenv](https://github.com/motdotla/dotenv) — environment config
- Node.js 18+

---

## License

MIT — feel free to adapt for your own barbershop. ✂️
