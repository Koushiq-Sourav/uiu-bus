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
    $url = UIU_TELEGRAM_API_BASE . UIU_TELEGRAM_BOT_TOKEN . '/sendMessage';
    $payload = json_encode(['chat_id' => $chatId, 'text' => $text]);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
    ]);
    $res = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($res === false) return false;
    $data = json_decode($res, true);
    return $code === 200 && ($data['ok'] ?? false);
}

/** Great-circle distance in meters. */
function uiu_haversine_m(float $lat1, float $lon1, float $lat2, float $lon2): float {
    $R = 6371000;
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;
    return 2 * $R * asin(sqrt($a));
}
