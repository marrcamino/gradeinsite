<?php
declare(strict_types=1);

/**
 * Who is signed in?
 *
 * The portal asks this once on load. A student who reloads the page, or comes
 * back to an open tab, keeps their session cookie and lands on their grades
 * rather than on the sign-in screen.
 *
 * The row is re-read from the database rather than remembered in the session,
 * so a student the school has removed stops working immediately instead of at
 * the end of their session.
 */

require __DIR__ . '/student-auth.php';

require_method('GET');

json_response([
    'ok'      => true,
    'student' => student_public(require_student()),
]);
