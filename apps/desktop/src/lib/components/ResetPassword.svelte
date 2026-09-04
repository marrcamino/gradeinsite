<script lang="ts">
  import { untrack } from 'svelte'
  import { goto } from '$app/navigation'
  import { MIN_PASSWORD_LENGTH, session } from '$lib/session.svelte'

  /**
   * Setting a new password for an instructor who has forgotten theirs.
   *
   * The 2024 sign-in screen had "Forgot password?" sitting beside the password
   * label, as an <a href="#"> that did nothing — the link was designed and the
   * endpoint behind it never written. This is that link, in the same place.
   *
   * A school network has no email, so there is nothing to send a reset link
   * over. What a school does have is colleagues, so a reset is approved by an
   * instructor who already has an account — the same way a new account is.
   */

  let { username: initialUsername = '', oncancel }: { username?: string; oncancel: () => void } =
    $props()

  // Seeded once from the sign-in screen, then owned by this field. untrack
  // says that is deliberate: the parent's value changing later must not
  // overwrite what is being typed here.
  let username = $state(untrack(() => initialUsername))
  let password = $state('')
  let byUsername = $state('')
  let byPassword = $state('')

  let error = $state('')
  let busy = $state(false)

  const ready = $derived(
    username.trim() !== '' &&
      password.length >= MIN_PASSWORD_LENGTH &&
      byUsername.trim() !== '' &&
      byPassword !== ''
  )

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    busy = true
    error = ''

    const result = await session.resetPassword(username, password, {
      username: byUsername,
      password: byPassword,
    })

    if (result.ok) {
      // The reset signs them in, so they go where a sign-in goes.
      await goto('/records')
      return
    }

    error = result.message
    busy = false
  }
</script>

<main class="mx-auto flex min-h-full max-w-sm flex-col justify-center p-8">
  <button type="button" onclick={oncancel} class="link mb-6 self-start text-xs"> ← Sign in </button>

  <h1 class="text-2xl font-semibold tracking-tight text-primary">Set a new password</h1>
  <p class="mt-1 text-sm text-muted-foreground">
    Passwords are kept on the school server, so this needs the school network.
  </p>

  <form onsubmit={submit} class="mt-6 space-y-3">
    <input
      bind:value={username}
      placeholder="Your username"
      aria-label="Your username"
      autocomplete="username"
      class="input"
    />
    <div>
      <input
        bind:value={password}
        type="password"
        placeholder="Your new password"
        aria-label="Your new password"
        autocomplete="new-password"
        class="input"
      />
      <p class="hint mt-1">At least {MIN_PASSWORD_LENGTH} characters.</p>
    </div>

    <div class="card card-body space-y-3">
      <p class="hint">
        There is no e-mail on the school network, so a colleague approves this instead. Ask an
        instructor who already has an account to type theirs here — it is not saved on this
        computer.
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

    <button type="submit" disabled={busy || !ready} class="btn btn-primary w-full">
      {busy ? 'Setting…' : 'Set new password'}
    </button>
  </form>

  {#if error}
    <p class="alert alert-error mt-3">{error}</p>
  {/if}
</main>
