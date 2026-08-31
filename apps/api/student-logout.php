<?php
declare(strict_types=1);

/**
 * Sign a student out.
 *
 * Portal machines are shared — a library terminal, a laptop passed around — so
 * this clears the session data, drops the cookie and destroys the session,
 * rather than only forgetting the id. Signing out has to leave nothing behind
 * for the next person at the keyboard.
 */

require __DIR__ . '/student-auth.php';

require_method('POST');

student_session_start();

$_SESSION = [];

if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires'  => time() - 42000,
        'path'     => $params['path'],
        'domain'   => $params['domain'],
        'secure'   => $params['secure'],
        'httponly' => $params['httponly'],
        'samesite' => $params['samesite'],
    ]);
}

session_destroy();

json_response(['ok' => true]);
