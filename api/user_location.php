<?php
/** Save the logged-in student's latest GPS location for ETA alerts. */
require __DIR__ . '/config.php';

$data = json_input();
$studentId = trim((string)($data['student_id'] ?? ''));
$lat = filter_var($data['lat'] ?? null, FILTER_VALIDATE_FLOAT);
$lng = filter_var($data['lng'] ?? null, FILTER_VALIDATE_FLOAT);
$accuracy = filter_var($data['accuracy'] ?? null, FILTER_VALIDATE_FLOAT);

if ($studentId === '' || $lat === false || $lng === false || $lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
    json_response(false, 'student_id, lat and lng are required.', [], 400);
}

$pdo->exec("
    CREATE TABLE IF NOT EXISTS user_locations (
        student_id VARCHAR(50) PRIMARY KEY,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        accuracy_m DOUBLE NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
");

$stmt = $pdo->prepare('REPLACE INTO user_locations (student_id, lat, lng, accuracy_m) VALUES (?, ?, ?, ?)');
$stmt->execute([$studentId, $lat, $lng, $accuracy === false ? null : $accuracy]);
json_response(true, 'User location saved.', ['student_id' => $studentId]);
