import { apiGet, apiPost } from './api'

/**
 * Who is signed in to the portal.
 *
 * Nothing is kept in the browser. The desktop app caches its account because it
 * has to work with the server switched off; the portal is the opposite - it is
 * useless without the server, so the PHP session cookie is the whole story and
 * `restore()` just asks the server who the cookie belongs to.
 *
 * That is also the fix for a 2024 bug. The old portal put the student's id in
 * `localStorage` and sent it up with every request, so the id it asked with was
 * an id the student could edit. Here the browser holds a cookie it cannot read
 * and the server decides what that cookie means.
 */

export interface Student {
  id: number
  student_no: string
  last_name: string
  first_name: string
  middle_initial: string | null
  program: string
  year_level: number | null
}

interface StudentResponse {
  ok: boolean
  student: Student
}

export type SignInResult =
  | { ok: true }
  /** The account is real but has never been claimed; go and set a password. */
  | { ok: false; needsPassword: true }
  | { ok: false; needsPassword: false; message: string }

/**
 * Claiming has no "go and set a password" case - it *is* that case - so it
 * returns its own narrower type rather than a SignInResult the caller would
 * have to rule that out of.
 */
export type ClaimResult = { ok: true } | { ok: false; message: string }

class StudentSession {
  current = $state<Student | null>(null)

  /** True until the first `restore()` settles, so no screen flashes before it. */
  loading = $state(true)

  get signedIn(): boolean {
    return this.current !== null
  }

  get displayName(): string {
    if (!this.current) {
      return ''
    }
    return `${this.current.first_name} ${this.current.last_name}`.trim()
  }

  /**
   * Ask the server who the session cookie belongs to.
   *
   * Runs once when the app mounts. A student who reloads, or comes back to a
   * tab left open, lands on their grades instead of the sign-in screen. A 401
   * is the ordinary answer for a visitor who is not signed in, not an error.
   */
  async restore(): Promise<void> {
    const result = await apiGet<StudentResponse>('student-session.php')

    this.current = result.ok ? result.data.student : null
    this.loading = false
  }

  async signIn(studentNo: string, password: string): Promise<SignInResult> {
    const trimmed = studentNo.trim()

    if (!trimmed || !password) {
      return { ok: false, needsPassword: false, message: 'Enter your ID number and password.' }
    }

    const result = await apiPost<StudentResponse>('student-login.php', {
      student_no: trimmed,
      password,
    })

    if (result.ok) {
      this.current = result.data.student
      return { ok: true }
    }

    if (result.reason === 'password_not_set') {
      return { ok: false, needsPassword: true }
    }

    return { ok: false, needsPassword: false, message: result.message }
  }

  /**
   * Set the password on an account that has never had one.
   *
   * The last name is asked for because the ID number alone is not a secret - a
   * class list has every one of them on it. See apps/api/student-set-password.php
   * for why that is the bar, and what would replace it.
   *
   * Succeeding signs the student straight in, so they do not have to type the
   * password they just chose a second time.
   */
  async claim(studentNo: string, lastName: string, password: string): Promise<ClaimResult> {
    const trimmedNo = studentNo.trim()
    const trimmedName = lastName.trim()

    if (!trimmedNo || !trimmedName || !password) {
      return { ok: false, message: 'Enter your ID number, last name and a new password.' }
    }

    const result = await apiPost<StudentResponse>('student-set-password.php', {
      student_no: trimmedNo,
      last_name: trimmedName,
      password,
    })

    if (result.ok) {
      this.current = result.data.student
      return { ok: true }
    }

    return { ok: false, message: result.message }
  }

  /**
   * Sign out, and clear the student either way.
   *
   * A failed request here would most likely be the server being unreachable,
   * and leaving somebody signed in on a shared machine because the wi-fi
   * dropped is the wrong way to fail.
   */
  async signOut(): Promise<void> {
    await apiPost('student-logout.php', {})
    this.current = null
  }
}

export const session = new StudentSession()
