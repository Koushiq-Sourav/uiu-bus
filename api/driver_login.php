<?php
/**
 * PARTITION: DRIVER LOGIN
 * POST api/driver_login.php { driver_id, password }
 * - Authenticates DRIVER accounts only (students are rejected here).
 * - Does NOT grant dashboard access by itself: the frontend must still
 *   obtain a live geolocation fix and POST it to driver_location.php
 *   before the driver dashboard is shown.
 * Called from: assets/js/auth.js :: handleDriverLogin()
 */
require __DIR__ . '/config.php';

$data = json_input();
$driverId = trim($data['driver_id'] ?? $data['student_id'] ?? '');
$password = (string)($data['password'] ?? '');

if ($driverId === '' || $password === '') {
    json_response(false, 'Driver ID and password are required.', [], 400);
}

if (strlen($password) < 4) {
    json_response(false, 'Password must be at least 4 characters.', [], 400);
}

$stmt = $pdo->prepare('SELECT user_id, username, full_name, password_hash, role FROM users WHERE username = ? LIMIT 1');
$stmt->execute([$driverId]);
$user = $stmt->fetch();

if (!$user) {
    json_response(false, 'Account does not exist.', [], 404);
}

if ($user['role'] !== 'DRIVER') {
    json_response(false, 'This account is not a Driver account. Use Student Login.', [], 403);
}

if (!password_verify($password, (string)$user['password_hash'])) {
    json_response(false, 'Invalid driver credentials.', [], 401);
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

json_response(true, 'Driver verified. Location permission is required to continue.', [
    'user' => [
        'username' => $user['username'],
        'name' => $user['full_name'] !== '' ? $user['full_name'] : $user['username'],
        'role' => 'DRIVER',
        'token' => $token,
    ]
]);
