<?php
/**
 * PARTITION: TELEGRAM / CONFIG
 * ---------------------------------------------------------
 * 1. Chat with @BotFather on Telegram → /newbot → paste the
 *    token below as UIU_TELEGRAM_BOT_TOKEN.
 * 2. Students open your bot once and press START, then paste
 *    their Chat ID in the booking form (one time — it is
 *    saved per Student ID by api/save_telegram.php).
 * 3. Run api/notify_nearby.php on a schedule (cron / Task
 *    Scheduler) so "bus is near" messages go out even when
 *    the student's browser is closed.
 *
 * Used by: save_telegram.php, bus_location.php, notify_nearby.php
 */
const UIU_TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
// Token priority: hosting env UIU_TELEGRAM_BOT_TOKEN first (Render/Docker),
// then api/telegram_local.php (XAMPP secret file, git-ignored, never pushed),
// else the placeholder below (alerts stay in demo-preview mode).
if (!defined('UIU_TELEGRAM_BOT_TOKEN')) {
    $envToken = trim((string)(getenv('UIU_TELEGRAM_BOT_TOKEN') ?: ''));
    if ($envToken === '' && is_file(__DIR__ . '/telegram_local.php')) {
        require __DIR__ . '/telegram_local.php'; // defines UIU_TELEGRAM_BOT_TOKEN
    }
    if (!defined('UIU_TELEGRAM_BOT_TOKEN')) {
        define('UIU_TELEGRAM_BOT_TOKEN', $envToken !== '' ? $envToken : 'PASTE_BOT_TOKEN_HERE');
    }
}
const UIU_NEARBY_RADIUS_M = 500;
/** ETA alert settings. ETA is an estimate from straight-line GPS distance. */
const UIU_ALERT_ETA_MINUTES = 5;
const UIU_AVG_BUS_SPEED_KMH = 24;
const UIU_ROAD_DISTANCE_FACTOR = 1.25;
const UIU_MAX_LOCATION_AGE_SECONDS = 180;
const UIU_DRIVER_LOCATION_KEY = ''; // Optional shared secret for driver GPS POSTs.

/** First-stop coordinates per route (proxy for the boarding area). */
const UIU_ROUTE_STARTS = [
    'Dhanmondi' => ['lat' => 23.7559, 'lng' => 90.3744],
    'Mirpur'    => ['lat' => 23.8068, 'lng' => 90.3689],
    'Signboard' => ['lat' => 23.7037, 'lng' => 90.4307],
    'Jatrabari' => ['lat' => 23.7104, 'lng' => 90.4358],
    'Palashi'   => ['lat' => 23.7287, 'lng' => 90.3835],
    'Uttara'    => ['lat' => 23.8759, 'lng' => 90.3795],
];

/** Send a Telegram message. Returns false when no token is configured. */
function uiu_send_telegram(string $chatId, string $text): bool {
    if (UIU_TELEGRAM_BOT_TOKEN === 'PASTE_BOT_TOKEN_HERE' || UIU_TELEGRAM_BOT_TOKEN === '') {
        return false;
    }
    $res = uiu_telegram_api('sendMessage', ['chat_id' => $chatId, 'text' => $text]);
    return $res !== null && ($res['ok'] ?? false);
}

/** Low-level Bot API POST. Returns decoded response or null. Never leaks token. */
function uiu_telegram_api(string $method, array $params): ?array {
    if (UIU_TELEGRAM_BOT_TOKEN === 'PASTE_BOT_TOKEN_HERE' || UIU_TELEGRAM_BOT_TOKEN === '') {
        return null;
    }
    $url = UIU_TELEGRAM_API_BASE . UIU_TELEGRAM_BOT_TOKEN . '/' . $method;
    $payload = json_encode($params);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
    ]);
    $res = curl_exec($ch);
    curl_close($ch);
    if ($res === false) return null;
    $data = json_decode($res, true);
    return is_array($data) ? $data : null;
}

