<script lang="ts">
  import { goto } from '$app/navigation'
  import AppHeader from '$lib/components/AppHeader.svelte'
  import { session } from '$lib/session.svelte'

  let { children } = $props()

  // The session lives in memory for one run of the app, so a reload — or a sign
  // out — leaves these screens with nobody behind them. Send the window back to
  // the sign-in screen instead of showing an empty shell.
  $effect(() => {
    if (!session.signedIn) {
      goto('/')
    }
  })
</script>

{#if session.signedIn}
  <AppHeader />
  <main class="mx-auto max-w-5xl px-6 py-6">
    {@render children()}
  </main>
{/if}
