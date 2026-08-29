<?php
declare(strict_types=1);

/**
 * Sign an instructor in.
 *
 * The desktop app calls this once, when the laptop can reach the server, and
 * caches what comes back in its local `instructor_account` row. From then on it
 * opens and works offline; the returned id is what stamps every record it
 * pushes back up.
 */

require __DIR__ . '/auth.php';

require_method('POST');

$instructor = require_instructor(json_input());

json_response([
    'ok'         => true,
    'instructor' => $instructor,
]);
