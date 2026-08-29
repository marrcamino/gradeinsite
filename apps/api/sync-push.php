<?php
declare(strict_types=1);

/**
 * Drain the desktop app's outbox onto the server.
 *
 * The laptop works offline and queues every change in `sync_outbox`. When it
 * can reach the school server it posts the queue here, in the order it was
 * queued, and deletes each entry this endpoint confirms.
 *
 * Two things make that safe to retry after a dropped wi-fi connection:
 *
 *   * Every write is an upsert against a natural key, so sending the same
 *     change twice updates the same row rather than making a second one.
 *   * Nothing here trusts a server id. The desktop identifies a class record by
 *     its own local row id and a student by their student number — values it
 *     always knows, even for a record the server has never seen. A push that
 *     got lost on the way back therefore costs nothing but a repeat.
 *
 * Each change is applied in its own transaction. One bad row fails on its own
 * and comes back in `failed`; the rest still land, and the desktop keeps only
 * the failures queued.
 *
 * Request body:
 *
 *   {"username": "...", "password": "...",
 *    "changes": [{"id": 12, "entity": "class_record",
 *                 "operation": "insert", "payload": {...}}]}
 */

require __DIR__ . '/auth.php';

require_method('POST');

/**
 * A change this server refuses, for a reason the instructor can act on.
 *
 * It exists so the catch below can tell a rejection apart from a fault. Any
 * other exception is the server's problem, and its message can carry the query
 * or the schema, so only this one is ever repeated back to the client. Note
 * that PDOException extends RuntimeException, which is exactly why the test
 * cannot be a built-in class.
 */
final class SyncRejection extends Exception
{
}

/** More than this in one request is a client bug, not a busy instructor. */
const MAX_CHANGES = 500;

const PERIODS = ['prelim', 'premid', 'midterm', 'prefinal', 'final'];

$in         = json_input();
$instructor = require_instructor($in);
$pdo        = db();

$changes = is_array($in['changes'] ?? null) ? $in['changes'] : null;
if ($changes === null) {
    json_error('A "changes" list is required.', 422);
}
if (count($changes) > MAX_CHANGES) {
    json_error('Send at most ' . MAX_CHANGES . ' changes per request.', 413);
}

$applied = [];
$failed  = [];

foreach ($changes as $change) {
    $localId = isset($change['id']) ? (int) $change['id'] : null;

    try {
        $pdo->beginTransaction();
        $serverId = apply_change($pdo, (int) $instructor['id'], is_array($change) ? $change : []);
        $pdo->commit();

        $applied[] = ['id' => $localId, 'server_id' => $serverId];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        $isOurs = $e instanceof SyncRejection;
        if (!$isOurs) {
            error_log('Sync push failed: ' . $e->getMessage());
        }

        $failed[] = [
            'id'    => $localId,
            'error' => $isOurs ? $e->getMessage() : 'The server could not apply this change.',
        ];
    }
}

json_response([
    'ok'      => $failed === [],
    'applied' => $applied,
    'failed'  => $failed,
]);

// ---------------------------------------------------------------------------

/**
 * Apply one queued change and return the server id of the row it touched,
 * or null for a delete.
 */
function apply_change(PDO $pdo, int $instructorId, array $change): ?int
{
    $entity    = (string) ($change['entity'] ?? '');
    $operation = (string) ($change['operation'] ?? '');
    $payload   = is_array($change['payload'] ?? null) ? $change['payload'] : [];

    if (!in_array($operation, ['insert', 'update', 'delete'], true)) {
        throw new SyncRejection('Unknown operation "' . $operation . '".');
    }

    // insert and update are the same write: the natural key decides which it
    // turns out to be, which is what makes a replayed queue harmless.
    $deleting = $operation === 'delete';

    switch ($entity) {
        case 'student':
            return $deleting
                ? unenrol_student($pdo, $instructorId, $payload)
                : upsert_student($pdo, $payload);

        case 'class_record':
            return $deleting
                ? delete_class_record($pdo, $instructorId, $payload)
                : upsert_class_record($pdo, $instructorId, $payload);

        case 'enrollment':
            return $deleting
                ? delete_enrollment($pdo, $instructorId, $payload)
                : upsert_enrollment($pdo, $instructorId, $payload);

        case 'period_grade':
            return $deleting
                ? delete_period_grade($pdo, $instructorId, $payload)
                : upsert_period_grade($pdo, $instructorId, $payload);
    }

    throw new SyncRejection('Unknown entity "' . $entity . '".');
}

// --- Students --------------------------------------------------------------

