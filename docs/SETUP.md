# UIU Shuttle — Setup Guide

## Prerequisites
- XAMPP (Apache + MySQL/MariaDB + PHP 8+)
- 7-Zip or built-in phpMyAdmin
- Modern browser (Chrome/Firefox) with geolocation permission for live map

## 1. Deploy to XAMPP

```powershell
# 1. Copy project into htdocs (professional structure is already XAMPP-ready)
Copy-Item -Recurse -Force "E:\task\uiu-bus\*" "C:\xampp\htdocs\uiu-bus\"

# Result in htdocs:
# htdocs/uiu-bus/index.html
# htdocs/uiu-bus/assets/css/style.css
# htdocs/uiu-bus/assets/js/app.js
# htdocs/uiu-bus/assets/js/utils.js
# htdocs/uiu-bus/assets/images/ (20 files)
# htdocs/uiu-bus/api/config.php etc.
```

Alternatively: deploy `index.html` + `assets/` + `api/` manually to `C:\xampp\htdocs\uiu-bus\`.

## 2. Configure Database

`api/config.php:3` defaults:
```php
$host = '127.0.0.1';
$db   = 'uiu_shuttle';
$user = 'root';
$pass = '';
```
If your MySQL password is not blank, edit `api/config.php`.

### Import SQL
1. Start **Apache** + **MySQL** in XAMPP Control Panel (green)
2. Open `http://localhost/phpmyadmin`
3. Create DB `uiu_shuttle` if not exists
4. **Import** → choose `database/uiu_shuttle_booking.sql` (see `database/README.md` — file was missing in original delivery, you must obtain/export it)
5. Verify tables: `routes, trips, seats, trip_seats, passengers, bookings, booking_seats`

## 3. Run

- Open **`http://localhost/uiu-bus/index.html`** — NOT by double-clicking `index.html` (file:// blocks PHP fetches and CORS)
- Allow location when prompted → live dot + accuracy circle appears on Leaflet map
- Test endpoints directly:
  - `GET http://localhost/uiu-bus/api/get_trip.php?route=Dhanmondi&date=2026-09-15`
  - `GET http://localhost/uiu-bus/api/get_seats.php?trip_id=1`
  - `POST http://localhost/uiu-bus/api/create_booking.php` with JSON `{name,phone,route,trip_id,seats}`

## 4. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `alert: Could not load bus seat availability` | Apache/MySQL off or `api/get_seats.php:6` placeholder `...` SQL | Start XAMPP, fix `get_seats.php` query |
| Seats all gray, no red booked | `uiu_shuttle` not imported or `trip_seats` empty | Import SQL, seed `trip_id` for today |
| `Database connection failed` | Wrong `config.php` credentials | Edit `$user/$pass` |
| Map blank | No internet or Leaflet CSS/JS blocked | Check CDN `unpkg.com/leaflet` reachable |
| `Waiting for location...` forever | Permission denied / HTTP not HTTPS | Serve via `http://localhost` and Allow permission; error 1→ enable location |
| CORS error | Opened via `file://` | Use `http://localhost/uiu-bus/index.html` |

## 5. After Verification

Once you have confirmed `assets/` works:
```powershell
# Remove legacy flat folders (backup already copied)
Remove-Item -Recurse -Force "E:\task\uiu-bus\script"
Remove-Item -Recurse -Force "E:\task\uiu-bus\style"
Remove-Item -Recurse -Force "E:\task\uiu-bus\images"
```
Keep `assets/` + `api/` as source of truth.
