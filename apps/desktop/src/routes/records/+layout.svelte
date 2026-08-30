<script lang="ts">
  import { goto } from '$app/navigation'
  import AppHeader from '$lib/components/AppHeader.svelte'
  import { session } from '$lib/session.svelte'

  let { children } = $props()

  // `+layout.ts` turns anyone away who arrives here without a session. Signing
  // out is the case it cannot cover — it happens on a screen that is already
  // open, and no `load` re-runs — so the button leaves the session empty and
  // this is what notices and navigates.
  $effect(() => {
    if (!session.signedIn) {
      goto('/')
    }
  })
</script>

{#if session.signedIn}
  <!-- A column the height of the window, because the record shell hangs its
       sheet tabs off the bottom edge and has to know where that edge is. Pages
       that are ordinary documents put their own container inside it. -->
  <div class="flex h-full flex-col">
    <AppHeader />
    {@render children()}
  </div>
{/if}
