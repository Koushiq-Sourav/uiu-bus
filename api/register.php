<?php
/**
 * PARTITION: STUDENT REGISTRATION
 * POST api/register.php { student_id, password }
 * - Validates input, rejects duplicate accounts.
 * - Stores bcrypt password hashes (never plain text).
 * - Frontend redirects to Student Login after success.
 * Called from: assets/js/auth.js :: handleSignup()
 */
require __DIR__ . '/config.php';

$data = json_input();
$studentId = trim($data['student_id'] ?? $data['email'] ?? '');
$password  = (string)($data['password'] ?? '');

if ($studentId === '') {
    json_response(false, 'Student ID is required.', [], 400);
}

if ($password === '') {
    json_response(false, 'Password is required.', [], 400);
}

if (strlen($password) < 4) {
    json_response(false, 'Password must be at least 4 characters.', [], 400);
}

try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            user_id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            full_name VARCHAR(100) NOT NULL DEFAULT '',
            email VARCHAR(100) NULL,
            phone VARCHAR(20) NULL,
            password_hash VARCHAR(255) NOT NULL,
            role ENUM('STUDENT','DRIVER') NOT NULL DEFAULT 'STUDENT',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ");

    $check = $pdo->prepare('SELECT user_id FROM users WHERE username = ? LIMIT 1');
    $check->execute([$studentId]);
    if ($check->fetch()) {
        json_response(false, 'An account with this Student ID already exists.', [], 409);
    }

    $insert = $pdo->prepare("INSERT INTO users (username, full_name, password_hash, role) VALUES (?, ?, ?, 'STUDENT')");
    $insert->execute([$studentId, $studentId, password_hash($password, PASSWORD_DEFAULT)]);

    json_response(true, 'Registration successful. Please log in.');
} catch (Throwable $e) {
    if ($e instanceof PDOException && (int)$e->getCode() === 23000) {
        json_response(false, 'An account with this Student ID already exists.', [], 409);
    }
    json_response(false, 'Could not create account. Please try again later.', [], 500);
}
