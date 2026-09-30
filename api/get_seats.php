<?php
/**
 * PARTITION: API / SEAT MAP
 * GET api/get_seats.php?trip_id=1&token=
 * - Cleans expired HELD → AVAILABLE
 * - Returns 40 seats with effective_status
 * - When a student token is provided, also returns that student's
 *   own confirmed booking for this trip (`student_booking`) — the UI
 *   uses it for the "already booked" banner and the one-seat block.
 * Called from: assets/js/api.js :: loadBookedSeats()
 * Feeds: SEAT CHOOSING (assets/js/seats.js) — paints red/gray
 */
require __DIR__ . '/config.php';

$tripId = filter_input(INPUT_GET, 'trip_id', FILTER_VALIDATE_INT);
if (!$tripId) {
    json_response(false, 'Valid trip_id is required.', [], 400);
}


// Clean up expired holds so the real status is consistent for the next request.
$release = $pdo->prepare("
    UPDATE trip_seats
    SET seat_status = 'AVAILABLE', held_until = NULL, booking_id = NULL
    WHERE trip_id = ?
      AND seat_status = 'HELD'
      AND held_until IS NOT NULL
      AND held_until <= NOW()
");
$release->execute([$tripId]);

// Main seat map: return 40 seats with effective_status (expired HELD -> AVAILABLE)
$stmt = $pdo->prepare("
    SELECT
        s.seat_code,
        ts.trip_seat_id,
        ts.seat_status,
        ts.held_until,
        ts.booking_id,
        CASE
            WHEN ts.seat_status = 'HELD' AND ts.held_until IS NOT NULL AND ts.held_until <= NOW()
            THEN 'AVAILABLE'
            ELSE ts.seat_status
        END AS effective_status
    FROM trip_seats ts
    JOIN seats s ON s.seat_id = ts.seat_id
    WHERE ts.trip_id = ?
    ORDER BY s.seat_code
");
$stmt->execute([$tripId]);
$seats = $stmt->fetchAll();

// The logged-in student's own confirmed booking on this trip (if any).
$studentBooking = null;
$authUser = current_user($pdo);
if ($authUser && $authUser['role'] === 'STUDENT') {
    try {
        $mineStmt = $pdo->prepare("
            SELECT b.booking_id, b.booking_reference, s.seat_code
            FROM booking_student_links bsl
            JOIN bookings b ON b.booking_id = bsl.booking_id
            JOIN booking_seats bs ON bs.booking_id = b.booking_id
            JOIN trip_seats ts ON ts.trip_seat_id = bs.trip_seat_id
            JOIN seats s ON s.seat_id = ts.seat_id
            WHERE bsl.trip_id = ?
              AND bsl.student_id = ?
              AND b.booking_status = 'CONFIRMED'
            LIMIT 1
        ");
        $mineStmt->execute([$tripId, $authUser['username']]);
        $mine = $mineStmt->fetch();
        if ($mine) {
            $studentBooking = ['booking_id' => (int)$mine['booking_id'], 'seat_code' => $mine['seat_code'], 'booking_reference' => $mine['booking_reference']];
        }
    } catch (Throwable $e) {
        $studentBooking = null;
    }
}

json_response(true, 'Seat map loaded.', ['seats' => $seats, 'student_booking' => $studentBooking]);
