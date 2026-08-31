<?php
declare(strict_types=1);

/**
 * Claim an account by setting its first password.
 *
 * Request body:  {"student_no": "...", "last_name": "...", "password": "..."}
 *
 * A student row reaches the server from the desktop sync with `password_hash`
 * NULL — the desktop has no copy of a portal password and never sends one. This
 * is the only endpoint that fills it in, and only while it is still NULL. After
 * that the account has an owner and this returns 409.
 *
 * Why the last name is asked for
 * ------------------------------
 * The sign-in screen is ID and password, as the 2024 portal's was. But a first
 * claim cannot ask for the password that does not exist yet, so on its own it
 * would let anyone who knows a classmate's ID number claim their grades before
 * they do — which would leave the password protecting nothing. The last name is
 * a second fact the desktop already syncs, so it costs the school no new
 * process: no passwords to issue, nothing for an instructor to hand out.
 *
 * It is a low bar, and deliberately so. It stops an opportunist with a class
 * list, not a determined classmate. The stronger version is an instructor
 * confirming each claim in the desktop app, which is a bigger change than this
 * screen and can replace this check later without the portal noticing.
 */

require __DIR__ . '/student-auth.php';

require_method('POST');

$in        = json_input();
$studentNo = trim((string) ($in['student_no'] ?? ''));
$lastName  = trim((string) ($in['last_name'] ?? ''));
$password  = (string) ($in['password'] ?? '');

if ($studentNo === '' || $lastName === '') {
    json_error('Your ID number and last name are required.', 422);
}

require_usable_password($password);

$row = find_student($studentNo);

// One message for an unknown number and for a mismatched name. Which of the
// two was wrong is exactly what somebody guessing wants to be told.
if (!is_array($row) || strcasecmp($lastName, (string) $row['last_name']) !== 0) {
    json_error('We could not match that ID number and last name.', 401);
}

if ($row['password_hash'] !== null) {
    json_response([
        'ok'     => false,
        'reason' => 'password_already_set',
        'error'  => 'This account already has a password. Sign in with it instead.',
    ], 409);
}

// WHERE password_hash IS NULL as well as by id: two claims arriving together
// would both pass the check above, and this makes the second one write nothing.
$stmt = db()->prepare(
    'UPDATE students SET password_hash = ? WHERE id = ? AND password_hash IS NULL'
);
$stmt->execute([password_hash($password, PASSWORD_BCRYPT), (int) $row['id']]);

if ($stmt->rowCount() === 0) {
    json_response([
        'ok'     => false,
        'reason' => 'password_already_set',
        'error'  => 'This account already has a password. Sign in with it instead.',
    ], 409);
}

// Setting the password signs them in, so the portal does not have to bounce
// them back to a login screen to type what they just chose.
sign_student_in($row);

json_response([
    'ok'      => true,
    'student' => student_public($row),
], 201);
