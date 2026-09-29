<?php
/**
 * PARTITION: STUDENT BOOKINGS
 * GET api/user_bookings.php?token=
 * Returns the authenticated STUDENT's bookings (one row per booking).
 * Used to restore the "already booked" banner and block a second seat.
 * Called from: assets/js/api.js :: fetchUserBookings()
 */
require __DIR__ . '/config.php';

$user = require_user($pdo, 'STUDENT');

$stmt = $pdo->prepare("
    SELECT
        b.booking_id,
        b.booking_reference,
        b.booking_status,
        b.created_at,
        t.trip_id,
        t.service_date,
        t.departure_time,
        t.arrival_time,
        r.route_code,
        r.route_name,
        GROUP_CONCAT(s.seat_code ORDER BY s.seat_code SEPARATOR ',') AS seat_codes
    FROM booking_student_links bsl
    JOIN bookings b ON b.booking_id = bsl.booking_id
    JOIN trips t ON t.trip_id = bsl.trip_id
    JOIN routes r ON r.route_id = t.route_id
    JOIN booking_seats bs ON bs.booking_id = b.booking_id
    JOIN trip_seats ts ON ts.trip_seat_id = bs.trip_seat_id
    JOIN seats s ON s.seat_id = ts.seat_id
    WHERE bsl.student_id = ?
    GROUP BY b.booking_id
    ORDER BY b.created_at DESC
    LIMIT 50
");
$stmt->execute([$user['username']]);
$bookings = $stmt->fetchAll();

json_response(true, 'Bookings loaded.', ['bookings' => $bookings]);
