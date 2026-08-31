<?php
declare(strict_types=1);

/**
 * The courses a student is enrolled in — the portal's list screen.
 *
 * Takes no parameters. The student is whoever the session says, so there is
 * nothing in the request to change in order to read another student's courses.
 *
 * This replaces two endpoints and a scan. The 2024 portal called
 * get_all_records.php for every class record in the school, built the table
 * name `rcrd_<id>_<instructor_id>` for each one, posted that whole list to
 * get_filter_records.php, and had the server open each table in turn to see
 * whether this student was in it. Enrollment being a row rather than a table
 * makes it the single indexed query below, on ix_enrollments_student.
 *
 * Newest school year first, then by term, then by course code — a student
 * opens the portal to see the term they are in now.
 */

require __DIR__ . '/student-auth.php';

require_method('GET');

$student = require_student();

$stmt = db()->prepare(
    'SELECT c.id,
            c.course_code,
            c.course_name,
            c.term,
            c.school_year_start,
            c.school_year_end,
            c.schedule,
            c.instructor_name,
            e.final_grade,
            e.remarks
       FROM enrollments   e
       JOIN class_records c ON c.id = e.class_record_id
      WHERE e.student_id = ?
      ORDER BY c.school_year_start DESC, c.term, c.course_code'
);
$stmt->execute([(int) $student['id']]);

$records = array_map(
    static fn(array $row): array => [
        'id'                => (int) $row['id'],
        'course_code'       => $row['course_code'],
        'course_name'       => $row['course_name'],
        'term'              => (int) $row['term'],
        'school_year_start' => (int) $row['school_year_start'],
        'school_year_end'   => (int) $row['school_year_end'],
        'schedule'          => $row['schedule'],
        'instructor_name'   => $row['instructor_name'],
        // Null while the term is still being graded. The portal says so rather
        // than printing a partial average as if it were the result.
        'final_grade'       => $row['final_grade'] === null ? null : (float) $row['final_grade'],
        'remarks'           => $row['remarks'],
    ],
    $stmt->fetchAll()
);

json_response([
    'ok'      => true,
    'student' => student_public($student),
    'records' => $records,
]);
