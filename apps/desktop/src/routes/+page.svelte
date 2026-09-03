<script lang="ts">
  import { goto } from '$app/navigation'
  import CreateAccount from '$lib/components/CreateAccount.svelte'
  import ServerAddress from '$lib/components/ServerAddress.svelte'
  import { session } from '$lib/session.svelte'

  let username = $state('')
  let password = $state('')
  let error = $state('')
  let busy = $state(false)
  let stage = $state<'server' | 'local' | null>(null)
  let showServer = $state(false)

  // 2024 swapped the whole panel for the create-account form and put a way back
  // at the top of it, rather than opening a second window.
  let creating = $state(false)

  // Offer back whoever signed in last: on a shared computer that is nearly
  // always the person about to sign in again.
  session.remembered().then((account) => {
    if (account.username && !username) {
      username = account.username
    }
  })

  // Somebody who is already signed in never gets this far: `+page.ts` sends
  // them on to their records before this screen is built.

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    busy = true
    error = ''
    stage = null

    const result = await session.signIn(username, password, (next) => (stage = next))
    password = ''

    if (result.ok) {
      await goto('/records')
      return
    }

    error = result.message
    busy = false
    stage = null
  }
</script>

{#if creating}
  <CreateAccount oncancel={() => (creating = false)} />
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
          Checking this computer…
        {:else}
          Asking the server…
        {/if}
      </button>
    </form>

    {#if error}
      <p class="alert alert-error mt-3">{error}</p>
    {/if}

    <button type="button" onclick={() => (creating = true)} class="link mt-4 self-start text-sm">
      Create an account
    </button>

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
