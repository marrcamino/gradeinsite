/**
 * How a class record reads on screen.
 *
 * The list, the form and the printed sheet all name the same course, so the
 * wording lives here rather than being spelled slightly differently on each.
 */

export function termName(term: number): string {
  return term === 1 ? '1st Semester' : '2nd Semester'
}

export function schoolYear(record: { school_year_start: number; school_year_end: number }): string {
  return `${record.school_year_start}\u2013${record.school_year_end}`
}

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th']

export function yearLevelName(level: number): string {
  return `${ORDINALS[level] ?? level} Year`
}
