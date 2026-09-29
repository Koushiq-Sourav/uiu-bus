<?php
/**
 * PARTITION: LOGIN / AUTH — LOGOUT
 * POST api/logout.php { token? }
 * Destroys the server-side session (deletes the auth token).
 * Called from: assets/js/auth.js :: handleLogout()
 */
require __DIR__ . '/config.php';

$data = json_input();
$token = resolve_token($data);
if ($token !== '' && !str_starts_with($token, 'demo-')) {
    try {
        $stmt = $pdo->prepare('DELETE FROM auth_tokens WHERE token = ?');
        $stmt->execute([$token]);
    } catch (Throwable $e) {
        // Logout must always succeed client-side.
    }
}

json_response(true, 'Logged out.', []);
