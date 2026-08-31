/**
 * The shapes of the rows in the local database.
 *
 * These mirror db/migrations/001_sqlite_local_schema.sql column for column. A
 * change there is a change here, and both are a change to the MySQL file too —
 * the two databases are meant to stay identical so a sync is a row-for-row
 * push.
 */

export const PERIODS = ['prelim', 'premid', 'midterm', 'prefinal', 'final'] as const
export type Period = (typeof PERIODS)[number]

export const REMARKS = ['PASSED', 'FAILED', 'INC', 'DROPPED'] as const
export type Remark = (typeof REMARKS)[number]

/** The kinds of work a period grade is made of, in the order the sheet shows them. */
export const COMPONENTS = ['qe', 'at', 'as', 'op', 'co', 'me'] as const
export type Component = (typeof COMPONENTS)[number]

/** The three components an instructor can add columns to. */
export const LIST_COMPONENTS = ['qe', 'at', 'as'] as const
export type ListComponent = (typeof LIST_COMPONENTS)[number]

/** The three that are a single score rather than a list of columns. */
export const SINGLE_COMPONENTS = ['op', 'co', 'me'] as const
export type SingleComponent = (typeof SINGLE_COMPONENTS)[number]

export const COMPONENT_NAMES: Record<Component, string> = {
  qe: 'Quizzes & exercises',
  at: 'Attendance',
  as: 'Assignments',
  co: 'Course output',
  op: 'Oral participation',
  me: 'Major exam',
}

export const PERIOD_NAMES: Record<Period, string> = {
  prelim: 'Prelim',
  premid: 'Premid',
  midterm: 'Midterm',
  prefinal: 'Prefinal',
  final: 'Final',
}

/**
 * What one period's sheet is made of: a perfect score per column. The length of
 * each list is the number of columns, which is why an empty class record still
 * knows how many quizzes it is going to have.
 */
export interface PeriodLayout {
  qe: number[]
  at: number[]
  as: number[]
  co: number | null
  op: number | null
  me: number | null
}

export type SheetLayout = Partial<Record<Period, PeriodLayout>>

/** One student's marks for one period. A null cell has not been entered yet. */
export interface RawScores {
  qe: (number | null)[]
  at: (number | null)[]
  as: (number | null)[]
  co: number | null
  op: number | null
  me: number | null
}

/** A program the school offers. Local to this computer; never synced. */
export interface Program {
  id: number
  pgname: string
  abbv: string
  dean: string | null
  created_at: string
  updated_at: string
}

export interface Student {
  id: number
  server_id: number | null
  student_no: string
  last_name: string
  first_name: string
  middle_initial: string | null
  program: string
  year_level: number | null
  contact: string | null
  created_at: string
  updated_at: string
}

export interface ClassRecord {
  id: number
  server_id: number | null
  program: string
  year_level: number
  course_code: string
  course_name: string
  term: number
  school_year_start: number
  school_year_end: number
  schedule: string | null
  instructor_name: string | null
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
  sheet_layout: SheetLayout | null
  created_at: string
  updated_at: string
  synced_at: string | null
}

export interface Enrollment {
  id: number
  server_id: number | null
  class_record_id: number
  student_id: number
  row_order: number | null
  final_grade: number | null
  remarks: Remark | null
  created_at: string
  updated_at: string
}

/** An enrollment with the student it points at, which is how the sheet reads. */
export interface SheetRow extends Enrollment {
  student_no: string
  last_name: string
  first_name: string
  middle_initial: string | null
  program: string
  year_level: number | null
}

export interface PeriodGrade {
  id: number
  server_id: number | null
  enrollment_id: number
  period: Period
  grade: number | null
  is_incomplete: boolean
  raw_scores: RawScores | null
  created_at: string
  updated_at: string
}

export interface InstructorAccount {
  server_id: number | null
  username: string | null
  last_name: string | null
  first_name: string | null
  last_login_at: string | null
}

export interface ServerEndpoint {
  protocol: string
  address: string
  port: string | null
  path: string
  last_sync_at: string | null
}

export type SyncEntity = 'student' | 'class_record' | 'enrollment' | 'period_grade'
export type SyncOperation = 'insert' | 'update' | 'delete'

export interface OutboxEntry {
  id: number
  entity: SyncEntity
  entity_id: number
  operation: SyncOperation
  payload: unknown
  queued_at: string
  attempts: number
  last_error: string | null
}

/** The five period weights, which is what decides whether a period is used. */
export function periodWeight(record: ClassRecord, period: Period): number {
  switch (period) {
    case 'prelim':
      return record.weight_prelim
    case 'premid':
      return record.weight_premid
    case 'midterm':
      return record.weight_midterm
    case 'prefinal':
      return record.weight_prefinal
    case 'final':
      return record.weight_final
  }
}

/** The six percentage shares, which is how much of a period grade each part carries. */
export function componentShare(record: ClassRecord, component: Component): number {
  switch (component) {
    case 'qe':
      return record.pct_quizzes
    case 'at':
      return record.pct_attendance
    case 'as':
      return record.pct_assignment
    case 'co':
      return record.pct_course_output
    case 'op':
      return record.pct_oral
    case 'me':
      return record.pct_major_exam
  }
}

/** The periods this record actually grades — a weight of zero hides a sheet. */
export function activePeriods(record: ClassRecord): Period[] {
  return PERIODS.filter((period) => periodWeight(record, period) > 0)
}
