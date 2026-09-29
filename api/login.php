<?php
/**
 * PARTITION: STUDENT LOGIN
 * POST api/login.php { student_id, password, telegram_chat_id?, token? }
 * - Authenticates STUDENT accounts against the users table (bcrypt).
 * - Issues a 7-day auth token (auth_tokens).
 * - Students only: driver accounts are rejected here.
 * Called from: assets/js/auth.js :: handleStudentLogin()
 */
require __DIR__ . '/config.php';

$data = json_input();
$studentId = trim($data['student_id'] ?? $data['email'] ?? '');
$password  = (string)($data['password'] ?? '');
$tgChatId  = trim($data['telegram_chat_id'] ?? '');

if ($studentId === '' || $password === '') {
    json_response(false, 'Student ID and password are required.', [], 400);
}

if (strlen($password) < 4) {
    json_response(false, 'Password must be at least 4 characters.', [], 400);
}

$stmt = $pdo->prepare('SELECT user_id, username, full_name, password_hash, role FROM users WHERE username = ? LIMIT 1');
$stmt->execute([$studentId]);
$user = $stmt->fetch();

if (!$user) {
    json_response(false, 'Account does not exist.', [], 404);
}

if ($user['role'] !== 'STUDENT') {
    json_response(false, 'This account is not a Student account. Use Driver Login.', [], 403);
}

if (!password_verify($password, (string)$user['password_hash'])) {
    json_response(false, 'Invalid login credentials.', [], 401);
}

$pdo->exec("
    CREATE TABLE IF NOT EXISTS auth_tokens (
        token VARCHAR(64) PRIMARY KEY,
        user_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        INDEX idx_user (user_id)
    )
");

$token = bin2hex(random_bytes(16));
$tokenStmt = $pdo->prepare('INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))');
$tokenStmt->execute([$token, (int)$user['user_id']]);

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

json_response(true, 'Login successful.', [
    'user' => [
        'username' => $user['username'],
        'name' => $user['full_name'] !== '' ? $user['full_name'] : $user['username'],
        'role' => 'STUDENT',
        'token' => $token,
    ]
]);
