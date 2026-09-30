<?php
/**
 * PARTITION: BOOKING / UNBOOK — BACKEND
 * POST api/cancel_booking.php
 * { token, booking_id }
 * - STUDENT-only. A student can cancel ONLY their own CONFIRMED booking
 *   (ownership checked via booking_student_links + token identity).
 * - Transactionally: bookings -> CANCELLED, trip_seats -> AVAILABLE,
 *   booking_seats + booking_student_links rows removed so the student
 *   can book again (the one-seat dup check only blocks CONFIRMED rows).
 * - Driver/unknown/demo bookings are rejected with a friendly message.
 * Called from: assets/js/api.js :: cancelBooking()
 */
require __DIR__ . '/config.php';

$data = json_input();
$user = require_user($pdo, 'STUDENT');

$bookingId = filter_var($data['booking_id'] ?? null, FILTER_VALIDATE_INT);
if (!$bookingId) {
    json_response(false, 'Valid booking_id is required.', [], 400);
}

try {
    $pdo->beginTransaction();

    // Lock + verify ownership: the booking must belong to this student
    // and still be CONFIRMED (already-cancelled rows are not re-freeable).
    $ownStmt = $pdo->prepare("
        SELECT b.booking_id, b.booking_status, bsl.trip_id
        FROM booking_student_links bsl
        JOIN bookings b ON b.booking_id = bsl.booking_id
        WHERE bsl.booking_id = ?
          AND bsl.student_id = ?
          AND b.booking_status = 'CONFIRMED'
        FOR UPDATE
    ");
    $ownStmt->execute([$bookingId, $user['username']]);
    $own = $ownStmt->fetch();

    if (!$own) {
        throw new RuntimeException('Booking not found, already cancelled, or does not belong to you.');
    }

    $tripId = (int)$own['trip_id'];

    // Collect the seat rows tied to this booking (locked for the update).
    $seatStmt = $pdo->prepare("
        SELECT bs.trip_seat_id, s.seat_code
        FROM booking_seats bs
        JOIN trip_seats ts ON ts.trip_seat_id = bs.trip_seat_id
        JOIN seats s ON s.seat_id = ts.seat_id
        WHERE bs.booking_id = ?
        FOR UPDATE
    ");
    $seatStmt->execute([$bookingId]);
    $seatRows = $seatStmt->fetchAll();
    $seatCodes = array_column($seatRows, 'seat_code');

    // Mark the booking cancelled (kept for history, excluded by dup check).
    $cancelStmt = $pdo->prepare("UPDATE bookings SET booking_status = 'CANCELLED' WHERE booking_id = ?");
    $cancelStmt->execute([$bookingId]);

    // Free the seats — guarded by booking_id so a rebooked seat is never wiped.
    if ($seatRows) {
        $freeStmt = $pdo->prepare("
            UPDATE trip_seats
            SET seat_status = 'AVAILABLE', held_until = NULL, booking_id = NULL
            WHERE trip_seat_id = ? AND booking_id = ?
        ");
        foreach ($seatRows as $row) {
            $freeStmt->execute([$row['trip_seat_id'], $bookingId]);
        }
    }

    // Remove link rows so the seat map, banner and one-seat rule reset.
    $pdo->prepare('DELETE FROM booking_seats WHERE booking_id = ?')->execute([$bookingId]);
    $pdo->prepare('DELETE FROM booking_student_links WHERE booking_id = ?')->execute([$bookingId]);

    $pdo->commit();

    json_response(true, 'Booking cancelled. Your seat is free again.', [
        'booking' => [
            'booking_id' => $bookingId,
            'trip_id' => $tripId,
            'seats' => $seatCodes,
        ]
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    $message = $e instanceof RuntimeException ? $e->getMessage() : 'Could not cancel booking.';
    json_response(false, $message, [], 409);
}