function upsert_student(PDO $pdo, array $p): int
{
    $studentNo = text($p, 'student_no', 30, true);

    $stmt = $pdo->prepare(
        'INSERT INTO students
             (student_no, last_name, first_name, middle_initial, program, year_level, contact)
         VALUES (?, ?, ?, ?, ?, ?, ?) AS new
         ON DUPLICATE KEY UPDATE
             last_name      = new.last_name,
             first_name     = new.first_name,
             middle_initial = new.middle_initial,
             program        = new.program,
             year_level     = new.year_level,
             contact        = new.contact'
    );
    // password_hash is deliberately absent: the portal login belongs to the
    // student and the desktop has no copy of it to send.
    $stmt->execute([
        $studentNo,
        text($p, 'last_name', 60, true),
        text($p, 'first_name', 60, true),
        text($p, 'middle_initial', 5),
        text($p, 'program', 30, true),
        whole($p, 'year_level', 1, 6),
        text($p, 'contact', 30),
    ]);

    return student_id($pdo, $studentNo);
}

/**
 * A student deleted on the laptop leaves this instructor's records, not the
 * school. The student row is shared — other instructors have their own class
 * records pointing at it, and the portal login hangs off it.
 */
function unenrol_student(PDO $pdo, int $instructorId, array $p): ?int
{
    $stmt = $pdo->prepare(
        'DELETE e FROM enrollments e
           JOIN class_records c ON c.id = e.class_record_id
           JOIN students     s ON s.id = e.student_id
          WHERE c.instructor_id = ? AND s.student_no = ?'
    );
    $stmt->execute([$instructorId, text($p, 'student_no', 30, true)]);

    return null;
}

// --- Class records ---------------------------------------------------------

function upsert_class_record(PDO $pdo, int $instructorId, array $p): int
{
    $localId = whole($p, 'local_id', 1, null, true);

    $weights = [
        'weight_prelim'   => percent($p, 'weight_prelim'),
        'weight_premid'   => percent($p, 'weight_premid'),
        'weight_midterm'  => percent($p, 'weight_midterm'),
        'weight_prefinal' => percent($p, 'weight_prefinal'),
        'weight_final'    => percent($p, 'weight_final'),
    ];
    $shares = [
        'pct_quizzes'       => percent($p, 'pct_quizzes'),
        'pct_attendance'    => percent($p, 'pct_attendance'),
        'pct_assignment'    => percent($p, 'pct_assignment'),
        'pct_course_output' => percent($p, 'pct_course_output'),
        'pct_oral'          => percent($p, 'pct_oral'),
        'pct_major_exam'    => percent($p, 'pct_major_exam'),
    ];

    // The same rule the CHECK constraints enforce, said in a sentence. All zero
    // means the instructor has not set the record up yet, which is allowed.
    require_total($weights, 'grading period weights');
    require_total($shares, 'percentage distribution');

    $stmt = $pdo->prepare(
        'INSERT INTO class_records
             (instructor_id, local_id, program, year_level, course_code, course_name,
              term, school_year_start, school_year_end, schedule, instructor_name,
              weight_prelim, weight_premid, weight_midterm, weight_prefinal, weight_final,
              pct_quizzes, pct_attendance, pct_assignment, pct_course_output, pct_oral,
              pct_major_exam, sheet_layout, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW()) AS new
         ON DUPLICATE KEY UPDATE
             program           = new.program,
             year_level        = new.year_level,
             course_code       = new.course_code,
             course_name       = new.course_name,
             term              = new.term,
             school_year_start = new.school_year_start,
             school_year_end   = new.school_year_end,
             schedule          = new.schedule,
             instructor_name   = new.instructor_name,
             weight_prelim     = new.weight_prelim,
             weight_premid     = new.weight_premid,
             weight_midterm    = new.weight_midterm,
             weight_prefinal   = new.weight_prefinal,
             weight_final      = new.weight_final,
             pct_quizzes       = new.pct_quizzes,
             pct_attendance    = new.pct_attendance,
             pct_assignment    = new.pct_assignment,
             pct_course_output = new.pct_course_output,
             pct_oral          = new.pct_oral,
             pct_major_exam    = new.pct_major_exam,
             sheet_layout      = new.sheet_layout,
             synced_at         = NOW()'
    );
    $stmt->execute([
        $instructorId,
        $localId,
        text($p, 'program', 30, true),
        whole($p, 'year_level', 1, 6, true),
        text($p, 'course_code', 30, true),
        text($p, 'course_name', 120, true),
        whole($p, 'term', 1, 2, true),
        whole($p, 'school_year_start', 1900, 2999, true),
        whole($p, 'school_year_end', 1900, 2999, true),
        text($p, 'schedule', 60),
        text($p, 'instructor_name', 120),
        ...array_values($weights),
        ...array_values($shares),
        json_column($p, 'sheet_layout'),
    ]);

    return class_record_id($pdo, $instructorId, $localId);
}

