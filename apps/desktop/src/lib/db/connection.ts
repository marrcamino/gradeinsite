import Database from '@tauri-apps/plugin-sql'

/**
 * The one handle onto the local database.
 *
 * `Database.load` is resolved once and the promise itself is cached, so callers
 * racing on the first screen all wait on the same load rather than opening the
 * file several times. The schema has already run by the time this resolves:
 * the Rust side lists this database in `tauri.conf.json` under `sql.preload`,
 * so its migrations are applied while the window is still opening.
 */
const DB_URL = 'sqlite:gradeinsite.db'

let handle: Promise<Database> | null = null

export function db(): Promise<Database> {
  handle ??= Database.load(DB_URL)
  return handle
}

/**
 * The timestamp every UPDATE has to write.
 *
 * `updated_at` is not maintained by a trigger. A trigger would have to UPDATE
 * the row that fired it, and SQLite runs that nested write back through the
 * outbox triggers, which would then queue every edit twice. So each statement
 * below names the column itself — see the note in the schema file.
 */
export const NOW = "strftime('%Y-%m-%d %H:%M:%f','now')"

/** Run a statement. Returns how many rows it touched. */
export async function run(sql: string, params: unknown[] = []): Promise<number> {
  const result = await (await db()).execute(sql, params)
  return result.rowsAffected
}

/** Run an INSERT and return the id of the row it created. */
export async function insert(sql: string, params: unknown[] = []): Promise<number> {
  const result = await (await db()).execute(sql, params)
  return result.lastInsertId ?? 0
}

/** Run a query and return every row. */
export async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db()).select<T[]>(sql, params)
}

/** Run a query that should match at most one row. */
export async function row<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const found = await rows<T>(sql, params)
  return found[0] ?? null
}

/**
 * SQLite has no boolean, so a flag arrives as 0 or 1 and has to go back the
 * same way. Doing it in one place keeps the conversion out of every caller.
 */
export function toFlag(value: boolean): number {
  return value ? 1 : 0
}

export function fromFlag(value: number | boolean | null): boolean {
  return value === 1 || value === true
}

/**
 * A JSON column. These are TEXT down here and JSON on the server; the outbox
 * triggers re-embed them with SQLite's json() on the way out, so what is stored
 * has to be valid JSON rather than a quoted string.
 */
export function encodeJson(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value)
}

export function decodeJson<T>(value: string | null): T | null {
  if (value === null || value === '') {
    return null
  }
  try {
    return JSON.parse(value) as T
  } catch {
    // A row that cannot be parsed is a row the app should not crash on. The
    // sheet treats a missing layout as "not set up yet", which is recoverable.
    return null
  }
}
