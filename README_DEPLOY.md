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
- Telegram alerts: BotFather token → hosting env `UIU_TELEGRAM_BOT_TOKEN`
  (local XAMPP: `api/telegram_local.php`, git-ignored — never commit it).
  Students press START once + paste Chat ID at login; schedule
  `GET /api/notify_nearby.php?all=1` every minute (Windows Task Scheduler /
  cron-job.org pointing at your public URL — Render free has no built-in cron).
- LIVE bus pin: driver shares GPS → every fix moves the same Telegram live
  location (`sendLocation live_period=900s` + `editMessageLiveLocation`,
  15s/30m throttled, auto fresh pin after ~14 min). Status:
  `GET /api/telegram_live.php?trip_id=1`. Stop:
  `POST /api/telegram_live.php { token(DRIVER), trip_id, stop:true }`.
- Webhook (instant Chat ID reply, needs public https): set once —
  `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<HOST>/api/telegram_webhook.php?key=<UIU_TELEGRAM_WEBHOOK_SECRET>`
  (optional secret via env `UIU_TELEGRAM_WEBHOOK_SECRET`). Verify with
  `.../getWebhookInfo`. Localhost cannot receive webhooks — students paste
  Chat ID manually there.
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
