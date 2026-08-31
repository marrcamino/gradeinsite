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

interface LoginResponse {
  ok: boolean
  instructor: {
    id: number
    username: string
    last_name: string
    first_name: string
  }
}

export type SignInResult = { ok: true; session: Session } | { ok: false; message: string }

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
    const response = await post<LoginResponse>(
      'instructor-login.php',
      { username: trimmed, password },
      QUICK_TIMEOUT_MS
    )

    if (response.ok) {
      const instructor = response.data.instructor
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
      return { ok: true, session: this.current }
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
