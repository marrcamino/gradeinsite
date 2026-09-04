import { browser } from '$app/environment'
import { invoke } from '@tauri-apps/api/core'
import { QUICK_TIMEOUT_MS, post } from '$lib/api/client'
import { clearAccount, getAccount, getStoredPasswordHash, saveAccount, touchLogin } from '$lib/db'
import type { InstructorAccount } from '$lib/db'

/**
 * Who is signed in, for this run of the app.
 *
 * Signing in is required once per launch even though the account is cached: the
 * cache exists so the app works without the server, not so it opens straight
 * into someone's records on a computer left on a desk. It is not required again
 * for a reload, though — a reload is the same run of the app, and losing the
 * screen you were on because the webview restarted is a bug, not a lock.
 *
 * There are two ways in, and which one is used depends only on whether the
 * server answers:
 *
 *   * online  — the server checks the password, and the app stores a hash of it
 *               so that next time it can do the same check itself.
 *   * offline — the app checks the password against that stored hash. Only the
 *               account that last signed in on the network can get in this way,
 *               which is the instructor whose records are on it anyway.
 */

/**
 * Where the session survives a reload.
 *
 * `sessionStorage` — not `localStorage` — is what draws the line the app wants.
 * It is scoped to the life of the webview: a reload keeps it, closing the
 * window empties it. That is exactly "stay signed in until the app is closed",
 * without the app having to guess when a run ended.
 *
 * The password goes in beside the identity, under its own key, because
 * `sync-push.php` asks for it on every push and the instructor should type it
 * once when the app opens and not again. Keeping it only in memory was the
 * first attempt and it did not survive a reload, which put a password prompt in
 * front of a routine sync. The hash stays in SQLite, where the offline sign-in
 * reads it; this copy is the plain password, and it is gone the moment the
 * window closes.
 */
const SESSION_KEY = 'gradeinsite:session'
const PASSWORD_KEY = 'gradeinsite:password'

export interface Session {
  serverId: number | null
  username: string
  lastName: string
  firstName: string
  /** False when the server was not reachable and the cached hash let them in. */
  online: boolean
}

/** An instructor as the server names one, in a sign-in or a registration reply. */
interface Instructor {
  id: number
  username: string
  last_name: string
  first_name: string
}

interface InstructorResponse {
  ok: boolean
  instructor: Instructor
}

export type SignInResult = { ok: true; session: Session } | { ok: false; message: string }

/** The four things an instructor types to open an account. */
export interface NewAccount {
  username: string
  password: string
  lastName: string
  firstName: string
}

/**
 * Registering fails in one way the screen has to act on rather than only
 * report. Once the school has instructors, the server will not open another
 * account for whoever asks — an existing one has to sign the request — so a
 * refusal for that reason asks the screen for those credentials instead of
 * stopping.
 */
export type RegisterResult =
  | { ok: true; session: Session }
  | { ok: false; message: string; needsAuthorisation: boolean }

/** The server's own minimum, said here so the form can ask for it up front. */
export const MIN_PASSWORD_LENGTH = 8

class SessionStore {
  current = $state<Session | null>(null)

  /**
   * The password, kept for as long as the app is open.
   *
   * `sync-push.php` authenticates every request the way the sign-in did, with a
   * username and a password, and the queue is drained often enough that asking
   * for it each time would be in the instructor's way all day. So it is typed
   * once, at sign-in, and held here and in `sessionStorage` — see the note on
   * `PASSWORD_KEY` — until the window closes. SQLite still only ever holds the
   * hash, which is what the offline sign-in checks against.
   */
  #password: string | null = null

  get signedIn(): boolean {
    return this.current !== null
  }

