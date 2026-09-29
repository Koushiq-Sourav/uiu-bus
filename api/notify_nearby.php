<?php
/**
 * PARTITION: TELEGRAM / 5-MINUTE ETA NOTIFIER
 * ---------------------------------------------------------
 * Sends a Telegram alert when the live bus is approximately
 * 5 minutes from the student's last known location.
 *
 * Run every minute:
 *   /api/notify_nearby.php?all=1
 *
 * The student's location is written by api/user_location.php
 * when the website has location permission. If no fresh user
 * location exists, the route's first boarding area is used as
 * a fallback.
 */
require __DIR__ . '/config.php';
require __DIR__ . '/telegram_config.php';

$tripId = filter_input(INPUT_GET, 'trip_id', FILTER_VALIDATE_INT);
$all = isset($_GET['all']);
$dry = isset($_GET['dry']);

$pdo->exec("
    CREATE TABLE IF NOT EXISTS telegram_notifications (
        trip_id INT NOT NULL,
        student_id VARCHAR(50) NOT NULL,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (trip_id, student_id)
    )
");

function nearby_trip_ids(PDO $pdo, $tripId, bool $all): array {
    if ($tripId) return [(int)$tripId];
    if ($all) {
        $today = date('Y-m-d');
        $stmt = $pdo->prepare("SELECT trip_id FROM trips WHERE service_date = ? AND trip_status IN ('SCHEDULED','BOARDING')");
        $stmt->execute([$today]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }
    return [];
}

function eta_minutes(float $distanceM): float {
    $roadDistanceM = $distanceM * UIU_ROAD_DISTANCE_FACTOR;
    return ($roadDistanceM / 1000) / UIU_AVG_BUS_SPEED_KMH * 60;
}

$tripIds = nearby_trip_ids($pdo, $tripId, $all);
if (!$tripIds) json_response(false, 'Pass ?trip_id= or ?all=1.', [], 400);

$notified = [];
$skipped = [];

foreach ($tripIds as $tid) {
    $locStmt = $pdo->prepare('SELECT lat, lng, updated_at FROM bus_locations WHERE trip_id = ?');
    $locStmt->execute([$tid]);
    $loc = $locStmt->fetch();
    if (!$loc) { $skipped[] = ['trip_id' => $tid, 'reason' => 'no bus location yet']; continue; }
    if (strtotime($loc['updated_at']) < time() - 600) { $skipped[] = ['trip_id' => $tid, 'reason' => 'bus location stale (>10 min)']; continue; }

    $tripStmt = $pdo->prepare("SELECT r.route_code, t.service_date, t.departure_time FROM trips t JOIN routes r ON r.route_id = t.route_id WHERE t.trip_id = ?");
    $tripStmt->execute([$tid]);
    $trip = $tripStmt->fetch();
    if (!$trip) { $skipped[] = ['trip_id' => $tid, 'reason' => 'trip not found']; continue; }
    $route = $trip['route_code'];

    $start = UIU_ROUTE_STARTS[$route] ?? null;

    $bkStmt = $pdo->prepare("
        SELECT DISTINCT bsl.student_id, tl.chat_id, ul.lat AS user_lat, ul.lng AS user_lng, ul.updated_at AS user_updated_at
        FROM bookings b
        JOIN booking_student_links bsl ON bsl.booking_id = b.booking_id
        JOIN telegram_links tl ON tl.student_id = bsl.student_id
        LEFT JOIN user_locations ul ON ul.student_id = bsl.student_id
        LEFT JOIN telegram_notifications n ON n.trip_id = b.trip_id AND n.student_id = bsl.student_id
        WHERE b.trip_id = ? AND b.booking_status = 'CONFIRMED' AND n.trip_id IS NULL
    ");
    $bkStmt->execute([$tid]);
    $rows = $bkStmt->fetchAll();

    // Setup diagnostic: booked students with NO Chat ID linked can never
    // be notified — surfaced so the driver/admin knows who to chase.
    try {
        $unlinkedStmt = $pdo->prepare("
            SELECT COUNT(DISTINCT bsl.student_id) AS c
            FROM bookings b
            JOIN booking_student_links bsl ON bsl.booking_id = b.booking_id
            LEFT JOIN telegram_links tl ON tl.student_id = bsl.student_id
            WHERE b.trip_id = ? AND b.booking_status = 'CONFIRMED' AND tl.student_id IS NULL
        ");
        $unlinkedStmt->execute([$tid]);
        $unlinked = (int)($unlinkedStmt->fetch()['c'] ?? 0);
        if ($unlinked > 0) {
            $skipped[] = ['trip_id' => $tid, 'reason' => $unlinked . ' booked student(s) have no Telegram Chat ID linked'];
        }
    } catch (Throwable $e) { /* diagnostic only */ }

    foreach ($rows as $row) {
        $hasFreshUserLocation = $row['user_lat'] !== null && $row['user_lng'] !== null
            && $row['user_updated_at'] !== null
            && strtotime($row['user_updated_at']) >= time() - UIU_MAX_LOCATION_AGE_SECONDS;

        if ($hasFreshUserLocation) {
            $userLat = (float)$row['user_lat'];
            $userLng = (float)$row['user_lng'];
            $locationSource = 'your live location';
        } elseif ($start) {
            $userLat = (float)$start['lat'];
            $userLng = (float)$start['lng'];
            $locationSource = 'your boarding area';
        } else {
            $skipped[] = ['trip_id' => $tid, 'student_id' => $row['student_id'], 'reason' => 'no user location or route start'];
            continue;
        }

        $distanceM = uiu_haversine_m((float)$loc['lat'], (float)$loc['lng'], $userLat, $userLng);
        $eta = eta_minutes($distanceM);
        if ($eta > UIU_ALERT_ETA_MINUTES) {
            $skipped[] = ['trip_id' => $tid, 'student_id' => $row['student_id'], 'reason' => 'ETA ' . round($eta, 1) . ' min'];
            continue;
        }

        $etaText = max(1, (int)round($eta));
        $text = "🚌 UIU Bus Alert\n\nYour {$route} bus is approximately {$etaText} minute" . ($etaText === 1 ? '' : 's') . " away from {$locationSource}.\n\nPlease get ready.\nTrip #{$tid}";
        $sent = $dry ? true : uiu_send_telegram($row['chat_id'], $text);
        if ($sent && !$dry) {
            $mark = $pdo->prepare('INSERT IGNORE INTO telegram_notifications (trip_id, student_id) VALUES (?, ?)');
            $mark->execute([$tid, $row['student_id']]);
        }
        if ($sent) {
            $notified[] = [
                'trip_id' => $tid,
                'student_id' => $row['student_id'],
                'eta_minutes' => $etaText,
                'distance_m' => round($distanceM),
                'location_source' => $locationSource,
                'dry' => $dry
            ];
        } else {
            $skipped[] = ['trip_id' => $tid, 'student_id' => $row['student_id'], 'reason' => 'Telegram send failed (check bot token/chat ID)'];
        }
    }
}

json_response(true, '5-minute ETA check done.', [
    'threshold_minutes' => UIU_ALERT_ETA_MINUTES,
    'average_speed_kmh' => UIU_AVG_BUS_SPEED_KMH,
    'notified' => $notified,
    'skipped' => $skipped,
]);
