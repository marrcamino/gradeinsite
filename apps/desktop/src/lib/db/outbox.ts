import { NOW, decodeJson, row, rows, run } from './connection'
import type { OutboxEntry, SyncEntity } from './types'

/**
 * The queue of changes the school server has not seen.
 *
 * Nothing here writes to it — the outbox triggers in the schema do that, inside
 * the same statement as the change itself, so an entry cannot go missing and no
 * screen has to remember to add one. This module only reads the queue, and
 * clears entries the server has confirmed.
 */

interface OutboxRow extends Omit<OutboxEntry, 'payload'> {
  payload: string
}

function hydrate(entry: OutboxRow): OutboxEntry {
  return { ...entry, payload: decodeJson<unknown>(entry.payload) }
}

export async function pendingCount(): Promise<number> {
  const found = await row<{ pending: number }>('SELECT COUNT(*) AS pending FROM sync_outbox')
  return found?.pending ?? 0
}

/**
 * The next batch to push, oldest first.
 *
 * Order matters: a class record has to reach the server before the enrollments
 * that name it, and the queue is already in the order the edits happened.
 *
 * `afterId` is how one push walks the whole queue. A refused entry stays where
 * it is, so a loop that always asked for the oldest batch would hand the server
 * the same rejection forever; carrying on past the last id seen means a run
 * visits every entry once and stops.
 */
export async function takePending(limit = 200, afterId = 0): Promise<OutboxEntry[]> {
  const found = await rows<OutboxRow>(
    `SELECT id, entity, entity_id, operation, payload, queued_at, attempts, last_error
       FROM sync_outbox
      WHERE id > $1
      ORDER BY id
      LIMIT $2`,
    [afterId, limit]
  )
  return found.map(hydrate)
}

/** Drop the entries the server confirmed. Anything left is still owed. */
export async function dropApplied(ids: number[]): Promise<void> {
  for (const id of ids) {
    await run('DELETE FROM sync_outbox WHERE id = $1', [id])
  }
}

const SYNCED_TABLE: Record<SyncEntity, string> = {
  student: 'students',
  class_record: 'class_records',
  enrollment: 'enrollments',
  period_grade: 'period_grades',
}

/**
 * Write the server's id back onto the local row the server just accepted.
 *
 * Knowing it is what lets a later screen tell a row the server has seen from
 * one it has not. The two shapes of this statement are both careful not to
 * queue themselves: the outbox triggers skip an UPDATE that changes
 * `server_id` (or, on a class record, `synced_at`), and the `IS NOT` keeps a
 * re-push of an unchanged row from touching the row at all.
 */
export async function markPushed(
  entity: SyncEntity,
  entityId: number,
  serverId: number
): Promise<void> {
  if (entity === 'class_record') {
    await run(
      `UPDATE class_records SET server_id = $1, synced_at = ${NOW} WHERE id = $2`,
      [serverId, entityId]
    )
    return
  }

  await run(
    `UPDATE ${SYNCED_TABLE[entity]} SET server_id = $1 WHERE id = $2 AND server_id IS NOT $1`,
    [serverId, entityId]
  )
}

/**
 * Keep a rejected entry, with the reason.
 *
 * A rejection is usually a real problem with the row rather than a network
 * blip, so it stays in the queue and stays visible: the count in the corner of
 * the app does not go down until the instructor has dealt with it.
 */
export async function recordFailure(id: number, error: string): Promise<void> {
  await run(
    'UPDATE sync_outbox SET attempts = attempts + 1, last_error = $1 WHERE id = $2',
    [error, id]
  )
}

/** Entries that have been refused at least once, for the sync screen to show. */
export async function listFailures(): Promise<OutboxEntry[]> {
  const found = await rows<OutboxRow>(
    `SELECT id, entity, entity_id, operation, payload, queued_at, attempts, last_error
       FROM sync_outbox
      WHERE attempts > 0
      ORDER BY id`
  )
  return found.map(hydrate)
}
