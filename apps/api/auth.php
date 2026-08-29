<?php
declare(strict_types=1);

/**
 * Instructor authentication, shared by every endpoint the desktop app calls.
 *
 * Credentials travel in the request body rather than a PHP session. The desktop
 * is a Tauri app, not a browser tab: it reaches the server from Rust, so there
 * is no cookie jar to hold a session and no origin for the browser to check.
 * A session would be plumbing with nothing to gain on a LAN that has no TLS.
 *
 * The student portal is the opposite case and does use a session — it really is
 * a browser, served from the same origin as this API.
 */

require_once __DIR__ . '/db.php';

/**
 * A valid bcrypt hash of a value nobody knows.
 *
 * When the username is unknown there is no stored hash to check, but returning
 * early would make an unknown username measurably faster than a wrong password
 * and so tell an attacker which usernames exist. Verifying against this instead
 * costs the same work and always fails.
 */
const AUTH_DUMMY_HASH = '$2y$10$obf1gueOymKPzf3/3Ixsme0IVlNHiPYPsefP8mwhxJRETmEe9FpBa';

/** Reject any request that does not use the method this endpoint accepts. */
function require_method(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
        header('Allow: ' . $method);
        json_error('This endpoint only accepts ' . $method . '.', 405);
    }
}

/**
 * Verify the credentials in a request body and return the instructor row
 * without its hash. Ends the request with 401 if they do not check out.
 */
function require_instructor(array $in): array
{
    $username = trim((string) ($in['username'] ?? ''));
    $password = (string) ($in['password'] ?? '');

    if ($username === '' || $password === '') {
        json_error('A username and password are required.', 401);
    }

    $stmt = db()->prepare(
        'SELECT id, username, password_hash, last_name, first_name
           FROM instructors
          WHERE username = ?'
    );
    $stmt->execute([$username]);
    $row = $stmt->fetch();

    $hash = is_array($row) ? (string) $row['password_hash'] : AUTH_DUMMY_HASH;
    if (!password_verify($password, $hash) || !is_array($row)) {
        json_error('Wrong username or password.', 401);
    }

    unset($row['password_hash']);
    $row['id'] = (int) $row['id'];

    return $row;
}
