<script lang="ts">
  import { PERIOD_NAMES, activePeriods } from '$lib/db'
  import type { ClassRecord } from '$lib/db'
  import type { Shelf } from '$lib/tabs.svelte'

  /**
   * The sheets along the bottom of an open record, the way a workbook holds
   * them: Input, then one per grading period, then GPA and Print.
   *
   * Only the periods the record actually grades get a sheet — a weight of zero
   * means the school does not use that period, and an empty tab for it would be
   * a place to enter marks that count for nothing.
   */

  let { record, shelf = $bindable() }: { record: ClassRecord; shelf: Shelf } = $props()

  const periods = $derived(activePeriods(record))

  function tabClass(name: Shelf): string {
    const active = shelf === name
    return `border-r border-border px-4 py-1.5 text-xs whitespace-nowrap ${
      active
        ? 'border-t-2 border-t-primary bg-background font-semibold text-primary'
        : 'border-t-2 border-t-transparent text-muted-foreground hover:bg-accent/60'
    }`
  }
</script>

<div class="flex shrink-0 items-stretch overflow-x-auto border-t border-border bg-muted/60">
  <button type="button" onclick={() => (shelf = 'input')} class={tabClass('input')}>Input</button>

  {#each periods as period (period)}
    <button type="button" onclick={() => (shelf = period)} class={tabClass(period)}>
      {PERIOD_NAMES[period]}
    </button>
  {/each}

  <!-- The divider 2024 put here: everything left of it is somewhere marks are
       entered, everything right of it only reads them back. -->
  <div class="w-2 border-r border-border"></div>

  <button type="button" onclick={() => (shelf = 'gpa')} class={tabClass('gpa')}>GPA</button>
  <button type="button" onclick={() => (shelf = 'print')} class={tabClass('print')}>PRINT</button>
</div>
