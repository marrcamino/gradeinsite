<script lang="ts">
  import { activePeriods, deleteClassRecord } from '$lib/db'
  import type { ClassRecord } from '$lib/db'
  import { schoolYear, termName, yearLevelName } from '$lib/format'
  import { tabs } from '$lib/tabs.svelte'

  /**
   * Every course this laptop holds a record for, offered to a tab that has not
   * picked one yet — and to an empty window, which is the same thing.
   *
   * In 2024 opening a record meant searching a runtime-created table by name,
   * and the list only existed on the server. Here the rows are local, so the
   * list is what the app opens on and works with the network off.
   */

  let {
    records,
    loading,
    onchange,
  }: { records: ClassRecord[]; loading: boolean; onchange: () => Promise<void> } = $props()

  let search = $state('')
  let confirming = $state<number | null>(null)

  const matches = $derived.by(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) {
      return records
    }
    return records.filter((record) =>
      `${record.course_code} ${record.course_name} ${record.program}`.toLowerCase().includes(needle)
    )
  })

  /** Instructors think in terms, so the list is cut into them. The query already
   *  sorts by school year and term, which is why neighbours can be collected as
   *  they come rather than grouped by a second pass. */
  const groups = $derived.by(() => {
    const out: { key: string; label: string; records: ClassRecord[] }[] = []

    for (const record of matches) {
      const key = `${record.school_year_start}-${record.term}`
      const last = out[out.length - 1]

      if (last?.key === key) {
        last.records.push(record)
      } else {
        out.push({
          key,
          label: `AY ${schoolYear(record)} · ${termName(record.term)}`,
          records: [record],
        })
      }
    }

    return out
  })

  async function remove(id: number) {
    await deleteClassRecord(id)
    confirming = null
    await onchange()
  }
</script>

<div class="mx-auto w-full max-w-5xl px-6 py-6">
  <div class="flex flex-wrap items-end gap-3">
    <div class="mr-auto">
      <h1 class="text-xl font-semibold tracking-tight">Open a class record</h1>
      <p class="hint mt-1">
        {#if loading}
          Opening the local database…
        {:else if records.length === 0}
          Nothing on this laptop yet.
        {:else}
          {records.length}
          {records.length === 1 ? 'record' : 'records'} on this laptop.
        {/if}
      </p>
    </div>

    {#if records.length > 0}
      <input
        bind:value={search}
        placeholder="Search course or program"
        aria-label="Search class records"
        class="input input-sm w-56"
      />
    {/if}
    <a href="/records/edit" class="btn btn-sm btn-primary">New class record</a>
  </div>

  {#if !loading && records.length === 0}
    <div class="card card-body mt-6">
      <p class="text-sm">A class record is one course, for one term.</p>
      <p class="hint mt-1">
        Create one and it is saved here first. It is pushed to the school server the next time
        this laptop is on the network, so none of this needs the wi-fi to work.
      </p>
    </div>
  {:else if !loading && matches.length === 0}
    <p class="hint mt-6">No record matches “{search}”.</p>
  {/if}

  {#each groups as group (group.key)}
    <section class="card mt-6">
      <div class="card-header">
        <h2 class="card-title">{group.label}</h2>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Course</th>
            <th>Program</th>
            <th>Schedule</th>
            <th class="text-right">&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {#each group.records as record (record.id)}
            <tr>
              <td>
                <span class="font-medium">{record.course_code}</span>
                <span class="muted"> — {record.course_name}</span>
                {#if activePeriods(record).length === 0}
                  <span class="badge badge-warning ml-2">grading scheme not set</span>
                {:else if record.synced_at === null}
                  <span class="badge badge-neutral ml-2">not synced</span>
                {/if}
              </td>
              <td class="whitespace-nowrap">
                {record.program}
                <span class="muted">{yearLevelName(record.year_level)}</span>
              </td>
              <td class="muted">{record.schedule ?? '—'}</td>
              <td class="text-right whitespace-nowrap">
                {#if confirming === record.id}
                  <span class="hint mr-2">Delete this record and its grades?</span>
                  <button
                    type="button"
                    onclick={() => remove(record.id)}
                    class="btn btn-sm btn-destructive"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onclick={() => (confirming = null)}
                    class="btn btn-sm btn-ghost"
                  >
                    Cancel
                  </button>
                {:else}
                  <button
                    type="button"
                    onclick={() => tabs.open(record)}
                    class="btn btn-sm btn-primary"
                  >
                    Open
                  </button>
                  <a href="/records/edit?id={record.id}" class="btn btn-sm btn-outline">Edit</a>
                  <button
                    type="button"
                    onclick={() => (confirming = record.id)}
                    class="btn btn-sm btn-ghost"
                  >
                    Delete
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/each}
</div>
