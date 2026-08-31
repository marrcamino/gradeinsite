<script lang="ts">
  import { listFailures, pendingCount } from '$lib/db'
  import type { OutboxEntry } from '$lib/db'
  import { session } from '$lib/session.svelte'
  import { pushOutbox } from '$lib/sync/push'
  import type { PushOutcome } from '$lib/sync/push'

  // Sending the queue to the school server, from the one place it makes sense
  // to put it: next to the offline badge, where the instructor already looks to
  // see whether the laptop is on the network.
  //
  // The count is what makes the feature honest. Every edit queues an entry, so
  // a number sitting in the header is the plain truth about how much of the
  // laptop's work the server has not seen — and it only reaches zero after a
  // sync the server accepted.
  //
  // One click does it. The dialogue is not a step on the way; it opens only
  // when there is something the instructor has to read or answer — a password
  // the app does not have, a server that would not answer, or rows the server
  // would not take. A sync that works says so in the header and gets out of the
  // way.

  let dialog = $state<HTMLDialogElement>()
  let pending = $state(0)
  let running = $state(false)
  let outcome = $state<PushOutcome | null>(null)
  let failures = $state<OutboxEntry[]>([])
  let password = $state('')
  let flash = $state<string | null>(null)
  let flashTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * The count goes stale as soon as the instructor types a grade, and nothing
   * tells this component about that, so it asks. It is a COUNT over a table
   * that is empty most of the time.
   */
  $effect(() => {
    refresh()
    const timer = setInterval(refresh, 10_000)
    return () => clearInterval(timer)
  })

  async function refresh() {
    pending = await pendingCount()
    failures = await listFailures()
  }

  /** The header button. Syncs straight away unless it has to ask something. */
  async function sync() {
    if (running) {
      return
    }

    const credentials = session.credentials
    if (!credentials) {
      outcome = null
      password = ''
      dialog?.showModal()
      return
    }

    await send(credentials)
  }

  /** The dialogue's button, which is only ever reached with a typed password. */
  async function syncWithTypedPassword(event: SubmitEvent) {
    event.preventDefault()

    if (running || !session.current || !password) {
      return
    }

    await send({ username: session.current.username, password })
  }

  async function send(credentials: { username: string; password: string }) {
    running = true
    outcome = null
    say(null)

    const result = await pushOutbox(credentials)

    running = false
    outcome = result
    await refresh()

    if (result.error !== null) {
      // Whatever went wrong is worth reading, and a refused request is almost
      // always the password — a complaint about one row comes back separately.
      dialog?.showModal()
      return
    }

    // A sync the server took proves the password, so keep it and stop asking.
    session.holdPassword(credentials.password)
    password = ''

    if (result.refused > 0) {
      dialog?.showModal()
      return
    }

    dialog?.close()
    say(result.pushed === 0 ? 'Up to date' : `Sent ${result.pushed}`)
  }

  function say(message: string | null) {
    flash = message
    if (flashTimer) {
      clearTimeout(flashTimer)
    }
    if (message) {
      flashTimer = setTimeout(() => (flash = null), 4000)
    }
  }

  // The queue's own words for a change are the database's — "period_grade",
  // "insert" — and an instructor should not have to read those to find out what
  // the server would not take.
  const THING: Record<OutboxEntry['entity'], string> = {
    student: 'a student',
    class_record: 'a class record',
    enrollment: 'a name on a class list',
    period_grade: 'a grade',
  }

  const DID: Record<OutboxEntry['operation'], string> = {
    insert: 'added',
    update: 'changed',
    delete: 'removed',
  }

  function describe(entry: OutboxEntry): string {
    return `${THING[entry.entity]} you ${DID[entry.operation]}`
  }
</script>

{#if flash}
  <span class="hint">{flash}</span>
{/if}

<button
  type="button"
  onclick={sync}
  disabled={running}
  class="btn btn-sm btn-ghost"
  title="Send this laptop's work to the school server"
>
  {running ? 'Syncing…' : 'Sync'}
  {#if pending > 0 && !running}
    <span class="badge {failures.length > 0 ? 'badge-danger' : 'badge-accent'}">{pending}</span>
  {/if}
</button>

<dialog bind:this={dialog} class="dialog" aria-labelledby="sync-title">
  <div class="card-header">
    <h3 id="sync-title" class="card-title">Sync to the school server</h3>
    <p class="hint">
      {#if pending === 0}
        The server has everything on this laptop.
      {:else}
        {pending}
        {pending === 1 ? 'change is' : 'changes are'} waiting to be sent. They stay on this laptop
        until the server confirms them, so nothing is lost by trying while the wi-fi is down.
      {/if}
    </p>
  </div>

  <form onsubmit={syncWithTypedPassword}>
    <div class="card-body space-y-3">
      {#if outcome}
        {#if outcome.error && outcome.offline}
          <p class="alert alert-warning">{outcome.error}</p>
        {:else if outcome.error}
          <p class="alert alert-error">{outcome.error}</p>
        {:else if outcome.refused > 0}
          <p class="alert alert-warning">
            Sent {outcome.pushed}. The server did not accept {outcome.refused}.
          </p>
        {/if}
      {/if}

      <div class="space-y-1">
        <label class="label" for="sync-password">Password</label>
        <input
          id="sync-password"
          type="password"
          bind:value={password}
          autocomplete="current-password"
          class="input input-sm"
        />
        <p class="hint">
          The server asks for it before it takes anything. It is the one you signed in with, and
          this only appears when the app has had to let go of it.
        </p>
      </div>

      {#if failures.length > 0}
        <div class="space-y-1">
          <p class="label">Not accepted, still on this laptop</p>
          <ul class="space-y-1">
            {#each failures as entry (entry.id)}
              <li class="text-xs">
                <span class="muted">{describe(entry)}</span>
                <span class="text-destructive">{entry.last_error}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>

    <div class="card-footer">
      <button type="submit" disabled={running || !password} class="btn btn-sm btn-primary">
        {running ? 'Syncing…' : 'Sync now'}
      </button>
      <button type="button" onclick={() => dialog?.close()} class="btn btn-sm btn-ghost">
        Close
      </button>
    </div>
  </form>
</dialog>
