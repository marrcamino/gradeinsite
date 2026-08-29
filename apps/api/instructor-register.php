<?php
declare(strict_types=1);

/**
 * Create an instructor account.
 *
 * Who may call this:
 *
 *   * Nobody has an account yet — the first one is free, because there is no
 *     one left to ask. This is how a freshly installed server is bootstrapped.
 *   * Otherwise an existing instructor has to sign the request. An open
 *     endpoint on a school LAN is an open endpoint, and the panel machine sits
 *     on the same wi-fi as the students.
 *
 * Request body:
 *
 *   {"username": "...", "password": "...",          <- an existing instructor,
 *    "account": {"username": "...", "password": "...",   omitted for the first
 *                "last_name": "...", "first_name": "..."}}
 */

require __DIR__ . '/auth.php';

require_method('POST');

const MIN_PASSWORD_LENGTH = 8;

$in  = json_input();
$pdo = db();

$existing = (int) $pdo->query('SELECT COUNT(*) FROM instructors')->fetchColumn();
if ($existing > 0) {
    require_instructor($in);
}

$account    = is_array($in['account'] ?? null) ? $in['account'] : [];
$username   = trim((string) ($account['username'] ?? ''));
$password   = (string) ($account['password'] ?? '');
$lastName   = trim((string) ($account['last_name'] ?? ''));
$firstName  = trim((string) ($account['first_name'] ?? ''));

if ($username === '' || $lastName === '' || $firstName === '') {
    json_error('A username, last name and first name are required.', 422);
}
if (mb_strlen($username) > 60 || mb_strlen($lastName) > 60 || mb_strlen($firstName) > 60) {
    json_error('Username and names are limited to 60 characters.', 422);
}
if (strlen($password) < MIN_PASSWORD_LENGTH) {
    json_error('The password must be at least ' . MIN_PASSWORD_LENGTH . ' characters.', 422);
}

$stmt = $pdo->prepare(
    'INSERT INTO instructors (username, password_hash, last_name, first_name)
     VALUES (?, ?, ?, ?)'
);

try {
    $stmt->execute([
        $username,
        password_hash($password, PASSWORD_BCRYPT),
        $lastName,
        $firstName,
    ]);
} catch (PDOException $e) {
    // 23000 covers the unique key on username; anything else is a real fault.
    if ($e->getCode() === '23000') {
        json_error('That username is already taken.', 409);
    }
    error_log('Instructor registration failed: ' . $e->getMessage());
    json_error('Could not create the account.', 500);
}

json_response([
    'ok'         => true,
    'instructor' => [
        'id'         => (int) $pdo->lastInsertId(),
        'username'   => $username,
        'last_name'  => $lastName,
        'first_name' => $firstName,
    ],
], 201);
