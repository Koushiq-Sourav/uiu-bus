<?php
/**
 * PARTITION: TELEGRAM / START WEBHOOK
 * ---------------------------------------------------------
 * When a student presses START on the bus bot, Telegram POSTs the
 * update here and the bot instantly replies with their numeric
 * Chat ID, so they can paste it in the login form — no @userinfobot
 * detour needed.
 *
 * ONE-TIME SETUP (needs a PUBLIC https host — Render, not localhost):
 *   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<HOST>/api/telegram_webhook.php
 * Verify:
 *   https://api.telegram.org/bot<TOKEN>/getWebhookInfo
 * Remove:
 *   https://api.telegram.org/bot<TOKEN>/deleteWebhook
 *
 * Optional guard: set env UIU_TELEGRAM_WEBHOOK_SECRET and pass it as
 * ?key= in the webhook URL (also sent as secret_token). Mismatch = 403.
 * Called by: Telegram servers (not the website).
 */
require __DIR__ . '/config.php';
require __DIR__ . '/telegram_config.php';

$secret = trim((string)(getenv('UIU_TELEGRAM_WEBHOOK_SECRET') ?: ''));
if ($secret !== '') {
    $given = trim((string)($_GET['key'] ?? ''));
    $header = trim((string)($_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? ''));
    if (!hash_equals($secret, $given) && !hash_equals($secret, $header)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Bad webhook secret.']);
        exit;
    }
}

$update = json_input();
$message = $update['message'] ?? $update['edited_message'] ?? null;
$chatId = trim((string)($message['chat']['id'] ?? ''));
$text = trim((string)($message['text'] ?? ''));

if ($chatId === '') {
    json_response(true, 'No chat to answer.');
}

if (str_starts_with($text, '/start')) {
    uiu_send_telegram(
        $chatId,
        "🚌 Welcome to UIU Bus alerts!\n\nYour Chat ID is: {$chatId}\n\nPaste this number in the Telegram Chat ID field on the UIU-BUS login page (one time) — you will be notified here when your bus is near."
    );
} else {
    uiu_send_telegram(
        $chatId,
        "Your Chat ID is: {$chatId}\n\nPaste it in the Telegram Chat ID field on the UIU-BUS login page to switch on bus-near alerts."
    );
}

json_response(true, 'Answered.');
