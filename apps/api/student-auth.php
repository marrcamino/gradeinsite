<?php
declare(strict_types=1);

/**
 * Student authentication, shared by every endpoint the portal calls.
 *
 * This is the opposite case to auth.php. The portal really is a browser, served
 * by the same Apache as this API, so it gets a PHP session and a cookie: the
 * student signs in once and the session carries them through the rest of the
 * visit. The desktop app cannot do that, which is why instructors send their
 * credentials on every request instead.
 *
 * The session holds the student's row id and nothing else. Every query that
 * reads grades takes that id from the session, never from the request, so
 * changing a parameter cannot fetch somebody else's record — the hole the 2024
 * portal had, where the id it asked with was the id it had put in localStorage.
 */

require_once __DIR__ . '/auth.php';

/** The same floor instructor-register.php applies. */
const STUDENT_MIN_PASSWORD_LENGTH = 8;

/**
 * Begin the portal session.
 *
 * The cookie is host-only and path `/`, so a build that is renamed or nested
 * inside htdocs keeps working without a rebuild — the same reason the app
 * fetches by relative URL. `secure` is deliberately off: the school network has
 * no TLS, and a cookie flagged secure would simply never be sent.
 */
function student_session_start(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    session_start();
}

/** Look a student up by the number they sign in with. Includes the hash. */
function find_student(string $studentNo): ?array
{
    $stmt = db()->prepare(
        'SELECT id, student_no, last_name, first_name, middle_initial,
                program, year_level, password_hash
           FROM students
          WHERE student_no = ?'
    );
    $stmt->execute([$studentNo]);
    $row = $stmt->fetch();

    return is_array($row) ? $row : null;
}

/** The student as the portal is allowed to see them — no hash, ids as numbers. */
function student_public(array $row): array
{
    return [
        'id'             => (int) $row['id'],
        'student_no'     => $row['student_no'],
        'last_name'      => $row['last_name'],
        'first_name'     => $row['first_name'],
        'middle_initial' => $row['middle_initial'],
        'program'        => $row['program'],
        'year_level'     => $row['year_level'] === null ? null : (int) $row['year_level'],
    ];
}

/** Put a signed-in student into the session, with a fresh id to close off fixation. */
function sign_student_in(array $row): void
{
    student_session_start();
    session_regenerate_id(true);

    $_SESSION['student_id'] = (int) $row['id'];
}

/** The signed-in student, or null. Re-read every request, so a removed student stops. */
function current_student(): ?array
{
    student_session_start();

    $id = $_SESSION['student_id'] ?? null;
    if (!is_int($id)) {
        return null;
    }

    $stmt = db()->prepare(
        'SELECT id, student_no, last_name, first_name, middle_initial, program, year_level
           FROM students
          WHERE id = ?'
    );
    $stmt->execute([$id]);
    $row = $stmt->fetch();

    return is_array($row) ? $row : null;
}

/** The signed-in student, or end the request with 401. */
function require_student(): array
{
    $student = current_student();

    if ($student === null) {
        json_response(['error' => 'Please sign in.', 'reason' => 'signed_out'], 401);
    }

    return $student;
}

/** Reject a password the student would not be able to rely on. */
function require_usable_password(string $password): void
{
    if (strlen($password) < STUDENT_MIN_PASSWORD_LENGTH) {
        json_error(
            'Your password must be at least ' . STUDENT_MIN_PASSWORD_LENGTH . ' characters.',
            422
        );
    }
}