/** Send a LIVE location (moving pin). Returns message_id or null. */
function uiu_send_live_location(string $chatId, float $lat, float $lng, int $livePeriod = 900, ?int $heading = null): ?int {
    $params = ['chat_id' => $chatId, 'latitude' => $lat, 'longitude' => $lng, 'live_period' => $livePeriod];
    if ($heading !== null && $heading >= 1 && $heading <= 360) $params['heading'] = $heading;
    $res = uiu_telegram_api('sendLocation', $params);
    if ($res !== null && ($res['ok'] ?? false) && isset($res['result']['message_id'])) {
        return (int)$res['result']['message_id'];
    }
    return null;
}

/** Move an existing live pin. Returns true on success. */
function uiu_edit_live_location(string $chatId, int $messageId, float $lat, float $lng, ?int $heading = null): bool {
    $params = ['chat_id' => $chatId, 'message_id' => $messageId, 'latitude' => $lat, 'longitude' => $lng];
    if ($heading !== null && $heading >= 1 && $heading <= 360) $params['heading'] = $heading;
    $res = uiu_telegram_api('editMessageLiveLocation', $params);
    return $res !== null && ($res['ok'] ?? false);
}

/** Stop a live pin. Returns true on success (or when already stopped). */
function uiu_stop_live_location(string $chatId, int $messageId): bool {
    $res = uiu_telegram_api('stopMessageLiveLocation', ['chat_id' => $chatId, 'message_id' => $messageId]);
    return $res !== null && ($res['ok'] ?? false);
}

function uiu_ensure_live_table(PDO $pdo): void {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS telegram_live (
            trip_id INT NOT NULL,
            student_id VARCHAR(50) NOT NULL,
            chat_id VARCHAR(50) NOT NULL,
            message_id BIGINT NOT NULL,
            last_lat DOUBLE NOT NULL,
            last_lng DOUBLE NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (trip_id, student_id)
        )
    ");
}

/**
 * Push one bus fix to every subscribed student as a LIVE Telegram pin.
 * Called from bus_location.php + driver_location.php + notify_nearby.php.
 * Throttled: skips students updated <15s ago unless moved >30m or live expired.
 * Returns ['pushed' => int, 'started' => int, 'skipped' => array].
 */
