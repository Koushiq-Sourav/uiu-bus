# Telegram 5-Minute Bus Alerts

## What it does
- Driver posts live bus GPS to `api/bus_location.php`.
- A logged-in student who grants location permission sends a fresh GPS position to `api/user_location.php`.
- `api/notify_nearby.php?all=1` checks today's trips every minute.
- When estimated travel time is about 5 minutes or less, the student receives one Telegram message for that trip.
- The alert still works if the student's browser is later closed because the server/cron performs the Telegram send.

## Important setup
1. Create a Telegram bot with BotFather and copy the bot token.
2. Put the token in `api/telegram_config.php` as `UIU_TELEGRAM_BOT_TOKEN`.
3. The student must start the bot and provide/link their Telegram Chat ID once.
4. The student should allow browser location access and press **My Location** so the site starts watching their location.
5. Keep the driver's GPS feed updating `bus_location.php`.
6. Schedule `notify_nearby.php?all=1` every minute using Windows Task Scheduler, cron, or a server scheduler.

## ETA calculation
`ETA = (GPS distance × 1.25 road factor) ÷ 24 km/h`

These are configurable estimates, not guaranteed arrival times. Change `UIU_AVG_BUS_SPEED_KMH`, `UIU_ROAD_DISTANCE_FACTOR`, and `UIU_ALERT_ETA_MINUTES` in `api/telegram_config.php` for your deployment.

## LIVE bus pin in the bot (new)
- Driver POSTs GPS to `api/bus_location.php` or `api/driver_location.php` (or `api/telegram_live.php`).
- Server instantly pushes the fix to every CONFIRMED booking with a linked Chat ID as a Telegram LIVE location (`sendLocation live_period=900s`, 15 min).
- Next fixes MOVE the same pin (`editMessageLiveLocation`) — no spam. Throttled: skips <15s + <30m moves; auto re-sends a fresh pin after ~14 min (expiry).
- Cron `api/notify_nearby.php?all=1` also moves pins every minute, so the bot stays live even if the driver posts from only one endpoint.
- Status: `GET api/telegram_live.php?trip_id=1` → bus position + live_pins count (no chat IDs exposed).
- Stop: `POST api/telegram_live.php { token(DRIVER), trip_id, stop:true }` or `GET api/notify_nearby.php?stop_trip=1`.
- New table `telegram_live (trip_id, student_id, chat_id, message_id, last_lat, last_lng)` — auto-created, also in `database/schema.sql`.

## Test without sending
Open:
`api/notify_nearby.php?trip_id=1&dry=1`

The response shows which students would be notified, their estimated ETA, and the distance.
