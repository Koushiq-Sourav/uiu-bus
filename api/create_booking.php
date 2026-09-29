<?php
/**
 * PARTITION: BOOKING / CHECKOUT — BACKEND
 * POST api/create_booking.php
 * { token?, student_id?, name?, phone?, email?, route, trip_id, seats[1], telegram_chat_id? }
 * - NO MONEY. One student ID = one seat per trip.
 * - Booking identity comes from the authenticated token when present;
 *   the frontend-sent student_id is only a demo fallback (never trusted alone).
 * - One-seat rule enforced on student_id via booking_student_links
 *   (transactionally locked alongside the seat rows).
 * - Double booking prevented by FOR UPDATE seat locking.
 * Called from: assets/js/booking.js :: Next()
 */
require __DIR__ . '/config.php';

$data = json_input();

// Prefer the authenticated identity; fall back to the body field for demo mode.
$authUser = current_user($pdo, $data);
$studentId = $authUser ? (string)$authUser['username'] : trim((string)($data['student_id'] ?? ''));

$name     = trim((string)($data['name'] ?? ''));
if ($name === '') {
    $name = $studentId; // reuse the logged-in account — no extra typing needed
}
$phone    = trim((string)($data['phone'] ?? ''));
$route    = trim((string)($data['route'] ?? ''));
$tgChatId = trim((string)($data['telegram_chat_id'] ?? ''));
$tripId   = filter_var($data['trip_id'] ?? null, FILTER_VALIDATE_INT);
$seatList = $data['seats'] ?? [];

if ($route === '' || $studentId === '' || !$tripId || !is_array($seatList)) {
    json_response(false, 'Route, trip and seats are required.', [], 400);
}

$seatList = array_values(array_unique(array_map('trim', $seatList)));
if (count($seatList) !== 1) {
    json_response(false, 'One student ID can select only one seat.', [], 400);
}

$email = trim((string)($data['email'] ?? ''));
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response(false, 'Invalid email address.', [], 400);
}

