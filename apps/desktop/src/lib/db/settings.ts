import { NOW, row, run } from './connection'
import type { InstructorAccount, ServerEndpoint } from './types'

/**
 * The two single-row tables that belong to this computer and are never synced.
 *
 * Both are seeded by the migration, so there is always a row to UPDATE and no
 * screen needs a first-run special case.
 */

export async function getAccount(): Promise<InstructorAccount> {
  const found = await row<InstructorAccount>(
    `SELECT server_id, username, last_name, first_name, last_login_at
       FROM instructor_account WHERE id = 1`
  )
  return (
    found ?? {
      server_id: null,
      username: null,
      last_name: null,
      first_name: null,
      last_login_at: null,
    }
  )
}

/**
 * Remember who signed in, and the hash of the password they used.
 *
 * The hash is kept so the app can check a password again while offline, which
 * is the whole point: the instructor is on a bus with no wi-fi and still has to
 * get into their own records. It is a bcrypt hash from the server, never the
 * password itself.
 */
export function saveAccount(
  serverId: number,
  username: string,
  passwordHash: string,
  lastName: string,
  firstName: string
): Promise<number> {
  return run(
    `UPDATE instructor_account
        SET server_id     = $1,
            username      = $2,
            password_hash = $3,
            last_name     = $4,
            first_name    = $5,
            last_login_at = ${NOW}
      WHERE id = 1`,
    [serverId, username, passwordHash, lastName, firstName]
  )
}

export function touchLogin(): Promise<number> {
  return run(`UPDATE instructor_account SET last_login_at = ${NOW} WHERE id = 1`)
}

export function getStoredPasswordHash(): Promise<{ password_hash: string | null } | null> {
  return row<{ password_hash: string | null }>(
    'SELECT password_hash FROM instructor_account WHERE id = 1'
  )
}

/** Signing out forgets the account but keeps the records on the computer. */
export function clearAccount(): Promise<number> {
  return run(
    `UPDATE instructor_account
        SET server_id = NULL, username = NULL, password_hash = NULL,
            last_name = NULL, first_name = NULL
      WHERE id = 1`
  )
}

export async function getEndpoint(): Promise<ServerEndpoint> {
  const found = await row<ServerEndpoint>(
    `SELECT protocol, address, port, path, last_sync_at
       FROM server_endpoint WHERE id = 1`
  )
  return (
    found ?? {
      protocol: 'http://',
      address: '192.168.0.1',
      port: null,
      path: 'gradeinsite/',
      last_sync_at: null,
    }
  )
}

export function saveEndpoint(
  protocol: string,
  address: string,
  port: string | null,
  path: string
): Promise<number> {
  return run(
    `UPDATE server_endpoint
        SET protocol = $1, address = $2, port = $3, path = $4
      WHERE id = 1`,
    [protocol, address.trim(), port?.trim() || null, path.trim()]
  )
}

export function markSynced(): Promise<number> {
  return run(`UPDATE server_endpoint SET last_sync_at = ${NOW} WHERE id = 1`)
}

/**
 * Build the base URL of the API from the parts the user configured.
 *
 * This is the reason the app has no hardcoded address. The 2024 build fetched
 * `http://192.168.254.109/...` compiled in, which meant a new server, a new
 * router or a new subnet needed a new build.
 */
export function endpointUrl(endpoint: ServerEndpoint): string {
  const host = endpoint.port ? `${endpoint.address}:${endpoint.port}` : endpoint.address
  const path = endpoint.path.replace(/^\/+/, '').replace(/\/*$/, '/')

  return `${endpoint.protocol}${host}/${path}`
}
