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

/**
 * A time the database wrote, in the instructor's own clock.
 *
 * SQLite stores these as `strftime('%Y-%m-%d %H:%M:%f','now')`, which is UTC
 * written with a space instead of a `T` and with no zone on the end. JavaScript
 * reads a string in that shape as local time, so on a laptop in Manila a sync
 * from a moment ago would be shown as eight hours old. Putting the `T` and the
 * `Z` back is what makes it read as the instant it actually is.
 */
export function whenLocal(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  const at = new Date(`${value.replace(' ', 'T')}Z`)
  if (Number.isNaN(at.getTime())) {
    return ''
  }

  return at.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

/** "Dela Pena, Jose R." — how a name is written on a class record. */
export function studentName(student: {
  last_name: string
  first_name: string
  middle_initial?: string | null
}): string {
  const initial = student.middle_initial?.trim()
  return `${student.last_name}, ${student.first_name}${initial ? ` ${initial}.` : ''}`
}
