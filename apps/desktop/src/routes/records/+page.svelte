<script lang="ts">
  import { listClassRecords } from '$lib/db'
  import type { ClassRecord } from '$lib/db'
  import RecordPicker from '$lib/components/RecordPicker.svelte'
  import RecordTabs from '$lib/components/RecordTabs.svelte'
  import RecordWorkspace from '$lib/components/RecordWorkspace.svelte'
  import { tabs } from '$lib/tabs.svelte'

  /**
   * The window the app lives in: a strip of open records across the top, and
   * whichever one is in front below it.
   *
   * Every open tab stays mounted and is hidden rather than torn down, so
   * switching back to a record finds it where it was left — the scroll
   * position, the sheet that was open, a half-typed search. That is what makes
   * the tabs feel like a browser's rather than five routes sharing a URL.
   */

  let records = $state<ClassRecord[]>([])
  let loading = $state(true)

  async function load() {
    records = await listClassRecords()
    // A record renamed or deleted while a tab held it would otherwise leave the
    // tab labelled with a course code that no longer exists.
    tabs.refresh(records)
    loading = false
  }

  load()
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <RecordTabs />

  {#if tabs.tabs.length === 0}
    <div class="min-h-0 flex-1 overflow-auto">
      <RecordPicker {records} {loading} onchange={load} />
    </div>
  {:else}
    {#each tabs.tabs as tab (tab.id)}
      <div
        style:display={tab.id === tabs.activeId ? 'flex' : 'none'}
        class="min-h-0 flex-1 flex-col"
      >
        {#if tab.recordId === null}
          <div class="min-h-0 flex-1 overflow-auto">
            <RecordPicker {records} {loading} onchange={load} />
          </div>
        {:else}
          <RecordWorkspace recordId={tab.recordId} bind:shelf={tab.shelf} />
        {/if}
      </div>
    {/each}
  {/if}
</div>
