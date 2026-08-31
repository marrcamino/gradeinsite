<script lang="ts">
  import ClaimAccount from './lib/ClaimAccount.svelte'
  import SignIn from './lib/SignIn.svelte'
  import { session } from './lib/session.svelte'

  /**
   * The portal, in one component.
   *
   * There is no router, on purpose. Client-side history routing would need an
   * Apache rewrite rule to survive a refresh, and the deployment has to stay a
   * plain folder copy into htdocs - so which screen is showing is a variable,
   * not a URL.
   */

  let view = $state<'signin' | 'claim'>('signin')

  /** Carried from the sign-in form, so the ID is not typed twice. */
  let claiming = $state('')

  // Ask the server whether this browser already holds a session, before the
  // first screen paints - otherwise a returning student sees the sign-in form
  // flash and disappear.
  session.restore()

  function toClaim(studentNo: string) {
    claiming = studentNo
    view = 'claim'
  }
</script>

{#if session.loading}
  <!-- The session check is a single request to the same machine, so this is
       usually a frame or two. It exists to stop the wrong screen showing. -->
  <div class="flex min-h-full items-center justify-center">
    <p class="text-sm muted">Loading…</p>
  </div>
{:else if !session.signedIn}
  {#if view === 'claim'}
    <ClaimAccount studentNo={claiming} onback={() => (view = 'signin')} />
  {:else}
    <SignIn onclaim={toClaim} />
  {/if}
{:else}
  <!-- Signed in. The course list and the grade detail screens land here next. -->
  <main class="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-4 p-8">
    <h1 class="text-2xl font-bold tracking-tight">
      Welcome, {session.current?.first_name}
    </h1>
    <p class="text-sm muted">
      {session.current?.student_no} · {session.current?.program}
      {#if session.current?.year_level}
        · Year {session.current.year_level}
      {/if}
    </p>
    <div>
      <button class="btn btn-secondary" onclick={() => session.signOut()}>Sign out</button>
    </div>
  </main>
{/if}
