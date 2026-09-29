<?php
/**
 * PARTITION: DRIVER DASHBOARD DATA
 * GET api/driver_dashboard.php?token=
 * - Requires a DRIVER auth token (students get 403 "Unauthorized access.").
 * - Returns the driver profile, the latest verified location
 *   (or null until a live GPS fix is posted) and today's trips.
 * Called from: assets/js/auth.js :: fetchDriverDashboard()
 */
require __DIR__ . '/config.php';

$user = require_user($pdo, 'DRIVER');

$location = null;
try {
    $stmt = $pdo->prepare('SELECT lat, lng, accuracy_m, updated_at FROM driver_locations WHERE driver_id = ?');
    $stmt->execute([$user['username']]);
    $location = $stmt->fetch() ?: null;
} catch (Throwable $e) {
    $location = null;
}

$trips = [];
try {
    $stmt = $pdo->prepare("
        SELECT
            t.trip_id,
            r.route_code,
            r.route_name,
            t.service_date,
            t.departure_time,
            t.arrival_time,
            t.trip_status,
            (SELECT COUNT(*) FROM trip_seats ts WHERE ts.trip_id = t.trip_id AND ts.seat_status = 'AVAILABLE') AS seats_left
        FROM trips t
        JOIN routes r ON r.route_id = t.route_id
        WHERE t.service_date = CURDATE()
        ORDER BY t.departure_time
    ");
    $stmt->execute();
    $trips = $stmt->fetchAll();
} catch (Throwable $e) {
    $trips = [];
}

json_response(true, 'Driver dashboard.', [
    'driver' => [
        'driver_id' => $user['username'],
        'name' => ($user['full_name'] ?? '') !== '' ? $user['full_name'] : $user['username'],
    ],
    'location' => $location,
    'trips' => $trips,
]);