  /** What a sync needs to authenticate, or null if the password is not held. */
  get credentials(): { username: string; password: string } | null {
    if (!this.current || !this.#password) {
      return null
    }
    return { username: this.current.username, password: this.#password }
  }

  /**
   * Hand back a password the instructor re-entered, once the server has taken
   * it. Only the sync does this, and only when the password is missing — an
   * account set up before the app kept one, say.
   */
  holdPassword(password: string) {
    this.#password = password
    this.remember()
  }

  get displayName(): string {
    if (!this.current) {
      return ''
    }
    return `${this.current.firstName} ${this.current.lastName}`.trim()
  }

  /**
   * Pick the session back up after a reload, and hand it to whoever asked.
   *
   * The root layout's `load` calls this before the first screen renders, so a
   * refresh lands on the records again rather than flashing the sign-in form
   * and navigating away from it. An already-restored session is returned as it
   * is: this runs once per launch, but re-running it must not undo a sign-out.
   */
  restore(): Session | null {
    if (this.current || !browser) {
      return this.current
    }

    const stored = sessionStorage.getItem(SESSION_KEY)
    if (!stored) {
      return null
    }

    try {
      this.current = JSON.parse(stored) as Session
      this.#password = sessionStorage.getItem(PASSWORD_KEY)
    } catch {
      // Nothing readable is worth keeping; make them sign in again.
      sessionStorage.removeItem(SESSION_KEY)
    }

    return this.current
  }

  /** Write the current session where a reload will find it. */
  private remember() {
    if (browser && this.current) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.current))

