<script lang="ts">
  import { session } from './session.svelte'

  /** The bar over both grade screens: who is signed in, and the way out. */
</script>

<header class="border-b border-border bg-card">
  <div class="mx-auto flex w-full max-w-3xl items-center gap-3 px-6 py-3">
    <img src="./favicon.png" alt="" class="h-8 w-8" />

    <div class="min-w-0">
      <p class="truncate text-sm font-semibold">{session.displayName}</p>
      <p class="truncate text-xs muted">
        {session.current?.student_no}
        {#if session.current?.program}
          · {session.current.program}
        {/if}
        {#if session.current?.year_level}
          · Year {session.current.year_level}
        {/if}
      </p>
    </div>

    <button class="btn btn-secondary btn-sm ml-auto" onclick={() => session.signOut()}>
      Sign out
    </button>
  </div>
</header>
