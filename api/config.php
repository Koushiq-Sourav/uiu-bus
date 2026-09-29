<?php
/**
 * PARTITION: CONFIG / SHARED (BACKEND)
 * - PDO connection for all api/*.php
 * - Helpers: json_input(), json_response()
 * - Auth: resolve_token(), current_user(), require_user()
 * Used by: login/register/driver_login/logout, get_seats,
 *           create_booking, user_bookings, driver_location, driver_dashboard
 */
// DB credentials: env vars on hosting (Render/Railway/Docker), XAMPP
// defaults locally (127.0.0.1 / uiu_shuttle / root / blank password).
$host = getenv('DB_HOST') ?: '127.0.0.1';
$db   = getenv('DB_NAME') ?: 'uiu_shuttle';
$user = getenv('DB_USER') ?: 'root';
$pass = getenv('DB_PASS') ?: '';
if (($port = getenv('DB_PORT')) !== false && $port !== '') {
    $host .= ';port=' . $port;
}

header('Content-Type: application/json; charset=utf-8');

try {
    $pdo = new PDO(
        "mysql:host=$host;dbname=$db;charset=utf8mb4",
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
    exit;
}

function json_input(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function json_response(bool $success, string $message = '', array $data = [], int $status = 200): never {
    http_response_code($status);
    echo json_encode(array_merge(['success' => $success, 'message' => $message], $data));
    exit;
}

/**
 * Resolve an auth token from (in order): JSON body {token},
 * query string ?token= or the Authorization: Bearer header.
 */
function resolve_token(array $data = []): string {
    $token = trim((string)($data['token'] ?? ''));
    if ($token === '') {
        $token = trim((string)($_GET['token'] ?? ''));
    }
    if ($token === '') {
        $header = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
        if (stripos($header, 'Bearer ') === 0) {
            $token = trim(substr($header, 7));
        }
    }
    return $token;
}

/**
 * Map an auth token to a users row.
 * Real session: looked up in auth_tokens JOIN users.
 * Demo session (DB offline): token format "demo-ROLE-username".
 */
function current_user(PDO $pdo, array $data = []): ?array {
    $token = resolve_token($data);
    if ($token === '') {
        return null;
    }
    if (str_starts_with($token, 'demo-')) {
        $parts = explode('-', $token);
        $role = strtoupper((string)($parts[1] ?? 'STUDENT'));
        $uid  = (string)($parts[2] ?? '');
        if (!in_array($role, ['STUDENT', 'DRIVER'], true) || $uid === '') {
            return null;
        }
        return ['user_id' => 0, 'username' => $uid, 'full_name' => $uid, 'role' => $role, 'demo' => true];
    }
    try {
        $stmt = $pdo->prepare("
            SELECT u.user_id, u.username, u.full_name, u.role
            FROM auth_tokens t
            JOIN users u ON u.user_id = t.user_id
            WHERE t.token = ? AND t.expires_at > NOW()
            LIMIT 1
        ");
        $stmt->execute([$token]);
        $row = $stmt->fetch();
        return $row ?: null;
    } catch (Throwable $e) {
        return null;
    }
}

/**
 * Require an authenticated user (optionally of one role).
 * Returns the users row, or exits with a friendly error.
 */
function require_user(PDO $pdo, ?string $role = null, array $data = []): array {
    $user = current_user($pdo, $data);
    if (!$user) {
        json_response(false, 'Please log in to continue.', [], 401);
    }
    if ($role !== null && $user['role'] !== $role) {
        json_response(false, 'Unauthorized access.', [], 403);
    }
    return $user;
}