      if (this.#password) {
        sessionStorage.setItem(PASSWORD_KEY, this.#password)
      }
    }
  }

  /**
   * `onStage` lets the screen say which of the two ways in is being tried. The
   * offline fallback only starts after the server has failed to answer, so
   * without it the button sits on "Signing in" through a timeout.
   */
  async signIn(
    username: string,
    password: string,
    onStage?: (stage: 'server' | 'local') => void
  ): Promise<SignInResult> {
    const trimmed = username.trim()

    if (!trimmed || !password) {
      return { ok: false, message: 'Enter your username and password.' }
    }

    onStage?.('server')
    const response = await post<InstructorResponse>(
      'instructor-login.php',
      { username: trimmed, password },
      QUICK_TIMEOUT_MS
    )

    if (response.ok) {
      return { ok: true, session: await this.#adopt(response.data.instructor, password) }
    }

    // The server answered and said no. Falling back to the cached hash here
    // would let a changed password keep working, so it does not happen.
    if (response.reason === 'rejected') {
      return { ok: false, message: response.message }
    }

    onStage?.('local')
    return this.signInOffline(trimmed, password)
  }

  private async signInOffline(username: string, password: string): Promise<SignInResult> {
    const account = await getAccount()
    const stored = await getStoredPasswordHash()

    if (!account.username || !stored?.password_hash) {
      return {
        ok: false,
        message:
          'The server cannot be reached, and nobody has signed in on this computer yet. ' +
          'Connect to the school network once to set the account up.',
      }
    }

    if (account.username !== username) {
      return {
        ok: false,
        message: `The server cannot be reached. Only ${account.username} can sign in offline on this computer.`,
      }
    }

    const matches = await invoke<boolean>('verify_password', {
      password,
      hash: stored.password_hash,
    })

    if (!matches) {
      return { ok: false, message: 'Wrong password.' }
    }

    await touchLogin()

    this.current = {
      serverId: account.server_id,
      username: account.username,
      lastName: account.last_name ?? '',
      firstName: account.first_name ?? '',
      online: false,
    }
    // The password was checked against this computer's own hash rather than the
    // server's, but it is the same password the server will ask for when the
    // wi-fi comes back, so the sync can use it without a prompt.
    this.#password = password
    this.remember()
    return { ok: true, session: this.current }
  }

  /**
   * Take on an account the server has just confirmed.
   *
   * Signing in and creating an account end in the same place: the server has
   * said who this is, so the app caches the account, hashes the password for
   * the next sign-in with no wi-fi, and holds the password for the sync.
   */
  async #adopt(instructor: Instructor, password: string): Promise<Session> {
    const hash = await invoke<string>('hash_password', { password })

    await saveAccount(
      instructor.id,
      instructor.username,
      hash,
      instructor.last_name,
      instructor.first_name
    )

    this.current = {
      serverId: instructor.id,
      username: instructor.username,
      lastName: instructor.last_name,
      firstName: instructor.first_name,
      online: true,
    }
    this.#password = password
    this.remember()

    return this.current
  }

  /**
   * Open a new instructor account, and sign in as it.
   *
   * This only works on the school network. An account lives on the server —
   * it is what stamps every record the computer pushes up — so there is no
   * offline version of it the way there is for signing in.
   *
   * `authorisedBy` is the credentials of an instructor who already has an
   * account. The server asks for them only once the school has instructors to
   * ask: the very first account on a fresh server is opened without them,
   * because there is nobody left to sign it. The screen therefore sends none
   * to begin with and only collects them if the server says it needs them.
   */
  async register(
    account: NewAccount,
    authorisedBy?: { username: string; password: string }
  ): Promise<RegisterResult> {
    const username = account.username.trim()
    const lastName = account.lastName.trim()
    const firstName = account.firstName.trim()

    if (!username || !lastName || !firstName) {
      return {
        ok: false,
        message: 'Enter a username, a first name and a last name.',
        needsAuthorisation: false,
      }
    }
    if (account.password.length < MIN_PASSWORD_LENGTH) {
      return {
        ok: false,
        message: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
        needsAuthorisation: false,
      }
    }

    const response = await post<InstructorResponse>('instructor-register.php', {
      ...(authorisedBy ?? {}),
      account: {
        username,
        password: account.password,
        last_name: lastName,
        first_name: firstName,
      },
    })

    if (response.ok) {
      return { ok: true, session: await this.#adopt(response.data.instructor, account.password) }
    }

    if (response.reason === 'offline') {
      return {
        ok: false,
        message:
          'An account is made on the school server, so this needs the school network. ' +
          'Connect to it and try again.',
        needsAuthorisation: false,
      }
    }

    // 401 is the server saying this school already has instructors, so one of
    // them has to sign the request. Everything else — a taken username, a
    // missing name — is something to fix in the form and send again.
    return {
      ok: false,
      message: response.message,
      needsAuthorisation: response.status === 401,
    }
  }

  /**
   * Set a new password for an instructor who has forgotten theirs.
   *
   * The 2024 sign-in screen carried a "Forgot password?" link that went
   * nowhere. This is it, and it is approved the way a new account is: by a
   * colleague who already has one, because a school network has no email to
   * send a reset link over.
   *
   * On success it signs the account in. The person at the computer is the one
   * whose password it now is, and sending them back to type it again on the
   * screen behind would be a step for nothing.
   */
  async resetPassword(
    username: string,
    newPassword: string,
    approvedBy: { username: string; password: string }
  ): Promise<SignInResult> {
    const trimmed = username.trim()

    if (!trimmed) {
      return { ok: false, message: 'Enter the username of the account to reset.' }
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return {
        ok: false,
        message: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
      }
    }
    if (!approvedBy.username.trim() || !approvedBy.password) {
      return {
        ok: false,
        message: 'An instructor who already has an account has to approve this.',
      }
    }

    const response = await post<InstructorResponse>('instructor-reset-password.php', {
      username: approvedBy.username.trim(),
      password: approvedBy.password,
      account: { username: trimmed, password: newPassword },
    })

    if (response.ok) {
      return { ok: true, session: await this.#adopt(response.data.instructor, newPassword) }
    }

    if (response.reason === 'offline') {
      return {
        ok: false,
        message:
          'A password is kept on the school server, so this needs the school network. ' +
          'Connect to it and try again.',
      }
    }

    return { ok: false, message: response.message }
  }

  /** The cached account, so the sign-in screen can offer the username back. */
  async remembered(): Promise<InstructorAccount> {
    return getAccount()
  }

  signOut() {
    this.current = null
    this.#password = null
    if (browser) {
      sessionStorage.removeItem(SESSION_KEY)
      sessionStorage.removeItem(PASSWORD_KEY)
    }
  }

  /**
   * Forget the account entirely. The records stay: they belong to the computer,
   * and the next instructor to sign in on the network gets their own.
   */
  async forget() {
    await clearAccount()
    this.signOut()
  }
}

export const session = new SessionStore()
