<?php
/**
 * PARTITION: DRIVER TRIP TIMING
 * ---------------------------------------------------------
 * Driver-only endpoint (requires DRIVER auth token).
 * Lets the driver adjust the departure time of a trip; the
 * frontend computes the road-based arrival (OSRM duration) and
 * sends both. Students see the new times live via get_trip.php.
 *
 * POST api/driver_update_trip.php { token, trip_id, departure_time, arrival_time }
 *   Times as "HH:MM" or "HH:MM:SS" (24h). Arrival must be after
 *   departure on the same service day.
 * Called from: assets/js/auth.js :: saveDriverTiming()
 */
require __DIR__ . '/config.php';

$data = json_input();
$user = require_user($pdo, 'DRIVER', $data);

$tripId = filter_var($data['trip_id'] ?? null, FILTER_VALIDATE_INT);
$depRaw = trim((string)($data['departure_time'] ?? ''));
$arrRaw = trim((string)($data['arrival_time'] ?? ''));

function parse_trip_time(string $v): ?string {
    if (!preg_match('/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/', $v, $m)) return null;
    return $m[1] . ':' . $m[2] . ':' . ($m[3] ?? '00');
}

$dep = parse_trip_time($depRaw);
$arr = parse_trip_time($arrRaw);

if (!$tripId || $dep === null || $arr === null) {
    json_response(false, 'trip_id and valid departure_time / arrival_time (HH:MM) are required.', [], 400);
}

if (strtotime($arr) <= strtotime($dep)) {
    json_response(false, 'Arrival time must be after departure time.', [], 400);
}

$check = $pdo->prepare('SELECT trip_id, service_date FROM trips WHERE trip_id = ?');
$check->execute([$tripId]);
$trip = $check->fetch();
if (!$trip) {
    json_response(false, 'Trip not found.', [], 404);
}

$upd = $pdo->prepare('UPDATE trips SET departure_time = ?, arrival_time = ? WHERE trip_id = ?');
$upd->execute([$dep, $arr, $tripId]);

$back = $pdo->prepare("
    SELECT t.trip_id, r.route_code, r.route_name, t.service_date,
           t.departure_time, t.arrival_time, t.trip_status
    FROM trips t
    JOIN routes r ON r.route_id = t.route_id
    WHERE t.trip_id = ?
");
$back->execute([$tripId]);

json_response(true, 'Trip timing updated.', ['trip' => $back->fetch()]);
