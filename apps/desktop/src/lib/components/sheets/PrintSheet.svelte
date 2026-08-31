<script lang="ts">
  import { PERIOD_NAMES, activePeriods, periodWeight } from '$lib/db'
  import type { ClassRecord, Period, PeriodGrade, SheetRow } from '$lib/db'
  import { equivalentGrade, finalStanding, remarksFor, weightedShare } from '$lib/grades'
  import { schoolYear, termName, yearLevelName } from '$lib/format'

  /**
   * The class record as it goes on paper.
   *
   * This is the one sheet that is not a screen: it is a page at its real size,
   * with the school's letterhead, the course details, the grades and the four
   * signatures the registrar expects. The `@media print` rules in `app.css`
   * hide the whole app and leave the paper, so what is laid out here is exactly
   * what comes out of the printer — no separate print stylesheet to keep in
   * step, and no second copy of the table built for printing.
   *
   * Two things can be printed, the way 2024 offered them: the overall grades,
   * which is the GPA sheet with every period on it, or one period on its own.
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

  const periods = $derived(activePeriods(record))

  /** Which grades go on the paper: everything, or a single period. */
  let view = $state<'overall' | Period>('overall')
  let orientation = $state<'portrait' | 'landscape'>('portrait')

  /**
   * The class in alphabetical order.
   *
   * The sheets are in the order the instructor arranged them, because that is
   * their working copy. What leaves the room is a document other people read,
   * and 2024 sorted it by surname for exactly that reason.
   */
  const printed = $derived(
    [...rows].sort(
      (left, right) =>
        left.last_name.localeCompare(right.last_name) ||
        left.first_name.localeCompare(right.first_name),
    ),
  )

  const lines = $derived(
    printed.map((row) => ({
      row,
      standing: finalStanding(
        record,
        new Map(periods.map((period) => [period, grades.get(row.id)?.get(period)?.grade ?? null])),
      ),
    })),
  )

  /** One period on its own: the rating, what it earns, and the remark. */
  const periodLines = $derived(
    view === 'overall'
      ? []
      : printed.map((row) => {
          const grade = grades.get(row.id)?.get(view as Period)?.grade ?? null
          return {
            row,
            grade,
            equivalent: grade === null ? null : equivalentGrade(grade),
            remarks: grade === null ? null : remarksFor(grade),
          }
        }),
  )

  const heading = $derived(
    view === 'overall' ? 'Overall Grades' : `${PERIOD_NAMES[view as Period]} Grades`,
  )

  /**
   * The names under the signature lines.
   *
   * Kept in `localStorage` rather than the database: they are the same three
   * people on every record this laptop prints, they never sync anywhere, and a
   * dean's name is not part of a class record. 2024 stored the registrar and
   * the academic dean the same way, and typed them into the page directly.
   */
  const KEYS = { dean: 'print.dean', academic: 'print.academic', registrar: 'print.registrar' }

  function stored(key: string): string {
    try {
      return localStorage.getItem(key) ?? ''
    } catch {
      return ''
    }
  }

  function remember(key: string, value: string) {
    try {
      localStorage.setItem(key, value)
    } catch {
      // A locked-down webview is no reason to stop somebody printing.
    }
  }

  let dean = $state(stored(KEYS.dean))
  let academic = $state(stored(KEYS.academic))
  let registrar = $state(stored(KEYS.registrar))

  /**
   * The school letterhead, across the top of every printed record.
   *
   * It ships with the app, in `static/letterhead.png`. The block still takes
   * itself out if the file is not there, so a build that has lost the asset
   * prints a plain page rather than a broken image.
   */
  let letterhead = $state(true)

  function printPaper() {
    window.print()
  }
</script>

<!-- The page size follows the choice made here, so the print dialogue does not
     have to be told a second time. -->