function delete_class_record(PDO $pdo, int $instructorId, array $p): ?int
{
    $stmt = $pdo->prepare('DELETE FROM class_records WHERE instructor_id = ? AND local_id = ?');
    $stmt->execute([$instructorId, whole($p, 'local_id', 1, null, true)]);

    return null;
}

// --- Enrollments -----------------------------------------------------------

function upsert_enrollment(PDO $pdo, int $instructorId, array $p): int
{
    $classRecordId = class_record_id($pdo, $instructorId, whole($p, 'class_record_local_id', 1, null, true));
    $studentId     = student_id($pdo, text($p, 'student_no', 30, true));

    $stmt = $pdo->prepare(
        'INSERT INTO enrollments (class_record_id, student_id, row_order, final_grade, remarks)
         VALUES (?, ?, ?, ?, ?) AS new
         ON DUPLICATE KEY UPDATE
             row_order   = new.row_order,
             final_grade = new.final_grade,
             remarks     = new.remarks'
    );
    $stmt->execute([
        $classRecordId,
        $studentId,
        whole($p, 'row_order', 0, 65535),
        grade($p, 'final_grade'),
        remarks($p),
    ]);

    return enrollment_id($pdo, $classRecordId, $studentId);
}

function delete_enrollment(PDO $pdo, int $instructorId, array $p): ?int
{
    $classRecordId = class_record_id($pdo, $instructorId, whole($p, 'class_record_local_id', 1, null, true));
    $studentId     = student_id($pdo, text($p, 'student_no', 30, true));

    $stmt = $pdo->prepare('DELETE FROM enrollments WHERE class_record_id = ? AND student_id = ?');
    $stmt->execute([$classRecordId, $studentId]);

    return null;
}

// --- Period grades ---------------------------------------------------------

function upsert_period_grade(PDO $pdo, int $instructorId, array $p): int
{
    $enrollmentId = enrollment_from_payload($pdo, $instructorId, $p);
    $period       = period($p);

    $stmt = $pdo->prepare(
        'INSERT INTO period_grades (enrollment_id, period, grade, is_incomplete, raw_scores)
         VALUES (?, ?, ?, ?, ?) AS new
         ON DUPLICATE KEY UPDATE
             grade         = new.grade,
             is_incomplete = new.is_incomplete,
             raw_scores    = new.raw_scores'
    );
    $stmt->execute([
        $enrollmentId,
        $period,
        grade($p, 'grade'),
        !empty($p['is_incomplete']) ? 1 : 0,
        json_column($p, 'raw_scores'),
    ]);

    $find = $pdo->prepare('SELECT id FROM period_grades WHERE enrollment_id = ? AND period = ?');
    $find->execute([$enrollmentId, $period]);
    $id = $find->fetchColumn();

    if ($id === false) {
        throw new SyncRejection('The period grade was written but could not be read back.');
    }

    return (int) $id;
}

function delete_period_grade(PDO $pdo, int $instructorId, array $p): ?int
{
    $stmt = $pdo->prepare('DELETE FROM period_grades WHERE enrollment_id = ? AND period = ?');
    $stmt->execute([enrollment_from_payload($pdo, $instructorId, $p), period($p)]);

    return null;
}

// --- Resolving natural keys ------------------------------------------------

function student_id(PDO $pdo, string $studentNo): int
{
    $stmt = $pdo->prepare('SELECT id FROM students WHERE student_no = ?');
    $stmt->execute([$studentNo]);
    $id = $stmt->fetchColumn();

    if ($id === false) {
        throw new SyncRejection('No student with number "' . $studentNo . '" on the server yet.');
    }

    return (int) $id;
}

/** Scoped to the instructor, so a request can only ever reach its own records. */
function class_record_id(PDO $pdo, int $instructorId, int $localId): int
{
    $stmt = $pdo->prepare('SELECT id FROM class_records WHERE instructor_id = ? AND local_id = ?');
    $stmt->execute([$instructorId, $localId]);
    $id = $stmt->fetchColumn();

    if ($id === false) {
        throw new SyncRejection('Class record ' . $localId . ' has not reached the server yet.');
    }

    return (int) $id;
}

function enrollment_id(PDO $pdo, int $classRecordId, int $studentId): int
{
    $stmt = $pdo->prepare('SELECT id FROM enrollments WHERE class_record_id = ? AND student_id = ?');
    $stmt->execute([$classRecordId, $studentId]);
    $id = $stmt->fetchColumn();

    if ($id === false) {
        throw new SyncRejection('That student is not enrolled in that class record on the server yet.');
    }

    return (int) $id;
}

