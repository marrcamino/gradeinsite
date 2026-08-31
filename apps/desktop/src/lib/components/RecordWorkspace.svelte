<script lang="ts">
  import {
    activePeriods,
    getClassRecord,
    listPeriodGrades,
    listSheetRows,
    saveSheetLayout,
  } from '$lib/db'
  import type { ClassRecord, Period, PeriodGrade, SheetLayout, SheetRow } from '$lib/db'
  import { emptyLayout, ensureColumns, sameLayout } from '$lib/grades'
  import { schoolYear, termName, yearLevelName } from '$lib/format'
  import SheetShelf from '$lib/components/SheetShelf.svelte'
  import GpaSheet from '$lib/components/sheets/GpaSheet.svelte'
  import InputSheet from '$lib/components/sheets/InputSheet.svelte'
  import PrintSheet from '$lib/components/sheets/PrintSheet.svelte'
  import PeriodSheet from '$lib/components/sheets/PeriodSheet.svelte'
  import type { Shelf } from '$lib/tabs.svelte'

  /**
   * One open record: its heading, the sheet on show, and the shelf of sheets
   * along the bottom.
   *
   * The record and its roster are loaded once here rather than by each sheet,
   * so switching between Input and a grading period does not go back to the
   * database for the same rows. Only the sheet actually on show is rendered —
   * five periods all editing one `sheet_layout` at once would be five copies of
   * it racing to save.
   */

  let { recordId, shelf = $bindable() }: { recordId: number; shelf: Shelf } = $props()

  let record = $state<ClassRecord | null>(null)
  let layout = $state<SheetLayout>({})
  let rows = $state<SheetRow[]>([])
  let grades = $state<Map<number, Map<Period, PeriodGrade>>>(new Map())
  let loading = $state(true)
  let error = $state('')
  let saved = $state(false)

  const periods = $derived(record ? activePeriods(record) : [])

  async function load() {
    const found = await getClassRecord(recordId)
    if (!found) {
      error = 'That class record is no longer on this computer.'
      loading = false
      return
    }

    record = found

    // The layout is rebuilt from the periods the record actually grades, which
    // does two things at once: a period that has never been set up gets an
    // empty one to edit, and a period whose weight has since been dropped to 0
    // is left out. Carrying a disused period along would mean pushing columns
    // to the server for a sheet nobody can open.
    const stored = found.sheet_layout ?? {}
    const rebuilt: SheetLayout = {}
    let changed = false

    for (const active of activePeriods(found)) {
      const before = stored[active] ?? emptyLayout()
      // Every component the record grades starts with a column, so the grid
      // always has somewhere to type. A layout that gains one here has to be
      // written back, or the sheet would seed it again on every open.
      const after = ensureColumns(found, before)
      changed ||= !stored[active] || !sameLayout(before, after)
      rebuilt[active] = after
    }

    layout = rebuilt
    // Written straight through rather than via saveLayout(): seeding a column
    // is the app tidying up after itself, and flashing "Saved" at somebody who
    // has only just opened the record would claim they did something.
    if (changed) {
      await saveSheetLayout(recordId, layout)
    }

    await loadRows()
    loading = false
  }

  async function loadRows() {
    rows = await listSheetRows(recordId)
    grades = await listPeriodGrades(recordId)
  }

  /**
   * Saved on change rather than on every keystroke: each save is an UPDATE, and
   * an UPDATE queues an outbox entry, so typing "100" one digit at a time would
   * put three rows in the sync queue for one edit.
   */
  async function saveLayout() {
    error = ''
    try {
      await saveSheetLayout(recordId, layout)
      saved = true
      setTimeout(() => (saved = false), 1500)
    } catch (failure) {
      error = `The columns could not be saved: ${failure}`
    }
  }

  /** The three sheets every record has, whatever its grading scheme. */
  const FIXED: Shelf[] = ['input', 'gpa', 'print']

  /** The shelf name is a period exactly when it is not one of the fixed three. */
  function periodOf(name: Shelf): Period | null {
    return periods.find((period) => period === name) ?? null
  }

  /**
   * A grading period sheet is wider than the window, so it gets the whole of
   * it. So is the GPA sheet once a record grades more than a period or two, and
   * so is a sheet of A4 laid out sideways.
   */
  const wide = $derived(periodOf(shelf) !== null || shelf === 'gpa' || shelf === 'print')

  // Marks are entered on the period sheets, which write straight to the
  // database; the grades held here were read when the record was opened. The
  // GPA and PRINT sheets only read them back, so they re-read on the way in
  // rather than carrying a refresh button the way 2024 did.
  $effect(() => {
    if (shelf === 'gpa' || shelf === 'print') {
      void loadRows()
    }
  })

  // A period whose weight is dropped to 0 takes its sheet off the shelf with
  // it. If that was the sheet on show, the tab would be left pointing at
  // nothing, so it falls back to Input.
  $effect(() => {
    if (record && !FIXED.includes(shelf) && periodOf(shelf) === null) {
      shelf = 'input'
    }
  })

  load()
