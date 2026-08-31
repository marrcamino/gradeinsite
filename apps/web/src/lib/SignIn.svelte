<script lang="ts">
  import { session } from './session.svelte'

  /**
   * The 2024 sign-in screen, with a password field added.
   *
   * Everything else is as the manuscript shows it: a narrow centred card, the
   * heading "Get started by logging in", and the ID field labelled "Your ID"
   * over a full-width button in the brand colour.
   */

  let { onclaim }: { onclaim: (studentNo: string) => void } = $props()

  let studentNo = $state('')
  let password = $state('')
  let error = $state('')
  let busy = $state(false)

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    busy = true
    error = ''

    const result = await session.signIn(studentNo, password)

    if (result.ok) {
      // The screen goes away with the sign-in; nothing to reset.
      return
    }

    // A first visit is not a failure. Carry the number over so they do not
    // have to type it again on the next screen.
    if (result.needsPassword) {
      onclaim(studentNo.trim())
      return
    }

    password = ''
    error = result.message
    busy = false
  }
</script>

<main class="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center p-8">
  <img src="./favicon.png" alt="" class="mx-auto h-14 w-14" />

  <h1 class="mt-6 text-center text-2xl font-bold tracking-tight">Get started by logging in</h1>
  <p class="mt-1 text-center text-sm muted">See your grades for this term.</p>

  <form onsubmit={submit} class="mt-8 space-y-4">
    <div class="space-y-1.5">
      <label class="label" for="student-no">Your ID</label>
      <input
        id="student-no"
        bind:value={studentNo}
        autocomplete="username"
        inputmode="numeric"
        placeholder="2023-0001"
        required
        disabled={busy}
        class="input"
      />
    </div>

    <div class="space-y-1.5">
      <label class="label" for="password">Password</label>
      <input
        id="password"
        bind:value={password}
        type="password"
        autocomplete="current-password"
        required
        disabled={busy}
        class="input"
      />
    </div>

    {#if error}
      <p class="alert alert-error" role="alert">{error}</p>
    {/if}

    <button type="submit" disabled={busy} class="btn btn-primary btn-block">
      {busy ? 'Signing in…' : 'Next'}
    </button>
  </form>

  <p class="mt-6 text-center hint">
    First time here?
    <button type="button" class="link" onclick={() => onclaim(studentNo.trim())}>
      Set your password
    </button>
  </p>
</main>