function enrollment_from_payload(PDO $pdo, int $instructorId, array $p): int
{
    return enrollment_id(
        $pdo,
        class_record_id($pdo, $instructorId, whole($p, 'class_record_local_id', 1, null, true)),
        student_id($pdo, text($p, 'student_no', 30, true))
    );
}

// --- Reading one field out of a payload ------------------------------------
//
// Prepared statements stop a value being read as SQL; these stop it being the
// wrong shape. A CHECK constraint would catch most of it anyway, but a named
// complaint is far easier to act on than "check constraint violated".

function text(array $p, string $key, int $max, bool $required = false): ?string
{
    $value = $p[$key] ?? null;

    if ($value === null || $value === '') {
        if ($required) {
            throw new SyncRejection('"' . $key . '" is required.');
        }
        return null;
    }
    if (!is_scalar($value)) {
        throw new SyncRejection('"' . $key . '" must be text.');
    }

    $value = trim((string) $value);
    if (mb_strlen($value) > $max) {
        throw new SyncRejection('"' . $key . '" is longer than ' . $max . ' characters.');
    }

    return $value;
}

function whole(array $p, string $key, int $min, ?int $max = null, bool $required = false): ?int
{
    $value = $p[$key] ?? null;

    if ($value === null || $value === '') {
        if ($required) {
            throw new SyncRejection('"' . $key . '" is required.');
        }
        return null;
    }
    if (!is_numeric($value) || (int) $value != $value) {
        throw new SyncRejection('"' . $key . '" must be a whole number.');
    }

    $value = (int) $value;
    if ($value < $min || ($max !== null && $value > $max)) {
        throw new SyncRejection(
            '"' . $key . '" must be between ' . $min . ' and ' . ($max ?? 'up'). '.'
        );
    }

    return $value;
}

/** Percentages that make up a whole have to total 100, or be untouched. */
function require_total(array $values, string $label): void
{
    $total = round(array_sum($values), 2);

    if ($total !== 0.0 && $total !== 100.0) {
        throw new SyncRejection('The ' . $label . ' add up to ' . $total . ', not 100.');
    }
}

/** A weight or distribution percentage. Absent means zero, not unknown. */
function percent(array $p, string $key): float
{
    $value = $p[$key] ?? 0;

    if (!is_numeric($value)) {
        throw new SyncRejection('"' . $key . '" must be a number.');
    }

    $value = (float) $value;
    if ($value < 0 || $value > 100) {
        throw new SyncRejection('"' . $key . '" must be between 0 and 100.');
    }

    return $value;
}

/** A grade, which is genuinely absent when it has not been computed yet. */
function grade(array $p, string $key): ?float
{
    $value = $p[$key] ?? null;

    if ($value === null || $value === '') {
        return null;
    }
    if (!is_numeric($value)) {
        throw new SyncRejection('"' . $key . '" must be a number.');
    }

    $value = (float) $value;
    if ($value < 0 || $value > 100) {
        throw new SyncRejection('"' . $key . '" must be between 0 and 100.');
    }

    return $value;
}

function period(array $p): string
{
    $value = (string) ($p['period'] ?? '');

    if (!in_array($value, PERIODS, true)) {
        throw new SyncRejection('"period" must be one of ' . implode(', ', PERIODS) . '.');
    }

    return $value;
}

/**
 * The server ENUM matches case-insensitively, so it would quietly accept
 * "passed" and store "PASSED". Normalising here keeps the two databases
 * spelling it the same way.
 */
function remarks(array $p): ?string
{
    $value = $p['remarks'] ?? null;

    if ($value === null || $value === '') {
        return null;
    }

    $value = strtoupper(trim((string) $value));
    if (!in_array($value, ['PASSED', 'FAILED', 'INC', 'DROPPED'], true)) {
        throw new SyncRejection('"remarks" must be PASSED, FAILED, INC or DROPPED.');
    }

    return $value;
}

/**
 * A JSON column. The desktop holds these as text, so they arrive either already
 * decoded or still as a string; MySQL wants a string either way, and rejects an
 * invalid one before it can be stored.
 */
function json_column(array $p, string $key): ?string
{
    $value = $p[$key] ?? null;

    if ($value === null || $value === '') {
        return null;
    }

    if (is_string($value)) {
        json_decode($value);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new SyncRejection('"' . $key . '" is not valid JSON.');
        }
        return $value;
    }

    $encoded = json_encode($value);
    if ($encoded === false) {
        throw new SyncRejection('"' . $key . '" could not be encoded as JSON.');
    }

    return $encoded;
}
