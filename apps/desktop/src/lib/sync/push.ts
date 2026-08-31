import { post } from '$lib/api/client'
import { dropApplied, markPushed, markSynced, recordFailure, takePending } from '$lib/db'
import type { OutboxEntry } from '$lib/db'

/**
 * Draining the outbox onto the school server.
 *
 * The computer is the source of truth while it is off the network: every edit
 * is queued by a trigger in `sync_outbox`, and this is the one place that
 * empties the queue. Nothing is pulled back — the server holds a copy for the
 * student portal to read, so a push is the whole of the sync.
 *
 * The queue is walked in the order it was written, because the payloads name
 * each other: an enrollment is identified by the class record it belongs to, so
 * the record has to have landed first. Anything the server refuses stays queued
 * with the reason attached, and the run carries on past it rather than handing
 * the same rejection back forever.
 *
 * A push that succeeds on the server but is lost on the way back costs nothing
 * but a repeat: every write over there is an upsert against a natural key.
 */

/** One request's worth. The server refuses more than 500 in a request. */
const BATCH_SIZE = 200

interface PushResponse {
  ok: boolean
  applied: { id: number | null; server_id: number | null }[]
  failed: { id: number | null; error: string }[]
}

export interface PushOutcome {
  /** Entries the server accepted and that have now left the queue. */
  pushed: number
  /** Entries the server refused. They are still queued, with the reason. */
  refused: number
  /** Set when the run stopped early instead of reaching the end of the queue. */
  error: string | null
  /** True when the server could not be reached at all, which is not a fault. */
  offline: boolean
}

export interface Credentials {
  username: string
  password: string
}

export async function pushOutbox(credentials: Credentials): Promise<PushOutcome> {
  let pushed = 0
  let refused = 0
  let afterId = 0
  let reachedServer = false

  for (;;) {
    const batch = await takePending(BATCH_SIZE, afterId)
    if (batch.length === 0) {
      break
    }
    afterId = batch[batch.length - 1].id

    const response = await post<PushResponse>('sync-push.php', {
      username: credentials.username,
      password: credentials.password,
      changes: batch.map(asChange),
    })

    if (!response.ok) {
      // Whatever has already landed stays landed; the rest is still queued and
      // the next attempt starts again from the oldest entry.
      return { pushed, refused, error: response.message, offline: response.reason === 'offline' }
    }

    reachedServer = true
    const queued = new Map(batch.map((entry) => [entry.id, entry]))

    for (const item of response.data.applied ?? []) {
      const entry = item.id === null ? undefined : queued.get(item.id)

      // A delete has no row left to stamp, and the server sends no id for one.
      if (entry && item.server_id !== null && entry.operation !== 'delete') {
        await markPushed(entry.entity, entry.entity_id, item.server_id)
      }
    }

    const applied = (response.data.applied ?? [])
      .map((item) => item.id)
      .filter((id): id is number => id !== null)

    await dropApplied(applied)
    pushed += applied.length

    for (const failure of response.data.failed ?? []) {
      if (failure.id !== null) {
        await recordFailure(failure.id, failure.error)
        refused += 1
      }
    }
  }

  if (reachedServer) {
    await markSynced()
  }

  return { pushed, refused, error: null, offline: false }
}

/** One queued entry, in the shape sync-push.php reads. */
function asChange(entry: OutboxEntry) {
  return {
    id: entry.id,
    entity: entry.entity,
    operation: entry.operation,
    payload: entry.payload,
  }
}
