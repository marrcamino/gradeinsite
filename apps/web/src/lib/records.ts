import { apiGet, type ApiResult } from './api'

/**
 * The two grade screens' data.
 *
 * Nothing here computes anything. The desktop app works the grades out from the
 * marks and pushes the results up, so the portal's job is to display the number
 * the instructor's sheet arrived at - not to arrive at it a second time and
 * risk showing a student something their printed record disagrees with.
 */

/** The five grading periods, in the order a term runs. */
export type Period = 'prelim' | 'premid' | 'midterm' | 'prefinal' | 'final'

export type Remark = 'PASSED' | 'FAILED' | 'INC' | 'DROPPED'

/** One row of the course list. */
export interface CourseSummary {
  id: number
  course_code: string
  course_name: string
  term: number
  school_year_start: number
  school_year_end: number
  schedule: string | null
  instructor_name: string | null
  final_grade: number | null
  remarks: Remark | null
}

export interface PeriodGrade {
  period: Period
  weight: number
  /** Null when the instructor has not marked this period yet. */
  grade: number | null
  /** Marked, but with scores still missing - the 2024 "lack" flag. */
  is_incomplete: boolean
}

export interface CourseDetail {
  id: number
  course_code: string
  course_name: string
  term: number
  school_year_start: number
  school_year_end: number
  schedule: string | null
  instructor_name: string | null
  weights: Record<Period, number>
  distribution: {
    quizzes: number
    attendance: number
    assignment: number
    course_output: number
    oral: number
    major_exam: number
  }
}

interface RecordsResponse {
  ok: boolean
  records: CourseSummary[]
}

interface RecordResponse {
  ok: boolean
  record: CourseDetail
  periods: PeriodGrade[]
  final_grade: number | null
  remarks: Remark | null
}

export function fetchCourses(): Promise<ApiResult<RecordsResponse>> {
  return apiGet<RecordsResponse>('student-records.php')
}

export function fetchCourse(recordId: number): Promise<ApiResult<RecordResponse>> {
  return apiGet<RecordResponse>(`student-record.php?record_id=${recordId}`)
}

// --- Saying it the way the sheet says it -----------------------------------

/** The 2024 sheet's own names for the periods. */
export const PERIOD_LABELS: Record<Period, string> = {
  prelim: 'Prelim',
  premid: 'Premid',
  midterm: 'Midterm',
  prefinal: 'Prefinal',
  final: 'Final',
}

/** The GRADE COMPONENTS table lists every period, used or not. */
export const PERIOD_ORDER: Period[] = ['prelim', 'premid', 'midterm', 'prefinal', 'final']

/** The PERCENTAGE DISTRIBUTION table, labelled as the 2024 screen labelled it. */
export const DISTRIBUTION_ROWS = [
  { key: 'quizzes', label: 'QUIZZES / EXERCISES' },
  { key: 'attendance', label: 'ATTENDANCE' },
  { key: 'assignment', label: 'ASSIGNMENT' },
  { key: 'course_output', label: 'COURSE OUTPUT / PROJECT' },
  { key: 'oral', label: 'ORAL PARTICIPATION' },
  { key: 'major_exam', label: 'MAJOR EXAM' },
] as const

/** Two decimal places, the precision the printed sheet has always shown. */
export function formatGrade(value: number | null): string {
  return value === null ? '—' : value.toFixed(2)
}

/** Percentages are whole numbers in practice, so trailing zeroes are noise. */
export function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(2)}%`
}

export function formatTerm(term: number): string {
  return term === 1 ? 'First Semester' : 'Second Semester'
}

export function formatSchoolYear(course: {
  school_year_start: number
  school_year_end: number
}): string {
  return `${course.school_year_start}-${course.school_year_end}`
}

/** Which badge a remark wears. A term still being marked has no remark at all. */
export function remarkClass(remarks: Remark | null): string {
  switch (remarks) {
    case 'PASSED':
      return 'badge badge-success'
    case 'FAILED':
      return 'badge badge-danger'
    case 'INC':
      return 'badge badge-warning'
    case 'DROPPED':
      return 'badge badge-neutral'
    default:
      return 'badge badge-neutral'
  }
}
