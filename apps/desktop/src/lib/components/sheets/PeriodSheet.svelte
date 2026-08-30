<script lang="ts">
  import {
    COMPONENTS,
    COMPONENT_NAMES,
    LIST_COMPONENTS,
    PERIOD_NAMES,
    SINGLE_COMPONENTS,
    componentShare,
    savePeriodGrade,
  } from '$lib/db'
  import type {
    ClassRecord,
    ListComponent,
    Period,
    PeriodGrade,
    PeriodLayout,
    RawScores,
    SheetRow,
    SingleComponent,
  } from '$lib/db'
  import {
    componentEquivalent,
    componentPercentage,
    fitScores,
    hasAnyMark,
    hasMissingMarks,
    newColumnPerfect,
    perfectScore,
    periodRating,
    rawTotal,
  } from '$lib/grades'
  import { untrack } from 'svelte'

  /**
   * One grading period's sheet: the class list down the side, the work across
   * the top, and the rating worked out on the right.
   *
   * The 2024 sheet was a fixed grid of seventy-one columns with the unused ones
   * hidden, because the widget it was built on could not do better; adding a
   * quiz revealed the next of fifteen reserved slots and there was no way back.
   * Here the columns are only what the layout says they are, so adding one
   * really adds one and removing one really removes it.
   *
   * The header is two rows, the way it has always been printed: the component
   * and its share of the grade above, what each piece of work is out of below.
   * Both are merged over their group, so the shape of the grade is readable
   * before a single mark is.
   */

  let {
    record,
    period,
    layout,
    rows,
    grades,
    onlayoutchange,
  }: {
    record: ClassRecord
    period: Period
    layout: PeriodLayout
    rows: SheetRow[]
    grades: Map<number, Map<Period, PeriodGrade>>
    onlayoutchange: () => Promise<void>
  } = $props()

  /**
   * The marks on show, by enrollment.
   *
   * Read once, here, rather than derived from the stored grades on every
   * keystroke: the cells are bound to this, and it is what gets written back.
   * `fitScores` squares each stored row against the columns as they stand now,
   * so a row saved before a column was added shows a blank in it instead of
   * running off the end of its own array. The sheet is rebuilt when the shelf
   * moves to another period, which is the only time the roster can have
   * changed underneath it.
   */
  let marks = $state<Record<number, RawScores>>(
    // Deliberately the values as they are now, not a running view of them:
    // `untrack` says so, and keeps the compiler from warning about it.
    untrack(() =>
      Object.fromEntries(
        rows.map((row) => [
          row.id,
          fitScores(layout, grades.get(row.id)?.get(period)?.raw_scores ?? null),
        ])
      )
    )
  )

  let error = $state('')

  const usedLists = $derived(
    LIST_COMPONENTS.filter((component) => componentShare(record, component) > 0)
  )
  const usedSingles = $derived(
    SINGLE_COMPONENTS.filter((component) => componentShare(record, component) > 0)
  )
  const used = $derived(COMPONENTS.filter((component) => componentShare(record, component) > 0))

  /** Components carrying a share that still have nothing to be marked out of. */
  const needPerfect = $derived(used.filter((component) => perfectScore(layout, component) <= 0))

  /** How wide a component's group header has to be: its columns, then TOTAL/GRD/EQV. */
  function groupWidth(component: ListComponent): number {
    return layout[component].length + 3
  }

  function show(value: number | null): string {
    return value === null ? '—' : String(value)
  }

  /**
   * Write one student's marks and the rating they come to.
   *
   * The rating is stored beside the marks rather than worked out again when it
   * is read, because the student portal reads this row over the network and has
   * no business knowing the arithmetic.
   */
  async function store(row: SheetRow) {
    const scores = $state.snapshot(marks[row.id]) as RawScores

    try {
      await savePeriodGrade(
        row.id,
        period,
        periodRating(record, layout, scores).rating,
        hasMissingMarks(record, layout, scores),
        scores
      )
      error = ''
    } catch (failure) {
      error = `That mark could not be saved: ${failure}`
    }
  }

  /**
   * Every rating on the sheet, again.
   *
   * Changing what a piece of work is out of changes every student's percentage
   * for it, so the stored ratings go stale the moment a header cell is edited.
   * Rows nobody has marked yet are skipped: they have nothing to recompute, and
   * writing them would put a queue of empty rows in front of the next sync.
   */
  async function restate() {
    for (const row of rows) {
      if (hasAnyMark(marks[row.id])) {
        await store(row)
      }
    }
  }

  async function saveLayout() {
    try {
      await onlayoutchange()
      await restate()
    } catch (failure) {
      error = `The columns could not be saved: ${failure}`
    }
  }

  function addColumn(component: ListComponent) {
    layout[component].push(newColumnPerfect(component))

    // An attendance column starts as an absence rather than a blank: the box is
    // there to be ticked, and an unticked one is an answer.
    for (const row of rows) {
      marks[row.id][component].push(component === 'at' ? 0 : null)
    }

    saveLayout()
  }

  /**
   * Take the last column off. Only the last, and never the only one — a
   * component the record grades has to keep somewhere to put a mark, or its
   * percentage becomes impossible to work out and the whole rating stops.
   */
  function removeColumn(component: ListComponent) {
    if (layout[component].length <= 1) {
      return
    }

    layout[component].pop()
    for (const row of rows) {
      marks[row.id][component].pop()
    }

    saveLayout()
  }

  /** A piece of work is out of a whole number of marks, and at least one. */
  function commitPerfect(component: ListComponent, index: number) {
    const value = Math.round(Number(layout[component][index]) || 0)
    layout[component][index] = value > 0 ? value : 1
    saveLayout()
  }

  function commitSinglePerfect(component: SingleComponent) {
    const value = Math.round(Number(layout[component]) || 0)
    layout[component] = value > 0 ? value : null
    saveLayout()
  }

  /**
   * A mark is never negative. It is allowed above the perfect score, because a
   * teacher who gives two bonus points should not have to argue with the sheet
   * about it.
   */
  function clamp(value: number | null): number | null {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return null
    }
    return Math.max(0, value)
  }

  function commitMark(row: SheetRow, component: ListComponent, index: number) {
    marks[row.id][component][index] = clamp(marks[row.id][component][index])
    store(row)
  }

  function commitSingle(row: SheetRow, component: SingleComponent) {
    marks[row.id][component] = clamp(marks[row.id][component])
    store(row)
  }

  function markDay(row: SheetRow, index: number, present: boolean) {
    marks[row.id].at[index] = present ? 1 : 0
    store(row)
  }
