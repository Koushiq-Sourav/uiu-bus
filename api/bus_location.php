<?php
/**
 * PARTITION: TELEGRAM / BUS GPS FEED
 * ---------------------------------------------------------
 * Driver app (or simulator) posts the live bus position:
 *   POST api/bus_location.php { trip_id, lat, lng }
 * Frontend / cron reads the latest position:
 *   GET  api/bus_location.php?trip_id=1
 * Table auto-created on first call.
 */
require __DIR__ . '/config.php';
require __DIR__ . '/telegram_config.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $tripId = filter_input(INPUT_GET, 'trip_id', FILTER_VALIDATE_INT);
    if (!$tripId) json_response(false, 'Valid trip_id is required.', [], 400);
    $stmt = $pdo->prepare('SELECT trip_id, lat, lng, updated_at FROM bus_locations WHERE trip_id = ?');
    $stmt->execute([$tripId]);
    $row = $stmt->fetch();
    if (!$row) json_response(false, 'No location yet for this trip.', [], 404);
    json_response(true, 'Bus location.', ['location' => $row]);
}

$data = json_input();
if (UIU_DRIVER_LOCATION_KEY !== '') {
    $providedKey = (string)($data['driver_key'] ?? ($_SERVER['HTTP_X_UIU_DRIVER_KEY'] ?? ''));
    if (!hash_equals(UIU_DRIVER_LOCATION_KEY, $providedKey)) {
        json_response(false, 'Unauthorized bus location update.', [], 401);
    }
}
$tripId = filter_var($data['trip_id'] ?? null, FILTER_VALIDATE_INT);
$lat = filter_var($data['lat'] ?? null, FILTER_VALIDATE_FLOAT);
$lng = filter_var($data['lng'] ?? null, FILTER_VALIDATE_FLOAT);

if (!$tripId || $lat === false || $lng === false || $lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
    json_response(false, 'trip_id, lat (-90..90) and lng (-180..180) are required.', [], 400);
}

$pdo->exec("
    CREATE TABLE IF NOT EXISTS bus_locations (
        trip_id INT PRIMARY KEY,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
");

$stmt = $pdo->prepare('REPLACE INTO bus_locations (trip_id, lat, lng) VALUES (?, ?, ?)');
$stmt->execute([$tripId, $lat, $lng]);

json_response(true, 'Location saved.', ['trip_id' => $tripId, 'lat' => $lat, 'lng' => $lng]);
