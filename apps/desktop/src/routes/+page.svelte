<script lang="ts">
  import ServerAddress from '$lib/components/ServerAddress.svelte'
  import { session } from '$lib/session.svelte'

  let username = $state('')
  let password = $state('')
  let error = $state('')
  let busy = $state(false)
  let stage = $state<'server' | 'local' | null>(null)
  let showServer = $state(false)

  // Offer back whoever signed in last: on a shared laptop that is nearly always
  // the person about to sign in again.
  session.remembered().then((account) => {
    if (account.username && !username) {
      username = account.username
    }
  })

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    busy = true
    error = ''
    stage = null

    const result = await session.signIn(username, password, (next) => (stage = next))
    if (!result.ok) {
      error = result.message
    }
    password = ''
    busy = false
    stage = null
  }
</script>

{#if session.current}
  <main class="p-8">
    <div class="flex items-center gap-3">
      <img src="/favicon.png" alt="" class="h-8 w-8" />
      <h1 class="text-2xl font-semibold tracking-tight text-primary">GradeInsite</h1>
    </div>
    <p class="mt-2 text-sm text-muted-foreground">
      Signed in as {session.displayName} ({session.current.username})
      {#if !session.current.online}
        <span class="badge badge-warning ml-1">offline</span>
      {/if}
    </p>
    <button type="button" onclick={() => session.signOut()} class="btn btn-sm btn-outline mt-4">
      Sign out
    </button>
  </main>
{:else}
  <main class="mx-auto flex min-h-full max-w-sm flex-col justify-center p-8">
    <img src="/favicon.png" alt="" class="h-14 w-14" />
    <h1 class="mt-4 text-2xl font-semibold tracking-tight text-primary">GradeInsite</h1>
    <p class="mt-1 text-sm text-muted-foreground">Class records, on or off the network.</p>

    <form onsubmit={submit} class="mt-6 space-y-3">
      <input
        bind:value={username}
        placeholder="Username"
        aria-label="Username"
        autocomplete="username"
        class="input"
      />
      <input
        bind:value={password}
        type="password"
        placeholder="Password"
        aria-label="Password"
        autocomplete="current-password"
        class="input"
      />

      <button type="submit" disabled={busy} class="btn btn-primary w-full">
        {#if !busy}
          Sign in
        {:else if stage === 'local'}
          Checking this laptop…
        {:else}
          Asking the server…
        {/if}
      </button>
    </form>

    {#if error}
      <p class="alert alert-error mt-3">{error}</p>
    {/if}

    <button
      type="button"
      onclick={() => (showServer = !showServer)}
      class="link mt-6 self-start text-xs"
    >
      {showServer ? 'Hide' : 'Where is the server?'}
    </button>

    {#if showServer}
      <div class="card card-body mt-3">
        <ServerAddress />
      </div>
    {/if}
  </main>
{/if}
