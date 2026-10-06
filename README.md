# Thoddoo Ride

Backend + website for **Thoddoo Ride** — electric-bike rental on Thoddoo Island,
Alif Alif Atoll, Maldives.

A single, self-contained Node.js service that serves the public marketing/booking
site **and** the staff operations portal, backed by a SQLite database. No external
services required to run it.

```
┌──────────────────────────────────────────────────────────┐
│  Express server (server/)                                  │
│   ├─ serves the static site (public/)                      │
│   ├─ /api          public API   (availability, bookings)   │
│   ├─ /api/auth     staff sign-in (JWT in httpOnly cookie)  │
│   └─ /api/admin    staff portal (fleet, sales, refunds)    │
│  SQLite database (data/thoddoo.db)  +  uploads (data/…)    │
└──────────────────────────────────────────────────────────┘
```

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. (recommended) create your env file
cp .env.example .env
#    then edit .env — at minimum set a JWT_SECRET and a real ADMIN_PASSWORD

# 3. Run
npm start
```

Then open:

| URL | What |
|-----|------|
| http://localhost:3000/ | Public site |
| http://localhost:3000/staff | Staff operations portal |
| http://localhost:3000/api/health | API health check |

On first run the database is created and seeded automatically (4 bikes, a few
reviews, default settings, and one staff account).

**Default staff login:** `admin` / `thoddoo123` — **change this before going
live** (see [Configuration](#configuration)).

### Dev mode

```bash
npm run dev          # restarts on file changes (node --watch)
npm run reset-db     # wipe + reseed the database (destroys all data)
```

---

## Project structure

```
.
├── server/
│   ├── index.js          # Express app: middleware, static serving, routes
│   ├── config.js         # env-driven configuration
│   ├── db.js             # SQLite connection + schema + settings helpers
│   ├── seed.js           # first-run seed (idempotent) + reset CLI
│   ├── auth.js           # bcrypt hashing, JWT, auth middleware
│   ├── helpers.js        # validation, refs, currency, serializers
│   └── routes/
│       ├── public.js     # availability, config, reviews, booking submit
│       ├── auth.js       # login / logout / me
│       └── admin.js      # fleet, bookings, sales, refunds, documents
├── public/               # the website (served as static files)
│   ├── index.html        # public site  (was "Thoddoo Ride.html")
│   ├── staff-portal.html # staff portal
│   ├── styles.css        # baseline stylesheet (see note below)
│   ├── site.js           # public site ↔ API glue
│   ├── admin.js          # staff portal ↔ API glue
│   ├── i18n.js           # EN/中文/RU translations
│   ├── image-slot.js     # <image-slot> custom element
│   └── tweaks-*.jsx      # placeholders for the design-time tweaks panel
├── data/                 # created at runtime — DB + uploads (git-ignored)
├── .env.example
├── Dockerfile
└── package.json
```

> **About `styles.css`:** this is a clean, functional baseline that styles every
> element the two HTML pages use, so the site is presentable out of the box. If
> you have the polished stylesheet from your Claude design project, just drop it
> in over `public/styles.css` — all class names and markup hooks are unchanged.

---

## Configuration

All configuration is via environment variables (loaded from `.env` in
development). See `.env.example` for the full list. The important ones:

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `development` | set to `production` on your server |
| `JWT_SECRET` | dev fallback | **required in production** — long random string |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `thoddoo123` | only used to create the first staff account |
| `SESSION_HOURS` | `12` | how long a sign-in lasts |
| `COOKIE_SECURE` | on in prod | https-only session cookie |
| `DAILY_RATE_MVR` | `300` | rate shown on the site + used for estimates |
| `MVR_PER_USD` | `15.42` | currency conversion |
| `WHATSAPP_NUMBER` / `PHONE_NUMBER` | demo numbers | wired into every contact link |
| `DATA_DIR` | `./data` | where the DB + uploads live (point at a persistent disk in prod) |
| `UPLOAD_MAX_BYTES` | `8388608` | max passport/licence upload size (8 MB) |

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Business values (rate, currency, contact numbers, review rating) are also stored
in the `settings` table and can be changed there at runtime without a redeploy.

---

## How it works

### Public site
- **Live availability** is pulled from `/api/availability` and rendered into the
  hero snapshot, the availability grid, and the booking form's bike dropdown.
  It refreshes every 60 seconds.
- **The booking form** submits to `POST /api/bookings` as `multipart/form-data`,
  including the passport (required) and licence (optional) uploads. The customer
  gets a booking reference; the request lands in the staff portal.
- **"Send on WhatsApp"** builds a pre-filled message to your number instead of
  (or as well as) submitting the form.
- Currency toggle, language switcher (EN/中文/RU), FAQ, modals, and the contact
  links are all wired up.

### Staff portal (`/staff`)
- **Sign-in** posts to `/api/auth/login`; the session is a JWT in an httpOnly
  cookie, so it's never exposed to page scripts.
- **Live fleet** shows each bike's status and battery on an interactive board
  (change a bike's status inline) and as GPS markers on the island map.
- **Booking requests** inbox: view the customer's passport/licence, then
  **Confirm** (holds the bike + records a payment) or **Decline**.
- **Sales & refunds**: 7-day / 30-day revenue, a chart, the transaction list,
  and one-tap refunds.
- The dashboard polls for updates every 30 seconds.

---

## API reference

### Public
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Liveness check |
| `GET` | `/api/config` | Rates, currency, contact info, fleet counts |
| `GET` | `/api/availability` | Live fleet status (public fields only) |
| `GET` | `/api/reviews` | Published reviews + average rating |
| `POST` | `/api/bookings` | Create a booking request (multipart; fields: `name`, `contact`, `from`, `time`, `days`, `bikes`, `pay`, `bike`; files: `passport` required, `licence` optional) |

### Auth
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | `{ username, password }` → sets session cookie |
| `POST` | `/api/auth/logout` | Clears the session |
| `GET` | `/api/auth/me` | Current staff user (401 if not signed in) |

### Admin (require a valid session)
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/stats` | Fleet counts + new-request count |
| `GET` | `/api/admin/fleet` | All bikes incl. position/battery |
| `POST` | `/api/admin/bikes` | Add a bike |
| `PATCH` | `/api/admin/bikes/:id` | Update status / battery / position / details |
| `DELETE` | `/api/admin/bikes/:id` | Remove a bike |
| `GET` | `/api/admin/bookings?status=` | List bookings (optional status filter) |
| `PATCH` | `/api/admin/bookings/:id` | Update status / assign bike (`confirmed` records a payment) |
| `GET` | `/api/admin/bookings/:id/document/:type` | Stream `passport`/`licence` (staff only) |
| `DELETE` | `/api/admin/bookings/:id/document/:type` | Delete a stored document |
| `GET` | `/api/admin/sales?period=week\|month` | Revenue summary + daily chart |
| `GET` | `/api/admin/transactions` | Transaction list |
| `POST` | `/api/admin/transactions/:id/refund` | Refund a transaction |

