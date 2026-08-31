<?php
declare(strict_types=1);

/**
 * Sign a student in to the portal.
 *
 * Request body:  {"student_no": "...", "password": "..."}
 *
 * Three things can come back:
 *
 *   200  signed in; the session cookie carries them from here
 *   409  reason "password_not_set" — the account is real but has never been
 *        claimed, so the portal sends them to the set-a-password screen
 *   401  anything else, said the same way whether the number was unknown or
 *        the password was wrong
 *
 * A student row arrives from the desktop sync with `password_hash` NULL, which
 * is what the 409 reports. Nobody issues a password: the student sets their own
 * the first time they visit. See student-set-password.php.
 */

require __DIR__ . '/student-auth.php';

require_method('POST');

$in        = json_input();
$studentNo = trim((string) ($in['student_no'] ?? ''));
$password  = (string) ($in['password'] ?? '');

if ($studentNo === '' || $password === '') {
    json_error('Your ID number and password are required.', 401);
}

$row = find_student($studentNo);

// Verify against a hash of nothing when the number is unknown, so an unknown
// number takes the same time as a wrong password and cannot be told apart.
$hash = is_array($row) ? $row['password_hash'] : null;
if ($hash === null) {
    password_verify($password, AUTH_DUMMY_HASH);
}

if (!is_array($row)) {
    json_error('Wrong ID number or password.', 401);
}

if ($row['password_hash'] === null) {
    json_response([
        'ok'     => false,
        'reason' => 'password_not_set',
        'error'  => 'This is your first visit. Set a password to continue.',
    ], 409);
}

if (!password_verify($password, (string) $row['password_hash'])) {
    json_error('Wrong ID number or password.', 401);
}

// Cost factors go up over the years; a student signing in is the only moment
// the plaintext is in hand to upgrade an old hash with.
if (password_needs_rehash((string) $row['password_hash'], PASSWORD_BCRYPT)) {
    $stmt = db()->prepare('UPDATE students SET password_hash = ? WHERE id = ?');
    $stmt->execute([password_hash($password, PASSWORD_BCRYPT), (int) $row['id']]);
}

sign_student_in($row);

json_response([
    'ok'      => true,
    'student' => student_public($row),
]);