</script>

<!-- The sheet fills the height it is given and scrolls inside itself, so the
     horizontal bar stays at the foot of the grid rather than at the foot of a
     class list forty students long. Everything but the grid is `shrink-0`; the
     grid is what gives way when there is not enough room. -->
<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex shrink-0 flex-wrap items-end gap-3">
    <div class="mr-auto">
      <h2 class="text-base font-semibold tracking-tight">{PERIOD_NAMES[period]}</h2>
      <p class="hint mt-1">
        Marks for this period. The row under each component heading is what that piece of work is
        out of; the columns after it are worked out. A name in red is a student with a mark still
        missing, and marks save as you leave each cell.
      </p>
    </div>
  </div>

  {#if error}
    <p class="alert alert-error mt-4 shrink-0">{error}</p>
  {/if}

  {#if used.length === 0}
    <div class="card card-body mt-4">
      <p class="text-sm">Every component on this record is set to 0%.</p>
      <p class="hint mt-1">
        A period grade is split between quizzes, attendance, assignments and the rest. Until the
        record says how, there is nothing on this sheet to fill in.
      </p>
      <div class="mt-3">
        <a href="/records/edit?id={record.id}" class="btn btn-sm btn-primary">Set the percentages</a>
      </div>
    </div>
  {:else if rows.length === 0}
    <p class="hint mt-6">
      Nobody is on this record yet. Add the class list on the Input sheet and their rows appear
      here.
    </p>
  {:else}
    {#if needPerfect.length > 0}
      <p class="alert alert-warning mt-4">
        No perfect score yet for
        {needPerfect.map((component) => COMPONENT_NAMES[component].toLowerCase()).join(', ')}. Until
        there is one, that part cannot be worked out and the rating stays blank.
      </p>
    {/if}

    <div class="card mt-4 min-h-0 flex-1 overflow-auto">
      <table class="sheet">
        <thead>
          <tr>
            <th rowspan="2" class="sheet-fixed">No</th>
            <th rowspan="2" class="sheet-fixed">Last name</th>
            <th rowspan="2" class="sheet-fixed">First name</th>
            <th rowspan="2" class="sheet-fixed">M.I.</th>
            <th rowspan="2" class="sheet-fixed">Program</th>

            {#each usedLists as component (component)}
              <th colspan={groupWidth(component)} class="sheet-group sheet-{component}">
                <span class="inline-flex items-center gap-2">
                  <span>
                    {COMPONENT_NAMES[component]}
                    <span class="muted font-normal">({componentShare(record, component)}%)</span>
                  </span>
                  <span class="inline-flex items-center">
                    <button
                      type="button"
                      onclick={() => removeColumn(component)}
                      disabled={layout[component].length <= 1}
                      title="Remove the last column"
                      aria-label="Remove the last {COMPONENT_NAMES[component]} column"
                      class="btn btn-sm btn-ghost px-1.5 py-0.5"
                    >
                      &minus;
                    </button>
                    <button
                      type="button"
                      onclick={() => addColumn(component)}
                      title={component === 'at' ? 'Add a meeting' : 'Add a column'}
                      aria-label="Add a {COMPONENT_NAMES[component]} column"
                      class="btn btn-sm btn-ghost px-1.5 py-0.5"
                    >
                      +
                    </button>
                  </span>
                </span>
              </th>
            {/each}

            {#each usedSingles as component (component)}
              <th colspan="3" class="sheet-group sheet-{component}">
                {COMPONENT_NAMES[component]}
                <span class="muted font-normal">({componentShare(record, component)}%)</span>
              </th>
            {/each}

            <th rowspan="2" class="sheet-fixed">Rating</th>
          </tr>

          <tr>
            {#each usedLists as component (component)}
              {#each layout[component] as _, index (index)}
                <th class="sheet-{component}">
                  {#if component === 'at'}
                    <!-- A meeting is present or absent, so there is nothing to set:
                         the heading is which meeting it was. -->
                    <span class="muted font-normal">{index + 1}</span>
                  {:else}
                    <input
                      bind:value={layout[component][index]}
                      onchange={() => commitPerfect(component, index)}
                      type="number"
                      min="1"
                      step="1"
                      aria-label="{COMPONENT_NAMES[component]} {index + 1} is out of"
                      class="sheet-input"
                    />
                  {/if}
                </th>
              {/each}
              <th class="sheet-{component}">TOTAL ({perfectScore(layout, component)})</th>
              <th class="sheet-{component}">GRD</th>
              <th class="sheet-{component}">EQV</th>
            {/each}

            {#each usedSingles as component (component)}
              <th class="sheet-{component}">
                <input
                  bind:value={layout[component]}
                  onchange={() => commitSinglePerfect(component)}
                  type="number"
                  min="1"
                  step="1"
                  placeholder="out of"
                  aria-label="{COMPONENT_NAMES[component]} is out of"
                  class="sheet-input"
                />
              </th>
              <th class="sheet-{component}">GRD</th>
              <th class="sheet-{component}">EQV</th>
            {/each}
          </tr>
        </thead>

        <tbody>
          {#each rows as row, index (row.id)}
            {@const scores = marks[row.id]}
            {@const lacking = hasMissingMarks(record, layout, scores)}
            {@const rating = periodRating(record, layout, scores).rating}
            <tr>
              <td class="sheet-fixed">{index + 1}</td>
              <td class="sheet-name {lacking ? 'sheet-lacking' : ''}">{row.last_name}</td>
              <td class="sheet-name {lacking ? 'sheet-lacking' : ''}">{row.first_name}</td>
              <td class="muted">{row.middle_initial ?? ''}</td>
              <td class="muted">
                {row.program}{row.year_level ? ` - ${row.year_level}` : ''}
              </td>

              {#each usedLists as component (component)}
                {#each layout[component] as _, column (column)}
                  <td>
                    {#if component === 'at'}
                      <input
                        checked={scores.at[column] === 1}
                        onchange={(event) => markDay(row, column, event.currentTarget.checked)}
                        type="checkbox"
                        aria-label="{row.last_name}, meeting {column + 1}"
                        class="align-middle"
                      />
                    {:else}
                      <input
                        bind:value={scores[component][column]}
                        onchange={() => commitMark(row, component, column)}
                        type="number"
                        min="0"
                        step="any"
                        aria-label="{row.last_name}, {COMPONENT_NAMES[component]} {column + 1}"
                        class="sheet-input"
                      />
                    {/if}
                  </td>
                {/each}
                <td class="sheet-{component} sheet-derived">{rawTotal(scores, component)}</td>
                <td class="sheet-{component} sheet-derived">
                  {show(componentPercentage(layout, scores, component))}
                </td>
                <td class="sheet-{component} sheet-derived">
                  {show(componentEquivalent(record, layout, scores, component))}
                </td>
              {/each}

              {#each usedSingles as component (component)}
                <td>
                  <input
                    bind:value={scores[component]}
                    onchange={() => commitSingle(row, component)}
                    type="number"
                    min="0"
                    step="any"
                    aria-label="{row.last_name}, {COMPONENT_NAMES[component]}"
                    class="sheet-input"
                  />
                </td>
                <td class="sheet-{component} sheet-derived">
                  {show(componentPercentage(layout, scores, component))}
                </td>
                <td class="sheet-{component} sheet-derived">
                  {show(componentEquivalent(record, layout, scores, component))}
                </td>
              {/each}

              <td
                class="sheet-derived {rating === null
                  ? 'sheet-empty'
                  : rating <= 75
                    ? 'sheet-fail'
                    : 'sheet-pass'}"
              >
                {show(rating)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
