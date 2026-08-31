<script lang="ts">
  import { reachable } from '$lib/api/client'
  import { endpointUrl, getEndpoint, saveEndpoint } from '$lib/db'
  import type { ServerEndpoint } from '$lib/db'

  // Where the school server is. This is the piece the 2024 app hardcoded, so
  // moving the server meant rebuilding it; here it is a row in the database and
  // a form the instructor can reach without signing in first — which they have
  // to be able to do, since signing in is what needs the address.
  //
  // `onchecked` lets a screen that shows its own connection line hear the
  // result of a test, so the two never disagree. The sign-in screen passes
  // nothing and just reads the message below the button.

  let { onchecked }: { onchecked?: (up: boolean) => void } = $props()

  let endpoint = $state<ServerEndpoint | null>(null)
  let checking = $state(false)
  let result = $state<'up' | 'down' | null>(null)
  let saved = $state(false)

  const preview = $derived(endpoint ? `${endpointUrl(endpoint)}api/` : '')

  async function load() {
    endpoint = await getEndpoint()
  }

  async function save() {
    if (!endpoint) return
    await saveEndpoint(endpoint.protocol, endpoint.address, endpoint.port, endpoint.path)
    saved = true
    setTimeout(() => (saved = false), 2000)
  }

  async function test() {
    await save()
    checking = true
    result = null

    const up = await reachable()

    result = up ? 'up' : 'down'
    checking = false
    onchecked?.(up)
  }

  load()
</script>

{#if endpoint}
  <div class="space-y-3">
    <div class="grid grid-cols-[7rem_1fr_5rem] gap-2">
      <select bind:value={endpoint.protocol} class="select input-sm">
        <option value="http://">http://</option>
        <option value="https://">https://</option>
      </select>
      <input
        bind:value={endpoint.address}
        placeholder="192.168.1.10"
        aria-label="Server address"
        class="input input-sm"
      />
      <input
        bind:value={endpoint.port}
        placeholder="port"
        aria-label="Port"
        class="input input-sm"
      />
    </div>

    <input
      bind:value={endpoint.path}
      placeholder="gradeinsite/"
      aria-label="Folder on the server"
      class="input input-sm"
    />

    <p class="hint truncate font-mono">{preview}</p>

    <div class="flex items-center gap-3">
      <button type="button" onclick={test} disabled={checking} class="btn btn-sm btn-outline">
        {checking ? 'Checking…' : 'Save and test'}
      </button>

      {#if saved && result === null}
        <span class="hint">Saved.</span>
      {/if}
      {#if result === 'up'}
        <span class="text-xs text-success">The server answered.</span>
      {:else if result === 'down'}
        <span class="text-xs text-warning">No answer. You can still work offline.</span>
      {/if}
    </div>
  </div>
{/if}
