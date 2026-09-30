-- =========================================================
-- UIU SHUTTLE — FULL DATABASE SCHEMA (uiu_shuttle)
-- ---------------------------------------------------------
-- Import: XAMPP → phpMyAdmin → create DB `uiu_shuttle` → Import this file.
-- Idempotent: safe to re-run (CREATE TABLE IF NOT EXISTS + INSERT ... ON
-- DUPLICATE KEY UPDATE / NOT EXISTS guards).
-- Seeds: 6 routes, seats A1..J4, trips for today + next 13 days,
--        trip_seats for every trip, and one demo driver account whose
--        password is set by api/register-style bcrypt — created only via
--        the demo bootstrap snippet below (see NOTE).
-- =========================================================

CREATE DATABASE IF NOT EXISTS uiu_shuttle CHARACTER SET utf8mb4;
USE uiu_shuttle;

-- --- Routes (6 shuttle lines) ---
CREATE TABLE IF NOT EXISTS routes (
  route_id   INT AUTO_INCREMENT PRIMARY KEY,
  route_code VARCHAR(20) UNIQUE,   -- e.g. 'Dhanmondi'
  route_name VARCHAR(50) UNIQUE    -- same as code, joined in get_trip.php
);

INSERT INTO routes (route_code, route_name) VALUES
  ('Dhanmondi','Dhanmondi'),
  ('Mirpur','Mirpur'),
  ('Signboard','Signboard'),
  ('Jatrabari','Jatrabari'),
  ('Palashi','Palashi'),
  ('Uttara','Uttara')
ON DUPLICATE KEY UPDATE route_name = VALUES(route_name);

-- --- Trips (per route per date) ---
CREATE TABLE IF NOT EXISTS trips (
  trip_id        INT AUTO_INCREMENT PRIMARY KEY,
  route_id       INT NOT NULL REFERENCES routes(route_id),
  service_date   DATE NOT NULL,
  departure_time TIME,
  arrival_time   TIME,
  fare           DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  trip_status    ENUM('SCHEDULED','BOARDING','DEPARTED','CANCELLED') DEFAULT 'SCHEDULED',
  UNIQUE(route_id, service_date)
);

-- --- Physical seats A1..J4 = 40 ---
CREATE TABLE IF NOT EXISTS seats (
  seat_id   INT AUTO_INCREMENT PRIMARY KEY,
  seat_code VARCHAR(4) UNIQUE  -- 'A1'..'J4'
);

INSERT IGNORE INTO seats (seat_code)
SELECT CONCAT(c.letter, n.d)
FROM (SELECT 'A' letter UNION SELECT 'B' UNION SELECT 'C' UNION SELECT 'D' UNION SELECT 'E'
      UNION SELECT 'F' UNION SELECT 'G' UNION SELECT 'H' UNION SELECT 'I' UNION SELECT 'J') c
CROSS JOIN (SELECT 1 d UNION SELECT 2 UNION SELECT 3 UNION SELECT 4) n;

-- --- Per-trip seat state ---
CREATE TABLE IF NOT EXISTS trip_seats (
  trip_seat_id INT AUTO_INCREMENT PRIMARY KEY,
  trip_id      INT NOT NULL REFERENCES trips(trip_id),
  seat_id      INT NOT NULL REFERENCES seats(seat_id),
  seat_status  ENUM('AVAILABLE','BOOKED','BLOCKED','HELD') DEFAULT 'AVAILABLE',
  held_until   DATETIME NULL,
  booking_id   INT NULL REFERENCES bookings(booking_id),
  UNIQUE(trip_id, seat_id)
);

-- --- Passengers (reused when the phone matches) ---
CREATE TABLE IF NOT EXISTS passengers (
  passenger_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name    VARCHAR(100) NOT NULL,
  phone        VARCHAR(20) UNIQUE NOT NULL,
  email        VARCHAR(100) NULL
);

