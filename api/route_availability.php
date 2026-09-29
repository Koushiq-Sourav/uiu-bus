<?php
/**
 * PARTITION: API / ROUTE AVAILABILITY (BULK)
 * ---------------------------------------------------------
 * One request for the whole student-facing overview:
 * GET api/route_availability.php?date=YYYY-MM-DD (default today)
 * -> routes: [{ route_code, trip_id, departure_time, arrival_time,
 *               seats_left, total_seats }]
 * - Expired HELD seats are released per trip (same rule as get_seats).
 * - Used by: assets/js/api.js :: refreshRouteAvailability() to paint
 *   per-route "N left" labels + keep the shuttle card times live after
 *   the driver retimes a trip.
 */
require __DIR__ . '/config.php';

$date = trim($_GET['date'] ?? date('Y-m-d'));
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
    json_response(false, 'Valid date (YYYY-MM-DD) is required.', [], 400);
}

$routes = $pdo->query('SELECT route_id, route_code FROM routes ORDER BY route_id')->fetchAll();
$out = [];

foreach ($routes as $r) {
    $tripStmt = $pdo->prepare('SELECT trip_id, departure_time, arrival_time FROM trips WHERE route_id = ? AND service_date = ? LIMIT 1');
    $tripStmt->execute([$r['route_id'], $date]);
    $trip = $tripStmt->fetch();
    if (!$trip) {
        $out[] = [
            'route_code' => $r['route_code'],
            'trip_id' => null,
            'departure_time' => null,
            'arrival_time' => null,
            'seats_left' => null,
            'total_seats' => 40,
        ];
        continue;
    }
    $tid = (int)$trip['trip_id'];
    // Same expiry rule as get_seats.php so counts agree everywhere.
    $release = $pdo->prepare("
        UPDATE trip_seats
        SET seat_status = 'AVAILABLE', held_until = NULL, booking_id = NULL
        WHERE trip_id = ?
          AND seat_status = 'HELD'
          AND held_until IS NOT NULL
          AND held_until <= NOW()
    ");
    $release->execute([$tid]);

    $count = $pdo->prepare("
        SELECT COUNT(*) AS left_count, 40 AS total_count
        FROM trip_seats ts
        JOIN seats s ON s.seat_id = ts.seat_id
        WHERE ts.trip_id = ?
          AND (ts.seat_status = 'AVAILABLE'
               OR (ts.seat_status = 'HELD' AND ts.held_until IS NOT NULL AND ts.held_until <= NOW()))
    ");
    $count->execute([$tid]);
    $row = $count->fetch();

    $out[] = [
        'route_code' => $r['route_code'],
        'trip_id' => $tid,
        'departure_time' => $trip['departure_time'],
        'arrival_time' => $trip['arrival_time'],
        'seats_left' => (int)($row['left_count'] ?? 0),
        'total_seats' => (int)($row['total_count'] ?? 40),
    ];
}

json_response(true, 'Route availability.', ['date' => $date, 'routes' => $out]);
