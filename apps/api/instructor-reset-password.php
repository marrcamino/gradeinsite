<?php
declare(strict_types=1);

/**
 * Set a new password for an instructor who has forgotten theirs.
 *
 * The 2024 sign-in screen carried a "Forgot password?" link that went nowhere
 * — it is an <a href="#"> in both the desktop source and the surviving portal
 * build, and no endpoint behind it was ever written. This is that link.
 *
 * There is no email on a school network, so the request is approved the same
 * way a new account is: by an instructor who already has one. That is the model
 * instructor-register.php already establishes, and reusing it means a school
 * has one answer to "who can vouch for a colleague" rather than two.
 *
 * Unlike registration there is no bootstrap case. Resetting a password implies
 * an account exists, so somebody exists to approve it — and if the school has
 * exactly one instructor and they are locked out, an open endpoint here would
 * let anyone on the wi-fi take that account. That case goes through the
 * database by hand, which is the right amount of friction for it.
 *
 * Request body:
 *
 *   {"username": "...", "password": "...",        <- an instructor who is
 *    "account": {"username": "...",                  approving the reset
 *                "password": "..."}}              <- the one being reset
 */

require __DIR__ . '/auth.php';

require_method('POST');

$in = json_input();

// Whoever approves this has to prove who they are first. require_instructor
// ends the request with 401 if they cannot.
$approver = require_instructor($in);

$account     = is_array($in['account'] ?? null) ? $in['account'] : [];
$username    = trim((string) ($account['username'] ?? ''));
$newPassword = (string) ($account['password'] ?? '');

if ($username === '') {
    json_error('Say which account to reset.', 422);
}
if (strlen($newPassword) < INSTRUCTOR_MIN_PASSWORD_LENGTH) {
    json_error(
        'The new password must be at least ' . INSTRUCTOR_MIN_PASSWORD_LENGTH . ' characters.',
        422
    );
}

$pdo = db();

$stmt = $pdo->prepare('SELECT id, username, last_name, first_name FROM instructors WHERE username = ?');
$stmt->execute([$username]);
$target = $stmt->fetch();

if (!is_array($target)) {
    json_error('There is no account with that username.', 404);
}

$update = $pdo->prepare('UPDATE instructors SET password_hash = ? WHERE id = ?');
$update->execute([password_hash($newPassword, PASSWORD_BCRYPT), (int) $target['id']]);

// Worth a line in the server's log: a password changing hands is the kind of
// thing somebody may need to account for later, and nothing else records it.
error_log(sprintf(
    'Instructor password reset: "%s" reset by "%s".',
    $target['username'],
    $approver['username']
));

json_response([
    'ok'         => true,
    'instructor' => [
        'id'         => (int) $target['id'],
        'username'   => $target['username'],
        'last_name'  => $target['last_name'],
        'first_name' => $target['first_name'],
    ],
]);
