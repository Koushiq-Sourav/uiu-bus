# UIU Shuttle Booking — Project Overview

Professional separation completed 2026-09-15.

## 1. What this is
XAMPP + PHP + MySQL shuttle booking system for United International University.  
Frontend is a single-page app with seat selection (40 seats, max 4/booking), route cards, and Leaflet live-map. Backend is 6 PHP REST endpoints (login/logout + trip/seats/booking + config) that read/write the `uiu_shuttle` database.

## 2. Professional Folder Structure

```
uiu-bus/
├── index.html              # FRONTEND ENTRY — 9 PARTITIONS commented — keep at root so http://localhost/uiu-bus/ works
├── assets/                 # FRONTEND ASSETS (no PHP) — 9 partitions, see docs/PARTITIONS.md
│   ├── css/
│   │   └── style.css       # 9 sections: fonts, hero, seats, booking, routes, login modal, live-map (285 lines)
│   ├── js/                 # 9 JS PARTITIONS (load order in index.html matters):
│   │   ├── config.js       # PARTITION: CONFIG — global state (40 seats, fare, auth, map)
│   │   ├── utils.js        # PARTITION: HELPERS — seat color + price helpers (pure DOM)
│   │   ├── api.js          # PARTITION: API — fetch trip/seats from PHP
│   │   ├── auth.js         # PARTITION: 🔐 LOGIN — modal + token + gate
│   │   ├── routes.js       # PARTITION: 🛣️ ROUTES — 6 routes ×7 stops, dropdown
│   │   ├── seats.js        # PARTITION: 💺 SEAT CHOOSING — A1-J4 grid, max 4
│   │   ├── booking.js      # PARTITION: 🧾 BOOKING — form + POST create_booking.php
│   │   ├── map.js          # PARTITION: 🗺️ LIVE LOCATION — Leaflet OSM + 6 polylines
│   │   └── app.js          # PARTITION: ENTRY — wires all together (DOMContentLoaded)
│   └── images/             # 20 files (banner, bus, seats, 4 slides, icons) — canonical (2.7 MB)
├── api/                    # BACKEND — PHP REST (6 files, each PARTITION header)
│   ├── config.php          # PARTITION: CONFIG — PDO + json helpers
│   ├── get_trip.php        # PARTITION: API / TRIP LOOKUP
│   ├── get_seats.php       # PARTITION: API / SEAT MAP — FIXED 2026-09-15
│   ├── create_booking.php  # PARTITION: BOOKING — transactional
│   ├── login.php           # PARTITION: 🔐 LOGIN — demo token
│   └── logout.php          # PARTITION: 🔐 LOGIN — stateless
├── database/
│   └── README.md           # schema + seed guide (sql dump was missing)
├── docs/
│   ├── PARTITIONS.md       # ← YOU ASKED: which part is login / seat choosing / others
│   ├── README.md           # this file
│   ├── SETUP.md            # XAMPP install + import + run
│   └── ARCHITECTURE.md     # full responsibility map
├── images/                 # DEPRECATED duplicate — cleaned 2026-09-15, now only DEPRECATED.txt marker
└── README.txt              # legacy flat-structure guide (kept for reference)

Why at root? `index.html` + `api/` at root matches XAMPP expectation:
`C:\xampp\htdocs\uiu-bus\` → `http://localhost/uiu-bus/index.html` and `http://localhost/uiu-bus/api/`
no CORS issues. `assets/` is pure static and cacheable.
```

## 3. Layer Responsibilities (separated)

| Layer | Folder | Files | Owns |
|-------|--------|-------|------|
| **Presentation** | `index.html` + `assets/css` + `assets/images` | HTML 9 partitions, CSS 9 sections, 20 images | UI, hero, carousel, seat grid, route card, success |
| **Client Logic** | `assets/js/` (9 partitions) | `config, utils, api, auth, routes, seats, booking, map, app` | LOGIN (`auth.js`), SEAT CHOOSING (`seats.js`), BOOKING (`booking.js`), ROUTES (`routes.js`), LIVE LOCATION (`map.js`) |
| **Backend** | `api/` (6 files) | `config, get_trip, get_seats, create_booking, login, logout` | trip lookup, seat map, transactional booking, auth |
| **Data** | `database/` + MySQL | `uiu_shuttle` | `routes, trips, seats, trip_seats, passengers, bookings, booking_seats` |
| **Docs** | `docs/` | `PARTITIONS.md, README.md, SETUP.md, ARCHITECTURE.md` | partition map you asked for + setup |

**Answer you asked — which part is which:**
- **Which part is LOGIN (cs part for log)?** → `assets/js/auth.js:1` + `assets/js/config.js:22` (state) + `api/login.php:1` + `api/logout.php:1` + HTML `#login-modal:381` / `#login-btn:83`
- **Which part is SEAT CHOOSING?** → `assets/js/seats.js:1` + `assets/js/utils.js:17` + `assets/css/style.css:58` + HTML `#purchase-section` left grid `A1-J4`
- **Which are OTHERS?** → See `docs/PARTITIONS.md` full table (routes, booking, map, api, config, presentation, carousel, footer)

No mixing: static assets never touch PHP, backend never serves HTML, DB logic lives only in `api/`.

## 4. Quick Run (see `docs/SETUP.md` for full steps)
1. Copy `api/` + `index.html` + `assets/` to `C:\xampp\htdocs\uiu-bus\`
2. Start Apache + MySQL in XAMPP
3. Import `database/uiu_shuttle_booking.sql` via phpMyAdmin (file was missing — see `database/README.md`)
4. Open `http://localhost/uiu-bus/index.html` (never double-click file://)

## 5. What was fixed during separation (2026-09-15) — Round 2 polished 2026-09-15
- **Round 1:** Moved `style/style.css` → `assets/css/style.css`, `script/script.js` → `assets/js/app.js`, `script/utility.js` → `assets/js/utils.js`, `images/*` → `assets/images/*` (14 `src` refs updated); banner `url('../images/banner.png')` already correct; `api/` kept at root (`API_BASE='api/'`)
- **Round 2 (today):** Split monolithic `app.js` (814 lines) into **9 partitions** `config/utils/api/auth/routes/seats/booking/map/app` with `PARTITION:` headers; created `auth.js` + `login.php/logout.php` for LOGIN you asked; fixed `api/get_seats.php:11` `...` placeholder → real SQL; fixed duplicate `id="booking-reference"` bug → `booking-reference-inline` + `booking-reference-success`; added `PARTITION:` headers to `api/config.php/get_trip/get_seats/create_booking`; cleaned legacy `images/` duplicate (2,774,868 bytes identical → now only `DEPRECATED.txt` marker, 20 files removed); updated `docs/ARCHITECTURE.md` + `docs/README.md` to reflect 9-partition structure
- Old `script/`, `style/` folders already deleted; `images/` now cleaned — safe to delete entire `images/` folder

## 6. Known remaining task
- No `*.sql` dump in original delivery — create/import before testing booking (see `database/README.md` DDL). All code partitions are now clean; only DB seed remains.

— Trikala, 2026-09-15