---

## Deployment

This is a standard Node web service that needs **one writable directory** (for
the SQLite database and uploaded documents). Any of these work:

### Option A — a host with a persistent disk (Render, Railway, Fly.io, a VPS)
1. Set the environment variables (at least `NODE_ENV=production`, `JWT_SECRET`,
   `ADMIN_PASSWORD`).
2. Attach a persistent volume and point `DATA_DIR` at it (e.g. `/data`).
3. Start command: `npm start`.

### Option B — Docker
```bash
docker build -t thoddoo-ride .
docker run -d -p 3000:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))')" \
  -e ADMIN_PASSWORD="a-strong-password" \
  -v thoddoo-data:/app/data \
  thoddoo-ride
```

Put it behind a reverse proxy (Nginx/Caddy) or a platform router that terminates
HTTPS. The session cookie is `Secure` in production, so it requires HTTPS.

### Backups
Everything lives under `DATA_DIR`. Back up that directory (or just
`thoddoo.db`) regularly. SQLite runs in WAL mode; copying the `.db` while the
app is stopped is the simplest safe backup, or use `sqlite3 thoddoo.db ".backup
backup.db"` live.

---

## Security notes

- Passwords are bcrypt-hashed; sessions are signed JWTs in httpOnly, SameSite
  cookies.
- Login and booking endpoints are rate-limited.
- Uploaded documents are stored **outside** the web root and are only readable
  through the authenticated `/api/admin/...` endpoints. They can be deleted from
  the portal (the privacy policy promises deletion after the rental).
- Uploads are restricted by type (images / PDF) and size.
- A Content-Security-Policy is intentionally left off so the existing design
  (Google Fonts, the unpkg React/Babel tweaks panel, inline styles) renders
  unchanged. For production you can tighten this in `server/index.js` — and, if
  you don't need the design-time tweaks panel, remove the React/Babel and
  `tweaks-*.jsx` `<script>` tags from `index.html`.

---

## License

MIT
