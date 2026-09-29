<?php
// Run once from XAMPP/PHP after importing schema.sql to create the demo driver.
require __DIR__ . '/../api/config.php';

$username = 'driver01';
$password = 'driver123';

$stmt = $pdo->prepare("INSERT INTO users (username, full_name, password_hash, role) VALUES (?, ?, ?, 'DRIVER') ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), password_hash=VALUES(password_hash), role='DRIVER'");
$stmt->execute([$username, 'Demo Driver', password_hash($password, PASSWORD_DEFAULT)]);

header('Content-Type: text/plain; charset=utf-8');
echo "Driver account ready\nDriver ID: driver01\nPassword: driver123\n";
