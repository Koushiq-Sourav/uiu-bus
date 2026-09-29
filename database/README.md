# Database — uiu_shuttle

## Status
No `uiu_shuttle_booking.sql` was delivered with the project (searched `E:\task`). `README.txt:4` says to import it via phpMyAdmin. You must obtain/create it before testing.

## Expected Schema (inferred from `api/*.php`)

```sql
-- Routes (6)
CREATE TABLE routes (
  route_id   INT AUTO_INCREMENT PRIMARY KEY,
  route_code VARCHAR(20) UNIQUE,   -- e.g. 'Dhanmondi'
  route_name VARCHAR(50) UNIQUE    -- same as code, joined in get_trip.php
);

-- Trips (per route per date)
CREATE TABLE trips (
  trip_id        INT AUTO_INCREMENT PRIMARY KEY,
  route_id       INT NOT NULL REFERENCES routes(route_id),
  service_date   DATE NOT NULL,
  departure_time TIME,
  arrival_time   TIME,
  fare           DECIMAL(8,2) NOT NULL DEFAULT 550.00,
  trip_status    ENUM('SCHEDULED','BOARDING','DEPARTED','CANCELLED') DEFAULT 'SCHEDULED',
  UNIQUE(route_id, service_date)
);

-- Physical seats A1..J4 = 40
CREATE TABLE seats (
  seat_id   INT AUTO_INCREMENT PRIMARY KEY,
  seat_code VARCHAR(4) UNIQUE  -- 'A1'..'J4'
);

-- Per-trip seat state
CREATE TABLE trip_seats (
  trip_seat_id INT AUTO_INCREMENT PRIMARY KEY,
  trip_id      INT NOT NULL REFERENCES trips(trip_id),
  seat_id      INT NOT NULL REFERENCES seats(seat_id),
  seat_status  ENUM('AVAILABLE','BOOKED','BLOCKED','HELD') DEFAULT 'AVAILABLE',
  held_until   DATETIME NULL,
  booking_id   INT NULL REFERENCES bookings(booking_id),
  UNIQUE(trip_id, seat_id)
);

CREATE TABLE passengers (
  passenger_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name    VARCHAR(100) NOT NULL,
  phone        VARCHAR(20) UNIQUE NOT NULL,
  email        VARCHAR(100) NULL
);

CREATE TABLE bookings (
  booking_id        INT AUTO_INCREMENT PRIMARY KEY,
  booking_reference VARCHAR(30) UNIQUE NOT NULL, -- UIU-YYYYMMDDHHmmss-xxxxxx
  passenger_id      INT NOT NULL REFERENCES passengers(passenger_id),
  trip_id           INT NOT NULL REFERENCES trips(trip_id),
  seat_count        TINYINT NOT NULL,
  unit_fare         DECIMAL(8,2) NOT NULL,
  total_amount      DECIMAL(8,2) NOT NULL,
  booking_status    ENUM('CONFIRMED','CANCELLED') DEFAULT 'CONFIRMED',
  payment_status    ENUM('UNPAID','PAID') DEFAULT 'UNPAID',
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE booking_seats (
  booking_id   INT NOT NULL REFERENCES bookings(booking_id),
  trip_seat_id INT NOT NULL REFERENCES trip_seats(trip_seat_id),
  seat_price   DECIMAL(8,2) NOT NULL,
  PRIMARY KEY (booking_id, trip_seat_id)
);
```

## Seed Example
Insert the 6 routes + today's trip + 40 seats per trip, then test:
`GET api/get_trip.php?route=Dhanmondi&date=2026-09-15` should return one `trip_id`.

## Import Steps
1. XAMPP → Start MySQL → `http://localhost/phpmyadmin`
2. Create DB `uiu_shuttle` if missing
3. Import → choose your `uiu_shuttle_booking.sql` (or run the DDL above + inserts)
4. Verify `SELECT count(*) FROM trip_seats WHERE trip_id=1` returns 40.

## Telegram tables (bus-near alerts — auto-created on first API call)

```sql
CREATE TABLE IF NOT EXISTS telegram_links (
  student_id VARCHAR(50) PRIMARY KEY,
  chat_id VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bus_locations (
  trip_id INT PRIMARY KEY,
  lat DOUBLE NOT NULL,
  lng DOUBLE NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_notifications (
  trip_id INT NOT NULL,
  student_id VARCHAR(50) NOT NULL,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (trip_id, student_id)
);

CREATE TABLE IF NOT EXISTS user_locations (
  student_id VARCHAR(50) PRIMARY KEY,
  lat DOUBLE NOT NULL,
  lng DOUBLE NOT NULL,
  accuracy_m DOUBLE NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS booking_student_links (
  booking_id INT PRIMARY KEY,
  trip_id INT NOT NULL,
  student_id VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trip_student (trip_id, student_id)
);
```

Setup: paste the bot token in `api/telegram_config.php`
(`UIU_TELEGRAM_BOT_TOKEN`). The website saves a student's
fresh location after the user grants browser location permission.
Schedule `api/notify_nearby.php?all=1` every minute. The notifier
uses a configurable average bus speed of 24 km/h and a 1.25 road-distance
factor, and sends once per trip when ETA reaches about 5 minutes.
For production, set `UIU_DRIVER_LOCATION_KEY` and send that key with
the driver's GPS POST to `bus_location.php`.

## Fix Required
`api/get_seats.php:6` currently has placeholder `...` SQL — replace with:
```sql
SELECT s.seat_code, ts.seat_status, ts.held_until,
       CASE WHEN ts.seat_status='HELD' AND ts.held_until <= NOW() THEN 'AVAILABLE' ELSE ts.seat_status END AS effective_status
FROM trip_seats ts JOIN seats s ON s.seat_id=ts.seat_id
WHERE ts.trip_id=?
ORDER BY s.seat_code
```
Then `api/get_seats.php` will return the expected `{success, seats: [{seat_code, seat_status, effective_status}]}`.