function uiu_push_live_bus(PDO $pdo, int $tripId, float $lat, float $lng, ?int $heading = null): array {
    uiu_ensure_live_table($pdo);
    $pushed = 0;
    $started = 0;
    $skipped = [];
    if (UIU_TELEGRAM_BOT_TOKEN === 'PASTE_BOT_TOKEN_HERE' || UIU_TELEGRAM_BOT_TOKEN === '') {
        return ['pushed' => 0, 'started' => 0, 'skipped' => [['reason' => 'no bot token configured']]];
    }
    try {
        $stmt = $pdo->prepare("
            SELECT DISTINCT bsl.student_id, tl.chat_id
            FROM bookings b
            JOIN booking_student_links bsl ON bsl.booking_id = b.booking_id
            JOIN telegram_links tl ON tl.student_id = bsl.student_id
            WHERE b.trip_id = ? AND b.booking_status = 'CONFIRMED'
        ");
        $stmt->execute([$tripId]);
        $subs = $stmt->fetchAll();
    } catch (Throwable $e) {
        return ['pushed' => 0, 'started' => 0, 'skipped' => [['reason' => 'subscriber lookup failed']]];
    }
    if (!$subs) return ['pushed' => 0, 'started' => 0, 'skipped' => [['trip_id' => $tripId, 'reason' => 'no linked subscribers']]];
    foreach ($subs as $sub) {
        $sid = (string)$sub['student_id'];
        $chatId = (string)$sub['chat_id'];
        try {
            $liveStmt = $pdo->prepare('SELECT message_id, last_lat, last_lng, updated_at FROM telegram_live WHERE trip_id = ? AND student_id = ?');
            $liveStmt->execute([$tripId, $sid]);
            $live = $liveStmt->fetch();
        } catch (Throwable $e) {
            $skipped[] = ['student_id' => $sid, 'reason' => 'live lookup failed'];
            continue;
        }
        $now = time();
        if ($live) {
            $age = $now - strtotime($live['updated_at']);
            $moved = uiu_haversine_m((float)$live['last_lat'], (float)$live['last_lng'], $lat, $lng);
            // Live messages expire after live_period (900s). Re-send fresh when old.
            if ($age > 840) {
                $msgId = uiu_send_live_location($chatId, $lat, $lng, 900, $heading);
                if ($msgId !== null) {
                    $up = $pdo->prepare('REPLACE INTO telegram_live (trip_id, student_id, chat_id, message_id, last_lat, last_lng) VALUES (?, ?, ?, ?, ?, ?)');
                    $up->execute([$tripId, $sid, $chatId, $msgId, $lat, $lng]);
                    $pushed++; $started++;
                } else {
                    $skipped[] = ['student_id' => $sid, 'reason' => 'live re-send failed'];
                }
                continue;
            }
            // Throttle: skip tiny moves within 15s to respect rate limits.
            if ($age < 15 && $moved < 30) {
                $skipped[] = ['student_id' => $sid, 'reason' => 'throttled'];
                continue;
            }
            $ok = uiu_edit_live_location($chatId, (int)$live['message_id'], $lat, $lng, $heading);
            if ($ok) {
                $up = $pdo->prepare('UPDATE telegram_live SET last_lat = ?, last_lng = ? WHERE trip_id = ? AND student_id = ?');
                $up->execute([$lat, $lng, $tripId, $sid]);
                $pushed++;
            } else {
                // Pin may have expired/deleted — start a fresh live pin once.
                $msgId = uiu_send_live_location($chatId, $lat, $lng, 900, $heading);
                if ($msgId !== null) {
                    $up = $pdo->prepare('REPLACE INTO telegram_live (trip_id, student_id, chat_id, message_id, last_lat, last_lng) VALUES (?, ?, ?, ?, ?, ?)');
                    $up->execute([$tripId, $sid, $chatId, $msgId, $lat, $lng]);
                    $pushed++; $started++;
                } else {
                    $skipped[] = ['student_id' => $sid, 'reason' => 'edit+resend failed'];
                }
            }
        } else {
            $msgId = uiu_send_live_location($chatId, $lat, $lng, 900, $heading);
            if ($msgId !== null) {
                $ins = $pdo->prepare('REPLACE INTO telegram_live (trip_id, student_id, chat_id, message_id, last_lat, last_lng) VALUES (?, ?, ?, ?, ?, ?)');
                $ins->execute([$tripId, $sid, $chatId, $msgId, $lat, $lng]);
                $pushed++; $started++;
            } else {
                $skipped[] = ['student_id' => $sid, 'reason' => 'live send failed (token/chat)'];
            }
        }
    }
    return ['pushed' => $pushed, 'started' => $started, 'skipped' => $skipped];
}

/** Stop all live pins for a trip. Returns stopped count. */
function uiu_stop_live_trip(PDO $pdo, int $tripId): int {
    uiu_ensure_live_table($pdo);
    try {
        $stmt = $pdo->prepare('SELECT student_id, chat_id, message_id FROM telegram_live WHERE trip_id = ?');
        $stmt->execute([$tripId]);
        $rows = $stmt->fetchAll();
    } catch (Throwable $e) {
        return 0;
    }
    $stopped = 0;
    foreach ($rows as $r) {
        try { uiu_stop_live_location((string)$r['chat_id'], (int)$r['message_id']); } catch (Throwable $e) {}
        $stopped++;
    }
    try {
        $del = $pdo->prepare('DELETE FROM telegram_live WHERE trip_id = ?');
        $del->execute([$tripId]);
    } catch (Throwable $e) {}
    return $stopped;
}

/** Great-circle distance in meters. */
function uiu_haversine_m(float $lat1, float $lon1, float $lat2, float $lon2): float {
    $R = 6371000;
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;
    return 2 * $R * asin(sqrt($a));
}
