import { invoke } from '@tauri-apps/api/core'
import { QUICK_TIMEOUT_MS, post } from '$lib/api/client'
import { clearAccount, getAccount, getStoredPasswordHash, saveAccount, touchLogin } from '$lib/db'
import type { InstructorAccount } from '$lib/db'

/**
 * Who is signed in, for this run of the app.
 *
 * Signing in is deliberately required every launch even though the account is
 * cached: the cache exists so the app works without the server, not so it opens
 * straight into someone's records on a laptop left on a desk.
 *
 * There are two ways in, and which one is used depends only on whether the
 * server answers:
 *
 *   * online  — the server checks the password, and the app stores a hash of it
 *               so that next time it can do the same check itself.
 *   * offline — the app checks the password against that stored hash. Only the
 *               account that last signed in on the network can get in this way,
 *               which is the instructor whose records are on the laptop anyway.
 */

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

  get signedIn(): boolean {
    return this.current !== null
  }

  get displayName(): string {
    if (!this.current) {
      return ''
    }
    return `${this.current.firstName} ${this.current.lastName}`.trim()
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
          'The server cannot be reached, and nobody has signed in on this laptop yet. ' +
          'Connect to the school network once to set the account up.',
      }
    }

    if (account.username !== username) {
      return {
        ok: false,
        message: `The server cannot be reached. Only ${account.username} can sign in offline on this laptop.`,
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
    return { ok: true, session: this.current }
  }

  /** The cached account, so the sign-in screen can offer the username back. */
  async remembered(): Promise<InstructorAccount> {
    return getAccount()
  }

  signOut() {
    this.current = null
  }

  /**
   * Forget the account entirely. The records stay: they belong to the laptop,
   * and the next instructor to sign in on the network gets their own.
   */
  async forget() {
    await clearAccount()
    this.current = null
  }
}

export const session = new SessionStore()
