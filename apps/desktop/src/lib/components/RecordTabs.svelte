<script lang="ts">
  import { tabs } from "$lib/tabs.svelte";
  import { fade, slide } from "svelte/transition";

  /**
   * The strip of open records across the top of the window.
   *
   * It behaves the way a browser's tab bar does because that is what it is
   * modelled on: click to switch, the x to close, the plus for a new one. The
   * strip scrolls sideways rather than shrinking the tabs to nothing, so a
   * course code stays readable however many records are open.
   */
</script>

<nav
  class="flex shrink-0 items-stretch border-b border-border bg-muted/60 min-h-9.75"
  aria-label="Open records"
>
  <ul class="flex min-w-0 overflow-x-auto">
    {#each tabs.tabs as tab (tab.id)}
      {@const active = tab.id === tabs.activeId}
      <li
        class="flex"
        in:slide={{ axis: "x", duration: 200 }}
        out:slide={{ axis: "x", duration: 150 }}
      >
        <div
          in:fade={{ delay: 0, duration: 150 }}
          out:fade={{ delay: 100, duration: 100 }}
          data-active={active ? "" : null}
          class="flex items-center gap-1 border-t-2 border-t-transparent text-muted-foreground hover:bg-accent/60 border-r border-border pr-1 pl-3 text-sm data-active:border-t-2 transition-colors data-active:border-t-primary bg-background font-medium"
        >
          <button
            type="button"
            onclick={() => tabs.select(tab.id)}
            aria-current={active ? "page" : undefined}
            class="max-w-40 truncate py-2 whitespace-nowrap"
          >
            {tab.title}
          </button>
          <button
            type="button"
            onclick={() => tabs.close(tab.id)}
            aria-label="Close {tab.title}"
            title="Close tab"
            class="btn btn-sm btn-ghost rounded-sm px-1 py-0.5 relative leading-none"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="size-3.5"
            >
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>

            <!-- Unsave indicator -->
            <!-- <div class="size-2.5 absolute rounded-full bg-foreground/50"></div> -->
          </button>
        </div>
      </li>
    {/each}
  </ul>

  <button
    type="button"
    onclick={() => tabs.addBlank()}
    aria-label="Open another record"
    title="Open another record"
    class="btn btn-sm btn-ghost shrink-0 px-3 text-base"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="size-3.5"><path d="M5 12h14" /><path d="M12 5v14" /></svg
    >
  </button>
</nav>
