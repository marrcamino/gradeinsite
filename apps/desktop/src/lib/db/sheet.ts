import { NOW, decodeJson, encodeJson, fromFlag, insert, rows, run, toFlag } from './connection'
import type { Period, PeriodGrade, RawScores, Remark, SheetRow } from './types'

/**
 * The sheet: who is in a class record, and what they scored in each period.
 *
 * An enrollment is a student's row on the sheet. A period grade is one cell
 * block in that row — the marks for one grading period, plus the grade computed
 * from them.
 */

interface PeriodGradeRow extends Omit<PeriodGrade, 'raw_scores' | 'is_incomplete'> {
  raw_scores: string | null
  is_incomplete: number
}

/** Every student on a sheet, in the order the instructor arranged them. */
export function listSheetRows(classRecordId: number): Promise<SheetRow[]> {
  return rows<SheetRow>(
    `SELECT e.id, e.server_id, e.class_record_id, e.student_id, e.row_order,
            e.final_grade, e.remarks, e.created_at, e.updated_at,
            s.student_no, s.last_name, s.first_name, s.middle_initial,
            s.program, s.year_level
       FROM enrollments e
       JOIN students    s ON s.id = e.student_id
      WHERE e.class_record_id = $1
      ORDER BY e.row_order IS NULL, e.row_order, s.last_name, s.first_name`,
    [classRecordId]
  )
}

/**
 * Put a student on the sheet. New rows go to the end, so adding someone
 * mid-term does not renumber everybody above them.
 */
export async function enrolStudent(classRecordId: number, studentId: number): Promise<number> {
  const [next] = await rows<{ next_order: number }>(
    `SELECT COALESCE(MAX(row_order), 0) + 1 AS next_order
       FROM enrollments WHERE class_record_id = $1`,
    [classRecordId]
  )

  return insert(
    `INSERT INTO enrollments (class_record_id, student_id, row_order)
     VALUES ($1, $2, $3)`,
    [classRecordId, studentId, next?.next_order ?? 1]
  )
}

export function removeEnrollment(enrollmentId: number): Promise<number> {
  return run('DELETE FROM enrollments WHERE id = $1', [enrollmentId])
}

/**
 * The final grade and remarks, which the app works out from the period grades
 * and the record's weights. The student portal only ever displays these.
 */
export function saveFinalGrade(
  enrollmentId: number,
  finalGrade: number | null,
  remarks: Remark | null
): Promise<number> {
  return run(
    `UPDATE enrollments
        SET final_grade = $1, remarks = $2, updated_at = ${NOW}
      WHERE id = $3`,
    [finalGrade, remarks, enrollmentId]
  )
}

/** Re-number the rows after a drag, in the order the ids are given. */
export async function reorderSheet(enrollmentIds: number[]): Promise<void> {
  for (const [index, id] of enrollmentIds.entries()) {
    await run(`UPDATE enrollments SET row_order = $1, updated_at = ${NOW} WHERE id = $2`, [
      index + 1,
      id,
    ])
  }
}

/** Every period grade on a sheet, keyed by enrollment and then by period. */
export async function listPeriodGrades(
  classRecordId: number
): Promise<Map<number, Map<Period, PeriodGrade>>> {
  const found = await rows<PeriodGradeRow>(
    `SELECT p.id, p.server_id, p.enrollment_id, p.period, p.grade, p.is_incomplete,
            p.raw_scores, p.created_at, p.updated_at
       FROM period_grades p
       JOIN enrollments   e ON e.id = p.enrollment_id
      WHERE e.class_record_id = $1`,
    [classRecordId]
  )

  const byEnrollment = new Map<number, Map<Period, PeriodGrade>>()

  for (const record of found) {
    const grade: PeriodGrade = {
      ...record,
      is_incomplete: fromFlag(record.is_incomplete),
      raw_scores: decodeJson<RawScores>(record.raw_scores),
    }

    let periods = byEnrollment.get(grade.enrollment_id)
    if (!periods) {
      periods = new Map()
      byEnrollment.set(grade.enrollment_id, periods)
    }
    periods.set(grade.period, grade)
  }

  return byEnrollment
}

/**
 * Write one period's marks.
 *
 * This is an upsert on (enrollment_id, period) rather than an insert or an
 * update decided in the app: the sheet edits a cell without caring whether that
 * period has ever been saved before, and the unique key is what makes both
 * cases the same statement.
 */
export function savePeriodGrade(
  enrollmentId: number,
  period: Period,
  grade: number | null,
  isIncomplete: boolean,
  rawScores: RawScores | null
): Promise<number> {
  return run(
    `INSERT INTO period_grades (enrollment_id, period, grade, is_incomplete, raw_scores)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (enrollment_id, period) DO UPDATE
        SET grade         = excluded.grade,
            is_incomplete = excluded.is_incomplete,
            raw_scores    = excluded.raw_scores,
            updated_at    = ${NOW}`,
    [enrollmentId, period, grade, toFlag(isIncomplete), encodeJson(rawScores)]
  )
}

export function deletePeriodGrade(enrollmentId: number, period: Period): Promise<number> {
  return run('DELETE FROM period_grades WHERE enrollment_id = $1 AND period = $2', [
    enrollmentId,
    period,
  ])
}