-- --- Bookings ---
CREATE TABLE IF NOT EXISTS bookings (
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

CREATE TABLE IF NOT EXISTS booking_seats (
  booking_id   INT NOT NULL REFERENCES bookings(booking_id),
  trip_seat_id INT NOT NULL REFERENCES trip_seats(trip_seat_id),
  seat_price   DECIMAL(8,2) NOT NULL,
  PRIMARY KEY (booking_id, trip_seat_id)
);

-- --- THE ONE-SEAT RULE: student ↔ booking link ---
-- One row per booking. create_booking.php checks
-- (trip_id, student_id) here before inserting — per-student, not global.
CREATE TABLE IF NOT EXISTS booking_student_links (
  booking_id INT PRIMARY KEY,
  trip_id INT NOT NULL,
  student_id VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trip_student (trip_id, student_id)
);

-- --- Users (STUDENT + DRIVER, bcrypt password hashes) ---
CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,   -- Student ID / Driver ID / Email
  full_name VARCHAR(100) NOT NULL DEFAULT '',
  email VARCHAR(100) NULL,
  phone VARCHAR(20) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('STUDENT','DRIVER') NOT NULL DEFAULT 'STUDENT',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --- Server-side sessions (deleted on logout) ---
CREATE TABLE IF NOT EXISTS auth_tokens (
  token VARCHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  INDEX idx_user (user_id)
);

-- --- Verified driver GPS fixes (server-side validated) ---
CREATE TABLE IF NOT EXISTS driver_locations (
  driver_id VARCHAR(50) PRIMARY KEY,
  lat DOUBLE NOT NULL,
  lng DOUBLE NOT NULL,
  accuracy_m DOUBLE NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- --- Telegram alerts tables (auto-created by the APIs too) ---
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

-- Live pins: one moving Telegram location message per (trip, student).
-- message_id lets the server move the SAME pin via editMessageLiveLocation
-- instead of spamming new messages. Auto-created by the APIs too.
CREATE TABLE IF NOT EXISTS telegram_live (
  trip_id INT NOT NULL,
  student_id VARCHAR(50) NOT NULL,
  chat_id VARCHAR(50) NOT NULL,
  message_id BIGINT NOT NULL,
  last_lat DOUBLE NOT NULL,
  last_lng DOUBLE NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (trip_id, student_id)
);

CREATE TABLE IF NOT EXISTS user_locations (
  student_id VARCHAR(50) PRIMARY KEY,
  lat DOUBLE NOT NULL,
  lng DOUBLE NOT NULL,
  accuracy_m DOUBLE NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- --- Seed trips: every route × today + next 13 days (IGNORE keeps
-- existing rows untouched on re-import, so live trip_status is preserved) ---
INSERT IGNORE INTO trips (route_id, service_date, departure_time, arrival_time, fare, trip_status)
SELECT r.route_id, DATE(CURDATE() + INTERVAL nums.n DAY), '08:00:00', '09:30:00', 0.00, 'SCHEDULED'
FROM routes r
JOIN (
  SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6
  UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13
) nums;

-- --- Seed trip_seats: 40 AVAILABLE seats for every trip ---
INSERT INTO trip_seats (trip_id, seat_id, seat_status)
SELECT t.trip_id, s.seat_id, 'AVAILABLE'
FROM trips t
JOIN seats s
WHERE NOT EXISTS (
  SELECT 1 FROM trip_seats ts WHERE ts.trip_id = t.trip_id AND ts.seat_id = s.seat_id
);

-- --- Demo driver account ---
-- Login: Driver ID = driver01 / Password = driver123
-- INSERT IGNORE keeps an existing account untouched.
INSERT IGNORE INTO users (username, full_name, password_hash, role)
VALUES ('driver01', 'Demo Driver', '$2y$12$WWr/e/JhzoQjiNmC2w26WesIwBbXhVOkvKXc5toaD0vM7aPDQvLeC', 'DRIVER');

-- =========================================================
-- DEMO ACCOUNTS (bcrypt hashes cannot go in plain SQL safely).
-- Run these tiny snippets once via `php -r` or a scratch PHP page
-- after importing, e.g. Test student + driver:
--
--   $pdo = new PDO('mysql:host=127.0.0.1;dbname=uiu_shuttle;charset=utf8mb4', 'root', '');
--   $pdo->prepare("INSERT INTO users (username, full_name, password_hash, role) VALUES (?, ?, ?, ?)")
--       ->execute(['011221001', 'Demo Student', password_hash('student123', PASSWORD_DEFAULT), 'STUDENT']);
--   $pdo->prepare("INSERT INTO users (username, full_name, password_hash, role) VALUES (?, ?, ?, ?)")
--       ->execute(['driver01', 'Demo Driver', password_hash('driver123', PASSWORD_DEFAULT), 'DRIVER']);
--
-- Without a database (file:// preview) the website still works in
-- demo mode: any ID + password ≥ 4 chars is accepted as a demo session.
-- =========================================================
