import { NOW, decodeJson, encodeJson, insert, row, rows, run } from './connection'
import type { ClassRecord, SheetLayout } from './types'

/**
 * Class records — one row per course an instructor teaches in a term.
 *
 * In 2024 each of these created a table at runtime, named after the record and
 * the instructor. Here it is a row, and the students in it are rows in
 * `enrollments`.
 */

export interface ClassRecordInput {
  program: string
  year_level: number
  course_code: string
  course_name: string
  term: number
  school_year_start: number
  schedule?: string | null
  instructor_name?: string | null
  weight_prelim: number
  weight_premid: number
  weight_midterm: number
  weight_prefinal: number
  weight_final: number
  pct_quizzes: number
  pct_attendance: number
  pct_assignment: number
  pct_course_output: number
  pct_oral: number
  pct_major_exam: number
  sheet_layout?: SheetLayout | null
}

interface ClassRecordRow extends Omit<ClassRecord, 'sheet_layout'> {
  sheet_layout: string | null
}

const COLUMNS = `id, server_id, program, year_level, course_code, course_name, term,
                 school_year_start, school_year_end, schedule, instructor_name,
                 weight_prelim, weight_premid, weight_midterm, weight_prefinal, weight_final,
                 pct_quizzes, pct_attendance, pct_assignment, pct_course_output,
                 pct_oral, pct_major_exam, sheet_layout,
                 created_at, updated_at, synced_at`

function hydrate(record: ClassRecordRow): ClassRecord {
  return { ...record, sheet_layout: decodeJson<SheetLayout>(record.sheet_layout) }
}

/** The two totals the schema also enforces, checked before a write reaches it. */
export function weightsTotal(input: ClassRecordInput): number {
  return (
    input.weight_prelim +
    input.weight_premid +
    input.weight_midterm +
    input.weight_prefinal +
    input.weight_final
  )
}

export function sharesTotal(input: ClassRecordInput): number {
  return (
    input.pct_quizzes +
    input.pct_attendance +
    input.pct_assignment +
    input.pct_course_output +
    input.pct_oral +
    input.pct_major_exam
  )
}

/**
 * Why this is checked here as well as in the database: a CHECK constraint can
 * only refuse the write, and "CHECK constraint failed" is not something to put
 * in front of an instructor. This returns the sentence to show instead.
 */
export function describeInvalid(input: ClassRecordInput): string | null {
  const weights = Math.round(weightsTotal(input) * 100) / 100
  const shares = Math.round(sharesTotal(input) * 100) / 100

  if (weights !== 0 && weights !== 100) {
    return `The grading period weights add up to ${weights}, not 100.`
  }
  if (shares !== 0 && shares !== 100) {
    return `The percentage distribution adds up to ${shares}, not 100.`
  }
  if (input.term !== 1 && input.term !== 2) {
    return 'The term must be the first or the second semester.'
  }
  if (input.year_level < 1 || input.year_level > 6) {
    return 'The year level must be between 1 and 6.'
  }
  if (!input.course_code.trim() || !input.course_name.trim()) {
    return 'A course code and course name are required.'
  }
  return null
}

export async function listClassRecords(): Promise<ClassRecord[]> {
  const found = await rows<ClassRecordRow>(
    `SELECT ${COLUMNS}
       FROM class_records
      ORDER BY school_year_start DESC, term, course_code`
  )
  return found.map(hydrate)
}

export async function getClassRecord(id: number): Promise<ClassRecord | null> {
  const found = await row<ClassRecordRow>(
    `SELECT ${COLUMNS} FROM class_records WHERE id = $1`,
    [id]
  )
  return found ? hydrate(found) : null
}

function values(input: ClassRecordInput): unknown[] {
  return [
    input.program.trim(),
    input.year_level,
    input.course_code.trim(),
    input.course_name.trim(),
    input.term,
    input.school_year_start,
    // The schema requires the two years to be consecutive, so only the first
    // is ever asked for.
    input.school_year_start + 1,
    input.schedule?.trim() || null,
    input.instructor_name?.trim() || null,
    input.weight_prelim,
    input.weight_premid,
    input.weight_midterm,
    input.weight_prefinal,
    input.weight_final,
    input.pct_quizzes,
    input.pct_attendance,
    input.pct_assignment,
    input.pct_course_output,
    input.pct_oral,
    input.pct_major_exam,
    encodeJson(input.sheet_layout ?? null),
  ]
}

export function createClassRecord(input: ClassRecordInput): Promise<number> {
  return insert(
    `INSERT INTO class_records
         (program, year_level, course_code, course_name, term,
          school_year_start, school_year_end, schedule, instructor_name,
          weight_prelim, weight_premid, weight_midterm, weight_prefinal, weight_final,
          pct_quizzes, pct_attendance, pct_assignment, pct_course_output,
          pct_oral, pct_major_exam, sheet_layout)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
             $15, $16, $17, $18, $19, $20, $21)`,
    values(input)
  )
}

export function updateClassRecord(id: number, input: ClassRecordInput): Promise<number> {
  return run(
    `UPDATE class_records
        SET program           = $1,
            year_level        = $2,
            course_code       = $3,
            course_name       = $4,
            term              = $5,
            school_year_start = $6,
            school_year_end   = $7,
            schedule          = $8,
            instructor_name   = $9,
            weight_prelim     = $10,
            weight_premid     = $11,
            weight_midterm    = $12,
            weight_prefinal   = $13,
            weight_final      = $14,
            pct_quizzes       = $15,
            pct_attendance    = $16,
            pct_assignment    = $17,
            pct_course_output = $18,
            pct_oral          = $19,
            pct_major_exam    = $20,
            sheet_layout      = $21,
            updated_at        = ${NOW}
      WHERE id = $22`,
    [...values(input), id]
  )
}

/** Just the sheet shape, which the sheet screen changes on its own. */
export function saveSheetLayout(id: number, layout: SheetLayout): Promise<number> {
  return run(
    `UPDATE class_records SET sheet_layout = $1, updated_at = ${NOW} WHERE id = $2`,
    [encodeJson(layout), id]
  )
}

/** Cascades to the enrollments and their period grades, here and on the server. */
export function deleteClassRecord(id: number): Promise<number> {
  return run('DELETE FROM class_records WHERE id = $1', [id])
}
