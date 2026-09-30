<?php
/**
 * PARTITION: DRIVER LOCATION FEED
 * ---------------------------------------------------------
 * Driver-only endpoint (requires DRIVER auth token).
 * Location is validated server-side — no hard-coded values accepted.
 * When trip_id is supplied, the same fix is MIRRORED into
 * bus_locations so notify_nearby.php + the live student map see
 * the bus immediately (single POST drives both tables).
 *
 * POST api/driver_location.php { token, lat, lng, accuracy?, trip_id? }
 *   Saves the driver's latest verified GPS fix (+ mirrors to bus feed).
 * GET  api/driver_location.php?token=
 *   Returns the driver's latest verified fix.
 * Called from: assets/js/api.js :: driverSendLocation() / fetchDriverLocation()
 */
require __DIR__ . '/config.php';

$pdo->exec("
    CREATE TABLE IF NOT EXISTS driver_locations (
        driver_id VARCHAR(50) PRIMARY KEY,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        accuracy_m DOUBLE NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
");

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $user = require_user($pdo, 'DRIVER');
    $stmt = $pdo->prepare('SELECT driver_id, lat, lng, accuracy_m, updated_at FROM driver_locations WHERE driver_id = ?');
    $stmt->execute([$user['username']]);
    $row = $stmt->fetch();
    if (!$row) {
        json_response(false, 'No verified location yet for this driver.', [], 404);
    }
    json_response(true, 'Driver location.', ['location' => $row]);
}

$data = json_input();
$user = require_user($pdo, 'DRIVER', $data);

$lat = filter_var($data['lat'] ?? null, FILTER_VALIDATE_FLOAT);
$lng = filter_var($data['lng'] ?? null, FILTER_VALIDATE_FLOAT);
$accuracy = filter_var($data['accuracy'] ?? null, FILTER_VALIDATE_FLOAT);
$tripId = filter_var($data['trip_id'] ?? null, FILTER_VALIDATE_INT);

if ($lat === false || $lng === false || $lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
    json_response(false, 'Valid lat (-90..90) and lng (-180..180) are required.', [], 400);
}

$stmt = $pdo->prepare('REPLACE INTO driver_locations (driver_id, lat, lng, accuracy_m) VALUES (?, ?, ?, ?)');
$stmt->execute([$user['username'], $lat, $lng, $accuracy === false ? null : $accuracy]);

// MIRROR: same GPS fix becomes the bus position for this trip so the
// student map + notify_nearby.php work without a second POST.
$mirroredTripId = null;
$livePushed = 0;
$liveStarted = 0;
if ($tripId) {
    $tripCheck = $pdo->prepare('SELECT trip_id FROM trips WHERE trip_id = ?');
    $tripCheck->execute([$tripId]);
    if ($tripCheck->fetch()) {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS bus_locations (
                trip_id INT PRIMARY KEY,
                lat DOUBLE NOT NULL,
                lng DOUBLE NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        ");
        $mirror = $pdo->prepare('REPLACE INTO bus_locations (trip_id, lat, lng) VALUES (?, ?, ?)');
        $mirror->execute([$tripId, $lat, $lng]);
        $mirroredTripId = (int)$tripId;
        // LIVE WIRING: same fix moves the Telegram pin for all subscribers.
        try {
            require_once __DIR__ . '/telegram_config.php';
            $live = uiu_push_live_bus($pdo, $mirroredTripId, (float)$lat, (float)$lng, null);
            $livePushed = $live['pushed'];
            $liveStarted = $live['started'];
        } catch (Throwable $e) { /* best-effort */ }
    }
}

json_response(true, 'Location saved.', [
    'driver_id' => $user['username'],
    'location' => ['lat' => $lat, 'lng' => $lng, 'accuracy_m' => $accuracy === false ? null : $accuracy],
    'mirrored_trip_id' => $mirroredTripId,
    'telegram_live' => ['pushed' => $livePushed, 'started' => $liveStarted]
]);
