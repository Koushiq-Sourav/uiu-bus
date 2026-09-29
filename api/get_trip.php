<?php
/**
 * PARTITION: API / TRIP LOOKUP
 * GET api/get_trip.php?route=Dhanmondi&date=YYYY-MM-DD → {trip_id, fare, route_code}
 * Called from: assets/js/api.js :: loadTripAndSeats()
 */
require __DIR__ . '/config.php';

$route = trim($_GET['route'] ?? '');
$date  = trim($_GET['date'] ?? date('Y-m-d'));

if ($route === '') {
    json_response(false, 'Route is required.', [], 400);
}


$stmt = $pdo->prepare("
    SELECT t.trip_id, r.route_code, r.route_name, t.service_date, t.departure_time, t.arrival_time, t.fare
    FROM trips t
    JOIN routes r ON r.route_id = t.route_id
    WHERE (r.route_code = ? OR r.route_name = ?) AND t.service_date = ?
");
$stmt->execute([$route, $route, $date]);
$trip = $stmt->fetch();

if (!$trip) {
    json_response(false, 'No scheduled trip found for this route/date.', [], 404);
}

json_response(true, 'Trip found.', ['trip' => $trip]);
