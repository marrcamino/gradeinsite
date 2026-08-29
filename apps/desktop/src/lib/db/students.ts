import { NOW, insert, row, rows, run } from './connection'
import type { Student } from './types'

/**
 * The student list.
 *
 * A student exists once, here, and is put into a class record by enrolling
 * them. The 2024 app copied a student's name and program into every per-record
 * table, so correcting a spelling meant finding every copy.
 */

export interface StudentInput {
  student_no: string
  last_name: string
  first_name: string
  middle_initial?: string | null
  program: string
  year_level?: number | null
  contact?: string | null
}

const COLUMNS = `id, server_id, student_no, last_name, first_name, middle_initial,
                 program, year_level, contact, created_at, updated_at`

export function listStudents(): Promise<Student[]> {
  return rows<Student>(
    `SELECT ${COLUMNS} FROM students ORDER BY last_name, first_name`
  )
}

/** Students not yet in a given class record, for the "add student" picker. */
export function listStudentsNotIn(classRecordId: number): Promise<Student[]> {
  return rows<Student>(
    `SELECT ${COLUMNS}
       FROM students
      WHERE id NOT IN (SELECT student_id FROM enrollments WHERE class_record_id = $1)
      ORDER BY last_name, first_name`,
    [classRecordId]
  )
}

export function getStudent(id: number): Promise<Student | null> {
  return row<Student>(`SELECT ${COLUMNS} FROM students WHERE id = $1`, [id])
}

export function findStudentByNumber(studentNo: string): Promise<Student | null> {
  return row<Student>(`SELECT ${COLUMNS} FROM students WHERE student_no = $1`, [studentNo])
}

export function createStudent(input: StudentInput): Promise<number> {
  return insert(
    `INSERT INTO students
         (student_no, last_name, first_name, middle_initial, program, year_level, contact)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.student_no.trim(),
      input.last_name.trim(),
      input.first_name.trim(),
      input.middle_initial?.trim() || null,
      input.program.trim(),
      input.year_level ?? null,
      input.contact?.trim() || null,
    ]
  )
}

export function updateStudent(id: number, input: StudentInput): Promise<number> {
  return run(
    `UPDATE students
        SET student_no     = $1,
            last_name      = $2,
            first_name     = $3,
            middle_initial = $4,
            program        = $5,
            year_level     = $6,
            contact        = $7,
            updated_at     = ${NOW}
      WHERE id = $8`,
    [
      input.student_no.trim(),
      input.last_name.trim(),
      input.first_name.trim(),
      input.middle_initial?.trim() || null,
      input.program.trim(),
      input.year_level ?? null,
      input.contact?.trim() || null,
      id,
    ]
  )
}

/**
 * Removing a student removes them from this instructor's class records. The
 * server keeps its own student row, which other instructors point at and which
 * carries the student's portal login.
 */
export function deleteStudent(id: number): Promise<number> {
  return run('DELETE FROM students WHERE id = $1', [id])
}
