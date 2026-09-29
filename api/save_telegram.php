<?php
/**
 * PARTITION: TELEGRAM / LINK STUDENT ID
 * POST api/save_telegram.php { student_id, chat_id }
 * Saves the link so the server can message the student later.
 * Called from: login page (one-time) via telegram.js linkTelegramWithId().
 * Confirmation message is sent ONLY on first link.
 * Table auto-created on first call (no manual import needed).
 */
require __DIR__ . '/config.php';
require __DIR__ . '/telegram_config.php';

$data = json_input();
$studentId = trim($data['student_id'] ?? '');
$chatId = trim($data['chat_id'] ?? '');

if ($studentId === '' || $chatId === '') {
    json_response(false, 'Student ID and chat ID are required.', [], 400);
}

// Chat IDs are numeric (message @userinfobot to get yours) — usernames
// like @someone can never receive bot messages, so reject them early.
if (!preg_match('/^-?\d+$/', $chatId)) {
    json_response(false, 'Chat ID must be numeric — message @userinfobot on Telegram to get yours.', [], 400);
}

$pdo->exec("
    CREATE TABLE IF NOT EXISTS telegram_links (
        student_id VARCHAR(50) PRIMARY KEY,
        chat_id VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
");

$chk = $pdo->prepare('SELECT chat_id FROM telegram_links WHERE student_id = ?');
$chk->execute([$studentId]);
$isNew = !$chk->fetch();

$stmt = $pdo->prepare('REPLACE INTO telegram_links (student_id, chat_id) VALUES (?, ?)');
$stmt->execute([$studentId, $chatId]);

// Instant confirmation, but ONLY on first link — repeat calls stay silent.
$sent = $isNew ? uiu_send_telegram($chatId, "✅ UIU Bus alerts linked for ID {$studentId}. You will be notified here when your bus is near.") : true;

json_response(true, 'Telegram linked. You will get bus-near alerts.', ['student_id' => $studentId, 'telegram_sent' => $sent, 'is_new' => $isNew]);
