<script lang="ts">
  import { reachable } from '$lib/api/client'
  import { getEndpoint } from '$lib/db'
  import { whenLocal } from '$lib/format'
  import ServerAddress from './ServerAddress.svelte'

  /**
   * Where the school server is, reachable at any time rather than only from the
   * sign-in screen.
   *
   * 2024 kept this behind a gear in the title bar and called it "IP
   * Configuration", which is the name on the manuscript and the name an
   * instructor here already uses for it. The fields are the same four, in the
   * same order, for the same reason: the address is a row in the database, not
   * a constant compiled into the app, and moving the server must never mean
   * rebuilding it.
   *
   * The two lines above the form are what the sign-in screen has no way to
   * show. Once the instructor is working, the questions are "is the laptop on
   * the school network right now" and "how much of my work has the server
   * seen" — and the second one is why `last_sync_at` is a column rather than
   * something counted out of the outbox.
   */

  let dialog = $state<HTMLDialogElement>()
  let lastSync = $state<string | null>(null)
  let status = $state<'checking' | 'up' | 'down' | null>(null)

  async function open() {
    dialog?.showModal()

    lastSync = (await getEndpoint()).last_sync_at
    status = 'checking'
    status = (await reachable()) ? 'up' : 'down'
  }
</script>

<button
  type="button"
  onclick={open}
  class="btn btn-sm btn-ghost"
  title="Where the school server is"
  aria-label="Server settings"
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="h-4 w-4">
    <circle cx="12" cy="12" r="3" />
    <path
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
    />
  </svg>
</button>

<dialog bind:this={dialog} class="dialog" aria-labelledby="settings-title">
  <div class="card-header">
    <h3 id="settings-title" class="card-title">IP Configuration</h3>
    <p class="hint">
      The address of the school server. The app keeps working without it — this is only where
      finished work is sent.
    </p>
  </div>

  <div class="card-body space-y-4">
    <dl class="space-y-1 text-xs">
      <div class="flex gap-2">
        <dt class="muted w-24 shrink-0">Server</dt>
        <dd>
          {#if status === 'checking'}
            <span class="muted">Checking…</span>
          {:else if status === 'up'}
            <span class="text-success">Connected</span>
          {:else if status === 'down'}
            <span class="text-warning">Not connected</span>
          {/if}
        </dd>
      </div>
      <div class="flex gap-2">
        <dt class="muted w-24 shrink-0">Last synced</dt>
        <dd>
          {#if lastSync}
            {whenLocal(lastSync)}
          {:else}
            <span class="muted">Nothing sent yet</span>
          {/if}
        </dd>
      </div>
    </dl>

    <ServerAddress onchecked={(up) => (status = up ? 'up' : 'down')} />
  </div>

  <div class="card-footer">
    <button type="button" onclick={() => dialog?.close()} class="btn btn-sm btn-ghost">
      Close
    </button>
  </div>
</dialog>
