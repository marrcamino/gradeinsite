<?php
declare(strict_types=1);

/**
 * Let an instructor clear a student's portal password.
 *
 * The school has no email and no SMS, so the usual "we sent you a link" reset
 * is not available — there is nothing to send it over. The authority that does
 * exist is the instructor, who already holds the class record the student is
 * on, so the reset runs through them.
 *
 * What this does is set `password_hash` back to NULL, which is the state a
 * student row arrives in from the desktop sync. That returns the account to
 * unclaimed, and student-set-password.php lets the student claim it again with
 * their ID number and last name exactly as they did the first time.
 *
 * Doing it that way rather than issuing a new password is deliberate:
 *
 *   * The instructor never sees or types a password, so there is nothing to
 *     read out in a corridor, write on a slip, or forget to change later.
 *   * The student picks their own, so the account has one owner throughout.
 *   * The portal needs no new screen. The claim flow already exists and is
 *     the one the student has met before.
 *
 * Request body:
 *
 *   {"username": "...", "password": "...", "student_no": "..."}
 *
 * where the username and password are the INSTRUCTOR's — the same credentials
 * every other desktop endpoint takes.
 */

require __DIR__ . '/auth.php';

require_method('POST');

$in         = json_input();
$instructor = require_instructor($in);

$studentNo = trim((string) ($in['student_no'] ?? ''));
if ($studentNo === '') {
    json_error('A student number is required.', 422);
}

/**
 * Reached through this instructor's own class records.
 *
 * An instructor may reset a student they teach and nobody else. Scoping the
 * lookup rather than checking afterwards means a student number belonging to
 * another instructor's class finds nothing, and the answer is the same as for
 * a number that does not exist at all.
 */
$stmt = db()->prepare(
    'SELECT s.id, s.last_name, s.first_name, s.password_hash
       FROM students     s
       JOIN enrollments  e ON e.student_id = s.id
       JOIN class_records c ON c.id = e.class_record_id
      WHERE s.student_no = ? AND c.instructor_id = ?
      LIMIT 1'
);
$stmt->execute([$studentNo, (int) $instructor['id']]);
$student = $stmt->fetch();

if (!is_array($student)) {
    json_error('No student with that number is on any of your class records.', 404);
}

// Already unclaimed is not a failure. The instructor asked for the account to
// be resettable and it is; saying "nothing to do" would only invite them to
// wonder whether the reset worked.
$alreadyClear = $student['password_hash'] === null;

if (!$alreadyClear) {
    $clear = db()->prepare('UPDATE students SET password_hash = NULL WHERE id = ?');
    $clear->execute([(int) $student['id']]);
}

json_response([
    'ok'         => true,
    'student_no' => $studentNo,
    'name'       => trim($student['first_name'] . ' ' . $student['last_name']),
    // So the desktop can say "already had none" rather than claim it cleared one.
    'was_set'    => !$alreadyClear,
]);