</script>

{#if loading}
  <p class="hint p-6">Opening the record…</p>
{:else if !record}
  <p class="alert alert-error m-6">{error}</p>
{:else}
  <div class="flex min-h-0 flex-1 flex-col">
    {#if shelf === 'input'}
      <div class="mx-auto w-full max-w-5xl shrink-0 px-6 pt-5">
        <div class="flex flex-wrap items-end gap-3">
          <div class="mr-auto">
            <h1 class="text-lg font-semibold tracking-tight">
              {record.course_code}
              <span class="muted font-normal">— {record.course_name}</span>
            </h1>
            <p class="hint mt-1">
              {record.program}
              {yearLevelName(record.year_level)} · AY {schoolYear(record)} · {termName(record.term)}
              {#if record.schedule}· {record.schedule}{/if}
            </p>
          </div>

          {#if saved}
            <span class="badge badge-success">Saved</span>
          {/if}
          <a href="/records/edit?id={record.id}" class="btn btn-sm btn-outline">Edit record</a>
        </div>

        {#if error}
          <p class="alert alert-error mt-4">{error}</p>
        {/if}
      </div>
    {/if}

    <!-- A grading period sheet does its own scrolling, in both directions, so
         the page must not also scroll underneath it: two nested scrollers would
         put the grid's horizontal bar at the bottom of a very tall page again,
         which is the thing being fixed. Every other sheet is an ordinary
         document and scrolls the page as usual. -->
    <div class="min-h-0 flex-1 {wide ? 'overflow-hidden' : 'overflow-auto'}">
      <div
        class={wide ? 'flex h-full flex-col px-6 pt-5 pb-3' : 'mx-auto w-full max-w-5xl px-6 py-5'}
      >
        {#if periods.length === 0 && shelf !== 'input'}
          <div class="card card-body">
            <p class="text-sm">This record has no grading scheme yet.</p>
            <p class="hint mt-1">
              A sheet needs to know what each period is worth and how a period grade is split up.
              Set both on the record and the period sheets appear along the bottom.
            </p>
            <div class="mt-3">
              <a href="/records/edit?id={record.id}" class="btn btn-sm btn-primary">
                Set the grading scheme
              </a>
            </div>
          </div>
        {:else if shelf === 'input'}
          <InputSheet {record} {rows} onchange={loadRows} />
        {:else if shelf === 'gpa'}
          <GpaSheet {record} {rows} {grades} />
        {:else if shelf === 'print'}
          <PrintSheet {record} {rows} {grades} />
        {:else}
          {@const period = periodOf(shelf)}
          {#if period && layout[period]}
            <!-- Keyed on the period: the sheet reads the stored marks once when
                 it is built, so moving to another period has to build a new one
                 rather than hand different columns to the same instance. -->
            {#key period}
              <PeriodSheet
                {record}
                {period}
                {rows}
                {grades}
                layout={layout[period]}
                onlayoutchange={saveLayout}
              />
            {/key}
          {/if}
        {/if}
      </div>
    </div>

    <SheetShelf {record} bind:shelf />
  </div>
{/if}
