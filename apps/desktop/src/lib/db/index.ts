/**
 * The local database, as the rest of the app sees it.
 *
 * Screens import from here rather than reaching for the SQL modules directly,
 * so the statements stay in one place and the schema stays swappable under them.
 */

export * from './types'
export { db, NOW } from './connection'
export * from './programs'
export * from './students'
export * from './records'
export * from './sheet'
export * from './settings'
export * from './outbox'
