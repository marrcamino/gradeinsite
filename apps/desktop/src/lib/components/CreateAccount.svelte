<script lang="ts">
  import { goto } from '$app/navigation'
  import { MIN_PASSWORD_LENGTH, session } from '$lib/session.svelte'

  /**
   * Opening an instructor account, reached from the sign-in screen.
   *
   * 2024 put a "Create Account" link under the log-in form and swapped the
   * panel for this one, with a way back — the same two fields as the sign-in
   * plus a first and last name. That is the shape kept here.
   *
   * What is not kept is how it checked the username. 2024 downloaded every
   * instructor username in the school on mount and compared against the list in
   * the browser, which told anyone on the wi-fi who works here. The server
   * already answers "that username is taken" when the account is submitted, so
   * that is where it is said, and no endpoint hands the list out.
   */

  let { oncancel }: { oncancel: () => void } = $props()

  let username = $state('')
  let password = $state('')
  let firstName = $state('')
  let lastName = $state('')

  /**
   * Filled in only when the server asks for them.
   *
   * A school that already has instructors will not open an account for whoever
   * asks, so an existing instructor signs the request. Asking for that up front
   * would put two more fields in front of the person setting the server up for
   * the first time, who has nobody to name in them.
   */
  let authorising = $state(false)
  let byUsername = $state('')
  let byPassword = $state('')

  let error = $state('')
  let busy = $state(false)

  const ready = $derived(
    username.trim() !== '' &&
      firstName.trim() !== '' &&
      lastName.trim() !== '' &&
      password.length >= MIN_PASSWORD_LENGTH &&
      (!authorising || (byUsername.trim() !== '' && byPassword !== ''))
  )

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    busy = true
    error = ''

    const result = await session.register(
      { username, password, firstName, lastName },
      authorising ? { username: byUsername, password: byPassword } : undefined
    )

    if (result.ok) {
      // Creating the account signs them in, so they land where a sign-in lands
      // rather than being sent back to type the password they just chose.
      await goto('/records')
      return
    }

    error = result.message
    busy = false

    if (result.needsAuthorisation) {
      authorising = true
      // The server's own words for this are about credentials being missing,
      // which reads as a mistake the instructor made. It is not one.
      error = 'This school already has accounts, so an instructor with one has to approve this.'
    }
  }
</script>

<main class="mx-auto flex min-h-full max-w-sm flex-col justify-center p-8">
  <button type="button" onclick={oncancel} class="link mb-6 self-start text-xs"> ← Sign in </button>

  <h1 class="text-2xl font-semibold tracking-tight text-primary">Create your account</h1>
  <p class="mt-1 text-sm text-muted-foreground">
    The account is made on the school server, so this needs the school network.
  </p>

  <form onsubmit={submit} class="mt-6 space-y-3">
    <input
      bind:value={username}
      placeholder="Username"
      aria-label="Username"
      autocomplete="username"
      class="input"
    />
    <div>
      <input
        bind:value={password}
        type="password"
        placeholder="Password"
        aria-label="Password"
        autocomplete="new-password"
        class="input"
      />
      <p class="hint mt-1">At least {MIN_PASSWORD_LENGTH} characters.</p>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <input
        bind:value={firstName}
        placeholder="First name"
        aria-label="First name"
        autocomplete="given-name"
        class="input"
      />
      <input
        bind:value={lastName}
        placeholder="Last name"
        aria-label="Last name"
        autocomplete="family-name"
        class="input"
      />
    </div>

    {#if authorising}
      <div class="card card-body space-y-3">
        <p class="hint">
          An instructor who already has an account has to approve a new one. Ask them to type theirs
          here — it is not saved on this computer.
        </p>
        <input
          bind:value={byUsername}
          placeholder="Their username"
          aria-label="Approving instructor's username"
          autocomplete="off"
          class="input input-sm"
        />
        <input
          bind:value={byPassword}
          type="password"
          placeholder="Their password"
          aria-label="Approving instructor's password"
          autocomplete="off"
          class="input input-sm"
        />
      </div>
    {/if}

    <button type="submit" disabled={busy || !ready} class="btn btn-primary w-full">
      {busy ? 'Creating…' : 'Create account'}
    </button>
  </form>

  {#if error}
    <p class="alert alert-error mt-3">{error}</p>
  {/if}
</main>
