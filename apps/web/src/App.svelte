<script lang="ts">
  import ClaimAccount from './lib/ClaimAccount.svelte'
  import CourseDetail from './lib/CourseDetail.svelte'
  import CourseList from './lib/CourseList.svelte'
  import PortalHeader from './lib/PortalHeader.svelte'
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

  /** Which course is open, or null for the list. */
  let openCourse = $state<number | null>(null)

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
  <PortalHeader />

  {#if openCourse === null}
    <CourseList onopen={(recordId) => (openCourse = recordId)} />
  {:else}
    <!-- Keyed so opening a different course rebuilds the screen and refetches,
         rather than showing the previous course's grades while it loads. -->
    {#key openCourse}
      <CourseDetail recordId={openCourse} onback={() => (openCourse = null)} />
    {/key}
  {/if}
{/if}
