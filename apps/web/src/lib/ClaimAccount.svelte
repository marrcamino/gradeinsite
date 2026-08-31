<script lang="ts">
  import { untrack } from 'svelte'
  import { session } from './session.svelte'

  /**
   * Setting a password for the first time.
   *
   * A student row arrives from the instructor's laptop with no portal password
   * on it - the desktop app has no copy of one to send. This is where the
   * student puts one there, once.
   *
   * The last name is asked for as well as the ID number, because an ID number
   * is not a secret: it is on every class list. Without it, whoever typed a
   * classmate's number first would own their grades.
   */

  let {
    studentNo: initialStudentNo,
    onback,
  }: { studentNo: string; onback: () => void } = $props()

  // Seeded once from the sign-in form and then owned by this field. `untrack`
  // says that is deliberate: the prop is a starting value, not a binding, and
  // a later change to it must not overwrite what the student has typed.
  let studentNo = $state(untrack(() => initialStudentNo))
  let lastName = $state('')
  let password = $state('')
  let confirmation = $state('')
  let error = $state('')
  let busy = $state(false)

  const MIN_LENGTH = 8

  // Checked here as well as on the server so the mistake is caught while they
  // are still looking at the two boxes, rather than after a round trip.
  const mismatch = $derived(confirmation !== '' && password !== confirmation)
  const tooShort = $derived(password !== '' && password.length < MIN_LENGTH)

  async function submit(event: SubmitEvent) {
    event.preventDefault()

    if (password !== confirmation) {
      error = 'The two passwords do not match.'
      return
    }

    busy = true
    error = ''

    const result = await session.claim(studentNo, lastName, password)

    if (result.ok) {
      return
    }

    password = ''
    confirmation = ''
    error = result.message
    busy = false
  }
</script>

<main class="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center p-8">
  <img src="./favicon.svg" alt="" class="mx-auto h-14 w-14" />

  <h1 class="mt-6 text-center text-2xl font-bold tracking-tight">Set your password</h1>
  <p class="mt-1 text-center text-sm muted">
    You only do this once. After that you sign in with your ID and password.
  </p>

  <form onsubmit={submit} class="mt-8 space-y-4">
    <div class="space-y-1.5">
      <label class="label" for="claim-student-no">Your ID</label>
      <input
        id="claim-student-no"
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
      <label class="label" for="last-name">Last name</label>
      <input
        id="last-name"
        bind:value={lastName}
        autocomplete="family-name"
        required
        disabled={busy}
        class="input"
      />
      <p class="hint">As your instructor has it on the class record.</p>
    </div>

    <div class="space-y-1.5">
      <label class="label" for="new-password">New password</label>
      <input
        id="new-password"
        bind:value={password}
        type="password"
        autocomplete="new-password"
        required
        disabled={busy}
        class="input"
      />
      <p class="hint" class:text-destructive={tooShort}>
        At least {MIN_LENGTH} characters.
      </p>
    </div>

    <div class="space-y-1.5">
      <label class="label" for="confirm-password">Confirm password</label>
      <input
        id="confirm-password"
        bind:value={confirmation}
        type="password"
        autocomplete="new-password"
        required
        disabled={busy}
        class="input"
      />
      {#if mismatch}
        <p class="hint text-destructive">The two passwords do not match.</p>
      {/if}
    </div>

    {#if error}
      <p class="alert alert-error" role="alert">{error}</p>
    {/if}

    <button type="submit" disabled={busy || mismatch || tooShort} class="btn btn-primary btn-block">
      {busy ? 'Saving…' : 'Save and continue'}
    </button>
  </form>

  <p class="mt-6 text-center hint">
    Already have a password?
    <button type="button" class="link" onclick={onback}>Sign in</button>
  </p>
</main>