<svelte:head>
  {#if orientation === 'landscape'}
    <style>
      @page {
        size: A4 landscape;
      }
    </style>
  {/if}
</svelte:head>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex shrink-0 flex-wrap items-center gap-3">
    <label class="flex items-center gap-2 text-sm">
      <span class="muted">Print</span>
      <select bind:value={view} class="select input-sm w-48">
        <option value="overall">Overall grades</option>
        {#each periods as period (period)}
          <option value={period}>{PERIOD_NAMES[period]}</option>
        {/each}
      </select>
    </label>

    <label class="flex items-center gap-2 text-sm">
      <span class="muted">Paper</span>
      <select bind:value={orientation} class="select input-sm w-36">
        <option value="portrait">Portrait</option>
        <option value="landscape">Landscape</option>
      </select>
    </label>

    <button type="button" onclick={printPaper} class="btn btn-sm btn-primary ml-auto">
      Print
    </button>
  </div>

  {#if periods.length === 0}
    <div class="card card-body mt-4">
      <p class="text-sm">There is nothing to print yet.</p>
      <p class="hint mt-1">
        A printed record is the grades of the periods this record uses. Give at least one period a
        weight and the paper fills in.
      </p>
      <div class="mt-3">
        <a href="/records/edit?id={record.id}" class="btn btn-sm btn-primary">Set the weights</a>
      </div>
    </div>
  {:else}
    <div class="mt-4 min-h-0 flex-1 overflow-auto py-8">
      <div
        class="paper border print:border-none {orientation === 'portrait'
          ? 'paper-portrait'
          : 'paper-landscape'}"
      >
        {#if letterhead}
          <img
            src="/letterhead.png"
            alt=""
            onerror={() => (letterhead = false)}
            class="mx-auto mb-2 max-h-24 w-auto"
          />
        {/if}

        <div class="mb-6 border-b border-black/40 px-2 pb-3">
          <div class="text-center">
            <h3 class="text-sm font-semibold">
              {termName(record.term)} / A.Y. {schoolYear(record)}
            </h3>
            <h4 class="text-xs font-semibold">{heading}</h4>
          </div>

          <div class="mt-4 flex flex-row flex-wrap gap-8 text-[10px]">
            <section class="flex grow gap-4">
              <div class="font-semibold whitespace-nowrap">
                <div>COURSE CODE:</div>
                <div>COURSE DESCRIPTION:</div>
                <div>SCHED:</div>
              </div>
              <div>
                <div>{record.course_code}</div>
                <div>{record.course_name}</div>
                <div>{record.schedule ?? '—'}</div>
              </div>
            </section>

            <section class="flex gap-4">
              <div class="font-semibold whitespace-nowrap">
                <div>INSTRUCTOR:</div>
                <div>PROGRAM:</div>
                <div>NO. OF STUDENTS:</div>
              </div>
              <div>
                <div>{record.instructor_name ?? '—'}</div>
                <div>
                  {record.program.toUpperCase()} — {yearLevelName(record.year_level)}
                </div>
                <div>{rows.length}</div>
              </div>
            </section>
          </div>
        </div>

        {#if rows.length === 0}
          <p class="py-8 text-center text-xs">
            Nobody is on this record yet. The class list is added on the Input sheet.
          </p>
        {:else if view === 'overall'}
          <table class="paper-table">
            <thead>
              <tr>
                <th rowspan="2">No</th>
                <th colspan="3">Name</th>
                <th rowspan="2">Prog / Yr</th>
                {#each periods as period (period)}
                  <th colspan="2">{PERIOD_NAMES[period]}</th>
                {/each}
                <th rowspan="2">Final ave.</th>
                <th rowspan="2">Eqv.</th>
                <th rowspan="2">Remarks</th>
              </tr>
              <tr>
                <th>Last name</th>
                <th>First name</th>
                <th>M.I.</th>
                {#each periods as period (period)}
                  <th>Grd</th>
                  <th>{periodWeight(record, period)}%</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each lines as line, index (line.row.id)}
                {@const partial = line.standing.missing.length > 0}
                <tr>
                  <td>{index + 1}</td>
                  <td class="paper-name">{line.row.last_name}</td>
                  <td class="paper-name">{line.row.first_name}</td>
                  <td>{line.row.middle_initial ?? ''}</td>
                  <td>
                    {line.row.program}{line.row.year_level ? ` - ${line.row.year_level}` : ''}
                  </td>

                  {#each periods as period (period)}
                    {@const rating = line.standing.ratings.get(period) ?? null}
                    <td>{rating === null ? '' : rating.toFixed(2)}</td>
                    <td>
                      {rating === null ? '' : weightedShare(record, period, rating).toFixed(2)}
                    </td>
                  {/each}

                  <td>{partial ? '' : line.standing.average.toFixed(2)}</td>
                  <td>
                    {partial || line.standing.equivalent === null
                      ? ''
                      : line.standing.equivalent.toFixed(1)}
                  </td>
                  <td
                    class={partial
                      ? ''
                      : line.standing.remarks === 'PASSED'
                        ? 'paper-pass'
                        : 'paper-fail'}
                  >
                    {partial ? '' : line.standing.remarks}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <table class="paper-table">
            <thead>
              <tr>
                <th rowspan="2">No</th>
                <th colspan="3">Name</th>
                <th rowspan="2">Prog / Yr</th>
                <th rowspan="2">Grade</th>
                <th rowspan="2">Eqv.</th>
                <th rowspan="2">Remarks</th>
              </tr>
              <tr>
                <th>Last name</th>
                <th>First name</th>
                <th>M.I.</th>
              </tr>
            </thead>
            <tbody>
              {#each periodLines as line, index (line.row.id)}
                <tr>
                  <td>{index + 1}</td>
                  <td class="paper-name">{line.row.last_name}</td>
                  <td class="paper-name">{line.row.first_name}</td>
                  <td>{line.row.middle_initial ?? ''}</td>
                  <td>
                    {line.row.program}{line.row.year_level ? ` - ${line.row.year_level}` : ''}
                  </td>
                  <td>{line.grade === null ? '' : line.grade.toFixed(2)}</td>
                  <td>{line.equivalent === null ? '' : line.equivalent.toFixed(1)}</td>
                  <td
                    class={line.remarks === null
                      ? ''
                      : line.remarks === 'PASSED'
                        ? 'paper-pass'
                        : 'paper-fail'}
                  >
                    {line.remarks ?? ''}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}

        <!-- The signatures sit at the foot of the page whatever the class list
             comes to, which is what `mt-auto` on a page of a fixed height buys. -->
        <div class="mt-auto pt-12 text-[10px]">
          <div class="flex flex-row justify-between gap-8">
            <div>
              <p class="mb-6">Prepared by:</p>
              <p class="border-b border-black/70 px-2 pb-0.5 font-semibold">
                {record.instructor_name ?? ''}
              </p>
              <p class="mt-1 text-center">Instructor</p>
            </div>

            <div>
              <p class="mb-6">Attested by:</p>
              <input
                bind:value={dean}
                onchange={() => remember(KEYS.dean, dean)}
                placeholder="Name"
                aria-label="Dean"
                class="w-56 border-0 border-b border-black/70 bg-transparent px-2 pb-0.5 text-center font-semibold uppercase focus:outline-none"
              />
              <p class="mt-1 text-center">Dean — {record.program.toUpperCase()} Department</p>
            </div>
          </div>

          <div class="mt-10 flex flex-row justify-between gap-8">
            <div>
              <p class="mb-6">Noted by:</p>
              <input
                bind:value={academic}
                onchange={() => remember(KEYS.academic, academic)}
                placeholder="Name"
                aria-label="Dean for Academic Affairs"
                class="w-56 border-0 border-b border-black/70 bg-transparent px-2 pb-0.5 text-center font-semibold uppercase focus:outline-none"
              />
              <p class="mt-1 text-center">Dean for Academic Affairs</p>
            </div>

            <div>
              <p class="mb-6">Received by:</p>
              <input
                bind:value={registrar}
                onchange={() => remember(KEYS.registrar, registrar)}
                placeholder="Name"
                aria-label="School registrar"
                class="w-56 border-0 border-b border-black/70 bg-transparent px-2 pb-0.5 text-center font-semibold uppercase focus:outline-none"
              />
              <p class="mt-1 text-center">School Registrar</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
