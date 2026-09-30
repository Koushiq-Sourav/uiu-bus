<?php
/**
 * PARTITION: TELEGRAM / LIVE STATUS + CONTROL
 * ---------------------------------------------------------
 * Live bus pin in the bot (sendLocation live_period=15min,
 * updated in place via editMessageLiveLocation on every
 * driver fix / cron tick — no chat spam).
 *
 * GET  api/telegram_live.php?trip_id=1
 *   Bus position + live-pin count + freshness (no chat IDs exposed).
 * POST api/telegram_live.php { token(DRIVER), trip_id, lat, lng, heading? }
 *   Manual push (simulator / admin). Mirrors into bus_locations too.
 * POST api/telegram_live.php { token(DRIVER), trip_id, stop: true }
 *   Stop all live pins for the trip.
 * Called by: driver app, simulator, admin.
 */
require __DIR__ . '/config.php';
require __DIR__ . '/telegram_config.php';

uiu_ensure_live_table($pdo);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $tripId = filter_input(INPUT_GET, 'trip_id', FILTER_VALIDATE_INT);
    if (!$tripId) json_response(false, 'Valid trip_id is required.', [], 400);
    $busStmt = $pdo->prepare('SELECT trip_id, lat, lng, updated_at FROM bus_locations WHERE trip_id = ?');
    $busStmt->execute([$tripId]);
    $bus = $busStmt->fetch() ?: null;
    $liveStmt = $pdo->prepare('SELECT COUNT(*) AS c, MAX(updated_at) AS last_push FROM telegram_live WHERE trip_id = ?');
    $liveStmt->execute([$tripId]);
    $live = $liveStmt->fetch() ?: ['c' => 0, 'last_push' => null];
    json_response(true, 'Live status.', [
        'trip_id' => (int)$tripId,
        'bus' => $bus,
        'live_pins' => (int)($live['c'] ?? 0),
        'last_push' => $live['last_push'] ?? null,
        'live_period_s' => 900,
    ]);
}

$data = json_input();
$tripId = filter_var($data['trip_id'] ?? null, FILTER_VALIDATE_INT);
if (!$tripId) json_response(false, 'trip_id is required.', [], 400);

// Stop path.
if (!empty($data['stop'])) {
    require_user($pdo, 'DRIVER', $data);
    $stopped = uiu_stop_live_trip($pdo, (int)$tripId);
    json_response(true, 'Live tracking stopped.', ['trip_id' => (int)$tripId, 'stopped' => $stopped]);
}

// Manual push path (DRIVER only).
$user = require_user($pdo, 'DRIVER', $data);
$lat = filter_var($data['lat'] ?? null, FILTER_VALIDATE_FLOAT);
$lng = filter_var($data['lng'] ?? null, FILTER_VALIDATE_FLOAT);
$heading = null;
if (isset($data['heading'])) {
    $h = filter_var($data['heading'], FILTER_VALIDATE_INT);
    if ($h !== false && $h >= 1 && $h <= 360) $heading = $h;
}
if ($lat === false || $lng === false || $lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
    json_response(false, 'Valid lat (-90..90) and lng (-180..180) are required.', [], 400);
}

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

$live = uiu_push_live_bus($pdo, (int)$tripId, (float)$lat, (float)$lng, $heading);
json_response(true, 'Live pushed.', [
    'trip_id' => (int)$tripId,
    'pushed' => $live['pushed'],
    'started' => $live['started'],
    'driver_id' => $user['username'],
]);