try {
    $pdo->beginTransaction();

    // Verify trip belongs to the selected route and is bookable.
    $tripStmt = $pdo->prepare("
        SELECT t.trip_id, r.route_code, t.departure_time, t.arrival_time
        FROM trips t
        JOIN routes r ON r.route_id = t.route_id
        WHERE t.trip_id = ?
          AND r.route_code = ?
          AND t.trip_status IN ('SCHEDULED','BOARDING')
        FOR UPDATE
    ");
    $tripStmt->execute([$tripId, $route]);
    $trip = $tripStmt->fetch();

    if (!$trip) {
        throw new RuntimeException('Selected trip is not available.');
    }

    // NO MONEY: fares removed, keep 0 for NOT NULL columns.
    $fare = 0.0;

    // Lock the requested seat rows. This is the key protection against double booking.
    $placeholders = implode(',', array_fill(0, count($seatList), '?'));
    $params = array_merge([$tripId], $seatList);
    $seatStmt = $pdo->prepare("
        SELECT ts.trip_seat_id, s.seat_code, ts.seat_status,
               ts.held_until
        FROM trip_seats ts
        JOIN seats s ON s.seat_id = ts.seat_id
        WHERE ts.trip_id = ?
          AND s.seat_code IN ($placeholders)
        FOR UPDATE
    ");
    $seatStmt->execute($params);
    $rows = $seatStmt->fetchAll();

    if (count($rows) !== count($seatList)) {
        throw new RuntimeException('One or more selected seats do not exist for this trip.');
    }

    foreach ($rows as $row) {
        $isExpiredHold = $row['seat_status'] === 'HELD'
            && $row['held_until'] !== null
            && strtotime((string)$row['held_until']) <= time();

        if ($row['seat_status'] === 'BOOKED' || $row['seat_status'] === 'BLOCKED' || ($row['seat_status'] === 'HELD' && !$isExpiredHold)) {
            throw new RuntimeException("Seat {$row['seat_code']} is no longer available. Please select another seat.");
        }
    }

    // One student = one seat per trip, keyed on the unique student ID.
    // Locking the link rows first keeps concurrent duplicate requests from racing.
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS booking_student_links (
            booking_id INT PRIMARY KEY,
            trip_id INT NOT NULL,
            student_id VARCHAR(50) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_trip_student (trip_id, student_id)
        )
    ");

    $dupStmt = $pdo->prepare("
        SELECT b.booking_id
        FROM bookings b
        JOIN booking_student_links bsl ON bsl.booking_id = b.booking_id
        WHERE bsl.trip_id = ?
          AND bsl.student_id = ?
          AND b.booking_status = 'CONFIRMED'
        LIMIT 1
        FOR UPDATE
    ");
    $dupStmt->execute([$tripId, $studentId]);
    if ($dupStmt->fetch()) {
        throw new RuntimeException('One student ID can select only one seat.');
    }

    // Reuse passenger record when phone matches; otherwise create a new record.
    // Phone is optional after login (reused from the account); an opaque but
    // unique placeholder keeps the legacy UNIQUE phone column happy.
    $phoneValue = $phone !== '' ? $phone : ('N/A-' . $studentId);
    $passengerStmt = $pdo->prepare('SELECT passenger_id, full_name FROM passengers WHERE phone = ? LIMIT 1 FOR UPDATE');
    $passengerStmt->execute([$phoneValue]);
    $passenger = $passengerStmt->fetch();

    if ($passenger) {
        $passengerId = (int)$passenger['passenger_id'];
        $updatePassenger = $pdo->prepare('UPDATE passengers SET full_name = ?, email = ? WHERE passenger_id = ?');
        $updatePassenger->execute([$name, $email !== '' ? $email : null, $passengerId]);
    } else {
        $insertPassenger = $pdo->prepare('INSERT INTO passengers (full_name, phone, email) VALUES (?, ?, ?)');
        $insertPassenger->execute([$name, $phoneValue, $email !== '' ? $email : null]);
        $passengerId = (int)$pdo->lastInsertId();
    }

    // Optional Telegram link saved with the booking (alerts on bus-near).
    if ($tgChatId !== '') {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS telegram_links (
                student_id VARCHAR(50) PRIMARY KEY,
                chat_id VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ");
        $tgStmt = $pdo->prepare('REPLACE INTO telegram_links (student_id, chat_id) VALUES (?, ?)');
        $tgStmt->execute([$studentId, $tgChatId]);
    }

    $seatCount = count($seatList);
    $total = $seatCount * $fare;
    $reference = 'UIU-' . date('YmdHis') . '-' . strtoupper(bin2hex(random_bytes(3)));

    $bookingStmt = $pdo->prepare("
        INSERT INTO bookings
            (booking_reference, passenger_id, trip_id, seat_count, unit_fare, total_amount,
             booking_status, payment_status)
        VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED', 'UNPAID')
    ");
    $bookingStmt->execute([$reference, $passengerId, $tripId, $seatCount, $fare, $total]);
    $bookingId = (int)$pdo->lastInsertId();

    // Keep the login Student ID tied to this booking. This is what the
    // one-seat rule and the Telegram notifier use — never the display name.
    $linkStmt = $pdo->prepare('REPLACE INTO booking_student_links (booking_id, trip_id, student_id) VALUES (?, ?, ?)');
    $linkStmt->execute([$bookingId, $tripId, $studentId]);

    $updateSeat = $pdo->prepare("
        UPDATE trip_seats
        SET seat_status = 'BOOKED', held_until = NULL, booking_id = ?
        WHERE trip_seat_id = ?
    ");
    $insertBookingSeat = $pdo->prepare("
        INSERT INTO booking_seats (booking_id, trip_seat_id, seat_price)
        VALUES (?, ?, ?)
    ");

    foreach ($rows as $row) {
        $updateSeat->execute([$bookingId, $row['trip_seat_id']]);
        $insertBookingSeat->execute([$bookingId, $row['trip_seat_id'], $fare]);
    }

    $pdo->commit();

    json_response(true, 'Booking created successfully.', [
        'booking' => [
            'booking_id' => $bookingId,
            'booking_reference' => $reference,
            'route' => $trip['route_code'],
            'student_id' => $studentId,
            'seats' => $seatList,
            'seat_count' => $seatCount,
            'departure_time' => $trip['departure_time'] ?? null,
            'arrival_time' => $trip['arrival_time'] ?? null
        ]
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    $message = $e instanceof RuntimeException ? $e->getMessage() : 'Could not create booking.';
    json_response(false, $message, [], 409);
}
