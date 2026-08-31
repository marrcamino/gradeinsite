<script lang="ts">
  import Programs from './Programs.svelte'
  import Settings from './Settings.svelte'
  import SyncButton from './SyncButton.svelte'
  import { session } from '$lib/session.svelte'

  // The bar every signed-in screen sits under. It exists mostly to keep the
  // instructor's name and the offline badge in one place: whether the computer
  // reached the server is the thing that changes what the app can do, so it is
  // on screen rather than hidden behind a menu.
  //
  // Signing out only clears the session; the route guard is what navigates.
</script>

<header class="z-10 shrink-0 border-b border-border bg-background">
  <div class="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3">
    <img src="/favicon.png" alt="" class="h-7 w-7" />
    <span class="text-base font-semibold tracking-tight text-primary">GradeInsite</span>

    <div class="ml-auto flex items-center gap-3">
      {#if session.current}
        <span class="hint">{session.displayName || session.current.username}</span>
        {#if !session.current.online}
          <span class="badge badge-warning" title="Signed in against this computer's cached account">
            offline
          </span>
        {/if}
        <Programs />
        <SyncButton />
        <Settings />
      {/if}
      <button type="button" onclick={() => session.signOut()} class="btn btn-sm btn-ghost">
        Sign out
      </button>
    </div>
  </div>
</header>
