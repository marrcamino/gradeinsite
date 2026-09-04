import { post, type ApiResult } from './client'

/**
 * Student things that only the server can answer.
 *
 * The portal password is the one fact about a student that lives on the server
 * and nowhere else: the desktop syncs a student's name and program up, but
 * never their password, because the student sets it themselves on the portal.
 * So clearing it has to be a request rather than a local write, and it needs
 * the network.
 */

export interface ResetPortalPassword {
  ok: boolean
  student_no: string
  name: string
  /** False when the account had no password to clear — already claimable. */
  was_set: boolean
}

/**
 * Let a student claim their portal account again.
 *
 * This does not issue a password. It puts the account back to the state it
 * arrives in from a sync — no password set — so the student sets a new one on
 * the portal with their ID number and last name, the same screen they used the
 * first time. Nothing has to be read out or written down.
 */
export function resetPortalPassword(
  credentials: { username: string; password: string },
  studentNo: string
): Promise<ApiResult<ResetPortalPassword>> {
  return post<ResetPortalPassword>('student-reset-password.php', {
    ...credentials,
    student_no: studentNo,
  })
}
