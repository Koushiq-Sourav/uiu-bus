# UIU-BUS — Deploy

## Option A — Local, one command (recommended check before going live)
Needs Docker Desktop only (no XAMPP):
```
cd E:\uiu-bus
docker compose up --build
```
Open http://localhost:8080/index.html — DB is auto-created from
`database/schema.sql` (6 routes, seats A1–J4, 14 days of trips, demo
driver `driver01/driver123`). Demo student: register any ID (min 4-char
password), then log in.

## Option B — Render (public link)
1. Push this repo (already at github.com/Koushiq-Sourav/uiu-bus).
2. Create a hosted MySQL (Railway / PlanetScale / ClearDB) + import
   `database/schema.sql` once via its console.
3. Render → New → Web Service → select this repo (Docker). Set env:
   `DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASS` to the MySQL values.
4. Deploy → open `https://uiu-bus.onrender.com/index.html`.

## Option C — XAMPP (class demo machine)
Copy to `C:\xampp\htdocs\uiu-bus`, Apache+MySQL on, phpMyAdmin → create
`uiu_shuttle` → Import `database/schema.sql` → open
`http://localhost/uiu-bus/index.html`.

## After deploy (all options)
- Telegram alerts: BotFather token → `api/telegram_config.php`
  (`UIU_TELEGRAM_BOT_TOKEN`), students press START once + paste Chat ID
  at login; schedule `GET /api/notify_nearby.php?all=1` every minute.
- Driver flow: Driver Login (`driver01/driver123`) → share GPS →
  Today's Trips → Set Active → Trip Timing departure → Save.
- Student flow: pick route (card dropdown / Destination / map) → times +
  stop ETAs are the driver's live values → seat turns red for everyone
  after booking (15s poll + instant pre-POST recheck).

## Note — Vercel
Vercel is Node/serverless and cannot run `api/*.php` or MySQL, so the
full app (login, booking, live bus, timings) will NOT work there. Use
Render/Railway/cPanel for the whole thing, or Vercel for the static
frontend only (bookings disabled).
