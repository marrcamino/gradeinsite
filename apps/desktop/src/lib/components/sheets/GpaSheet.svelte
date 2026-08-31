<script lang="ts">
  import { PERIOD_NAMES, activePeriods, periodWeight, saveFinalGrade } from '$lib/db'
  import type { ClassRecord, Period, PeriodGrade, Remark, SheetRow } from '$lib/db'
  import type { FinalStanding } from '$lib/grades'
  import { finalStanding, weightedShare } from '$lib/grades'

  /**
   * The GPA sheet: every period grade on one page, weighted into a final
   * average, an equivalent point and a remark.
   *
   * Nothing here is typed into. The marks are entered on the period sheets and
   * this reads them back, which is why the whole table is derived — coming to
   * this sheet after entering marks shows the new figures on its own, where the
   * 2024 sheet had to re-query the database and redraw the grid every time the
   * shelf moved.
   *
   * Each period the record grades gets a pair of columns, the way it has always
   * been printed: the rating the student earned, then that rating cut down to
   * the period's weight. The pairs add up across to the final average.
   */

  let {
    record,
    rows,
    grades,
  }: {
    record: ClassRecord
    rows: SheetRow[]
    grades: Map<number, Map<Period, PeriodGrade>>
  } = $props()

  let error = $state('')

  const periods = $derived(activePeriods(record))

  /** The weights should come to 100; if they do not, every average is short. */
  const weightTotal = $derived(
    periods.reduce((total, period) => total + periodWeight(record, period), 0)
  )

  interface Line extends FinalStanding {
    row: SheetRow
  }

  const lines = $derived<Line[]>(
    rows.map((row) => ({
      row,
      ...finalStanding(
        record,
        new Map(periods.map((period) => [period, grades.get(row.id)?.get(period)?.grade ?? null]))
      ),
    }))
  )

  const incomplete = $derived(lines.filter((line) => line.missing.length > 0).length)

  /**
   * What has already been written back, by enrollment.
   *
   * Deliberately a plain Map rather than state: it is only here to stop the
   * same figures being saved twice, and making it reactive would have this
   * effect re-run on its own writes.
   */
  const persisted = new Map<number, string>()

  function signature(grade: number | null, remarks: Remark | null): string {
    return `${grade}|${remarks}`
  }

  /**
   * Keep the enrollment's final grade in step with the sheet.
   *
   * The student portal reads `final_grade` and `remarks` off the enrollment row
   * over the network; it does not know the grading scheme and should not have
   * to. So the figures printed here are what get written back — but only once a
   * student has a rating in every period the record grades. A term-in-progress
   * average is genuinely low rather than wrong, and putting that in front of a
   * student in October would read as a failing grade.
   */
  $effect(() => {
    void persist(lines)
  })

  async function persist(current: Line[]) {
    for (const line of current) {
      const settled = periods.length > 0 && line.missing.length === 0
      const grade = settled ? line.average : null
      const remarks = settled ? line.remarks : null

      const stored = persisted.get(line.row.id) ?? signature(line.row.final_grade, line.row.remarks)
      if (stored === signature(grade, remarks)) {
        continue
      }

      try {
        await saveFinalGrade(line.row.id, grade, remarks)
        persisted.set(line.row.id, signature(grade, remarks))
      } catch (failure) {
        error = `The final grade could not be saved: ${failure}`
        return
      }
    }
  }

  const DASH = '—'

  function show(value: number | null): string {
    return value === null ? DASH : value.toFixed(2)
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="shrink-0">
    <h2 class="text-base font-semibold tracking-tight">GPA</h2>
    <p class="hint mt-1">
      Every period grade weighted into one final average. Nothing is entered here — the marks come
      from the period sheets, and a student's grade reaches the portal once all their periods are
      in.
    </p>
  </div>

  {#if error}
    <p class="alert alert-error mt-4 shrink-0">{error}</p>
  {/if}

  {#if periods.length === 0}
    <div class="card card-body mt-4">
      <p class="text-sm">This record grades no periods yet.</p>
      <p class="hint mt-1">
        A final average is the periods added up by weight. Give at least one period a weight and it
        appears here.
      </p>
      <div class="mt-3">
        <a href="/records/edit?id={record.id}" class="btn btn-sm btn-primary">Set the weights</a>
      </div>
    </div>
  {:else if rows.length === 0}
    <p class="hint mt-6">
      Nobody is on this record yet. Add the class list on the Input sheet and their averages appear
      here.
    </p>
  {:else}
    {#if weightTotal !== 100}
      <p class="alert alert-warning mt-4">
        The period weights come to {weightTotal}%, not 100%. Every average on this sheet is out by
        the difference until the record is corrected.
      </p>
    {/if}

    {#if incomplete > 0}
      <p class="alert alert-warning mt-4">
        {incomplete === 1 ? 'One student has' : `${incomplete} students have`} a period with no grade
        yet, so their average is only what has been marked so far. Those rows are not sent to the
        student portal.
      </p>
    {/if}

    <div class="card mt-4 min-h-0 flex-1 overflow-auto">
      <table class="sheet">
        <thead>
          <tr>
            <th rowspan="2" class="sheet-fixed">No</th>
            <th colspan="3" class="sheet-group">Name</th>
            <th rowspan="2" class="sheet-fixed">Prog / Yr</th>

            {#each periods as period (period)}
              <th colspan="2" class="sheet-group">{PERIOD_NAMES[period].toUpperCase()}</th>
            {/each}

            <th rowspan="2" class="sheet-fixed">Final ave.</th>
            <th rowspan="2" class="sheet-fixed">Eqv.</th>
            <th rowspan="2" class="sheet-fixed">Remarks</th>
          </tr>

          <tr>
            <th class="sheet-fixed">Last name</th>
            <th class="sheet-fixed">First name</th>
            <th class="sheet-fixed">M.I.</th>

            {#each periods as period (period)}
              <th>GRD</th>
              <th class="muted font-normal">{periodWeight(record, period)}%</th>
            {/each}
          </tr>
        </thead>

        <tbody>
          {#each lines as line, index (line.row.id)}
            {@const partial = line.missing.length > 0}
            <tr>
              <td class="sheet-fixed">{index + 1}</td>
              <td class="sheet-name">{line.row.last_name}</td>
              <td class="sheet-name">{line.row.first_name}</td>
              <td class="muted">{line.row.middle_initial ?? ''}</td>
              <td class="muted">
                {line.row.program}{line.row.year_level ? ` - ${line.row.year_level}` : ''}
              </td>

              {#each periods as period (period)}
                {@const rating = line.ratings.get(period) ?? null}
                <td class="sheet-derived">{show(rating)}</td>
                <td class="sheet-derived">
                  {rating === null ? DASH : weightedShare(record, period, rating).toFixed(2)}
                </td>
              {/each}

              <!-- A partial average is still shown, because a term in progress is
                   worth seeing, but it is greyed so it does not read as final. -->
              <td class="sheet-derived {partial ? 'sheet-empty' : ''}">
                {line.average.toFixed(2)}
              </td>
              <td class="sheet-derived {partial ? 'sheet-empty' : ''}">
                {line.equivalent === null ? DASH : line.equivalent.toFixed(1)}
              </td>
              <td
                class="sheet-derived {partial
                  ? 'sheet-empty'
                  : line.remarks === 'PASSED'
                    ? 'sheet-pass'
                    : 'sheet-fail'}"
              >
                {partial ? DASH : line.remarks}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
