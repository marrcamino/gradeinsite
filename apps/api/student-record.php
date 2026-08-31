<?php
declare(strict_types=1);

/**
 * One course, as the portal's detail screen shows it.
 *
 *   GET student-record.php?record_id=8
 *
 * The 2024 screen this serves had four parts: the overall percentage, the
 * grade in each period, a PERCENTAGE DISTRIBUTION table and a GRADE COMPONENTS
 * table. Everything below exists for one of them.
 *
 * The record id comes from the request, because picking a course is the whole
 * point of the screen — but the query reaches it through `enrollments` on the
 * session's student id, so an id belonging to a course this student is not in
 * finds nothing and returns 404. Being enrolled is what grants the read; the id
 * only chooses among the courses that grant already covers.
 *
 * Individual quiz and assignment marks are deliberately not sent. The screen
 * shows period grades and the two percentage tables, so `raw_scores` would be
 * data leaving the server for nothing to display.
 */

require __DIR__ . '/student-auth.php';

require_method('GET');

$student = require_student();

$recordId = filter_input(INPUT_GET, 'record_id', FILTER_VALIDATE_INT, [
    'options' => ['min_range' => 1],
]);

if (!is_int($recordId)) {
    json_error('A record_id is required.', 422);
}

$stmt = db()->prepare(
    'SELECT e.id AS enrollment_id,
            e.final_grade,
            e.remarks,
            c.id,
            c.course_code,
            c.course_name,
            c.term,
            c.school_year_start,
            c.school_year_end,
            c.schedule,
            c.instructor_name,
            c.weight_prelim, c.weight_premid, c.weight_midterm,
            c.weight_prefinal, c.weight_final,
            c.pct_quizzes, c.pct_attendance, c.pct_assignment,
            c.pct_course_output, c.pct_oral, c.pct_major_exam
       FROM enrollments   e
       JOIN class_records c ON c.id = e.class_record_id
      WHERE e.student_id = ? AND c.id = ?'
);
$stmt->execute([(int) $student['id'], $recordId]);
$row = $stmt->fetch();

// The same answer whether the record does not exist or belongs to a course
// this student is not in. Which of the two it was is not their business.
if (!is_array($row)) {
    json_error('No such course.', 404);
}

// --- The grade in each period ----------------------------------------------

$grades = db()->prepare(
    'SELECT period, grade, is_incomplete
       FROM period_grades
      WHERE enrollment_id = ?'
);
$grades->execute([(int) $row['enrollment_id']]);

$marked = [];
foreach ($grades->fetchAll() as $grade) {
    $marked[(string) $grade['period']] = $grade;
}

/**
 * Only the periods this record actually uses, in the order the sheet runs.
 *
 * A weight of nothing means the school does not use that period — the desktop
 * hides its sheet, so the portal does not list it either. A used period with no
 * row yet is listed with a null grade rather than left out, so a term still
 * being marked shows what is coming rather than a short list.
 */
$periods = [];
foreach (['prelim', 'premid', 'midterm', 'prefinal', 'final'] as $period) {
    $weight = (float) $row['weight_' . $period];
    if ($weight <= 0) {
        continue;
    }

    $grade = $marked[$period] ?? null;

    $periods[] = [
        'period'        => $period,
        'weight'        => $weight,
        'grade'         => $grade === null || $grade['grade'] === null
            ? null
            : (float) $grade['grade'],
        // The 2024 "lack" flag: marked, but some scores were never entered.
        'is_incomplete' => $grade !== null && (int) $grade['is_incomplete'] === 1,
    ];
}

json_response([
    'ok'      => true,
    'student' => student_public($student),
    'record'  => [
        'id'                => (int) $row['id'],
        'course_code'       => $row['course_code'],
        'course_name'       => $row['course_name'],
        'term'              => (int) $row['term'],
        'school_year_start' => (int) $row['school_year_start'],
        'school_year_end'   => (int) $row['school_year_end'],
        'schedule'          => $row['schedule'],
        'instructor_name'   => $row['instructor_name'],

        // GRADE COMPONENTS: what each grading period is worth. All five are
        // sent, including the unused zeroes, because the 2024 table listed
        // every period by name and said 0% against the ones not in use.
        'weights'           => [
            'prelim'   => (float) $row['weight_prelim'],
            'premid'   => (float) $row['weight_premid'],
            'midterm'  => (float) $row['weight_midterm'],
            'prefinal' => (float) $row['weight_prefinal'],
            'final'    => (float) $row['weight_final'],
        ],

        // PERCENTAGE DISTRIBUTION: within a period, what each kind of work is
        // worth. Keyed the way the schema names them, not by the 2024 labels.
        'distribution'      => [
            'quizzes'       => (float) $row['pct_quizzes'],
            'attendance'    => (float) $row['pct_attendance'],
            'assignment'    => (float) $row['pct_assignment'],
            'course_output' => (float) $row['pct_course_output'],
            'oral'          => (float) $row['pct_oral'],
            'major_exam'    => (float) $row['pct_major_exam'],
        ],
    ],
    'periods'     => $periods,
    // The overall figure. Null while the term is still being marked — the
    // desktop computes this and the portal only ever displays it.
    'final_grade' => $row['final_grade'] === null ? null : (float) $row['final_grade'],
    'remarks'     => $row['remarks'],
]);
