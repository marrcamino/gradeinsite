<script lang="ts">
  import {
    DISTRIBUTION_ROWS,
    PERIOD_LABELS,
    PERIOD_ORDER,
    fetchCourse,
    formatGrade,
    formatPercent,
    formatSchoolYear,
    formatTerm,
    remarkClass,
    type CourseDetail,
    type PeriodGrade,
    type Remark,
  } from './records'

  /**
   * One course's grades.
   *
   * The 2024 screen had four parts in this order - the overall percentage, the
   * grade in each period, PERCENTAGE DISTRIBUTION and GRADE COMPONENTS - and
   * this reproduces them, down to the two tables' COMPONENTS / PERCENTAGE
   * headings and the upper-case row labels.
   *
   * Every number shown here was computed on the instructor's laptop and pushed
   * up. Nothing is worked out in the browser, so what a student reads is what
   * is on the printed class record.
   */

  let { recordId, onback }: { recordId: number; onback: () => void } = $props()

  let course = $state<CourseDetail | null>(null)
  let periods = $state<PeriodGrade[]>([])
  let finalGrade = $state<number | null>(null)
  let remarks = $state<Remark | null>(null)
  let error = $state('')
  let loading = $state(true)

  async function load() {
    loading = true
    error = ''

    const result = await fetchCourse(recordId)

    if (result.ok) {
      course = result.data.record
      periods = result.data.periods
      finalGrade = result.data.final_grade
      remarks = result.data.remarks
    } else {
      error = result.message
    }

    loading = false
  }

  load()

  /** True while the instructor still has periods left to mark. */
  const inProgress = $derived(periods.some((period) => period.grade === null))
</script>

<section class="mx-auto w-full max-w-3xl px-6 py-8">
  <button class="btn btn-ghost btn-sm -ml-2" onclick={onback}>
    <svg class="h-4 w-4" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
      <path
        d="M13.28125 6.78125L4.78125 15.28125L4.09375 16L4.78125 16.71875L13.28125 25.21875L14.71875 23.78125L7.9375 17L28 17L28 15L7.9375 15L14.71875 8.21875Z"
      />
    </svg>
    My courses
  </button>

  {#if loading}
    <p class="mt-6 text-sm muted">Loading…</p>
  {:else if error}
    <div class="mt-6 alert alert-error" role="alert">
      <p>{error}</p>
      <button class="link mt-1" onclick={load}>Try again</button>
    </div>
  {:else if course}
    <header class="mt-4">
      <h1 class="text-xl font-bold tracking-tight">
        {course.course_code} | {course.course_name}
      </h1>
      <p class="mt-1 text-xs muted">
        {formatTerm(course.term)} · SY {formatSchoolYear(course)}
        {#if course.schedule}
          · {course.schedule}
        {/if}
        {#if course.instructor_name}
          · {course.instructor_name}
        {/if}
      </p>
    </header>

    <!-- The overall figure, the way 2024 led with it. -->
    <div class="mt-6 card">
      <div class="card-body flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span class="text-4xl font-bold tabular-nums text-primary">
          {formatGrade(finalGrade)}{#if finalGrade !== null}<span class="text-2xl">%</span>{/if}
        </span>
        <span class="text-sm font-semibold">Overall</span>

        {#if remarks}
          <span class={remarkClass(remarks)}>{remarks}</span>
        {/if}

        {#if inProgress}
          <p class="w-full text-xs muted">
            This term is still being marked, so the overall grade is not final yet.
          </p>
        {/if}
      </div>
    </div>

    <!-- The grade in each period the record uses. -->
    <div class="mt-6 card overflow-hidden">
      <div class="card-header"><h2 class="card-title">GRADES</h2></div>
      <table class="table">
        <thead>
          <tr>
            <th scope="col">PERIOD</th>
            <th scope="col">WEIGHT</th>
            <th scope="col">GRADE</th>
          </tr>
        </thead>
        <tbody>
          {#each periods as period (period.period)}
            <tr>
              <th scope="row" class="font-medium">{PERIOD_LABELS[period.period]}</th>
              <td class="tabular-nums muted">{formatPercent(period.weight)}</td>
              <td class="tabular-nums">
                {#if period.grade === null}
                  <span class="muted">Not yet marked</span>
                {:else}
                  <span class="font-medium">{formatGrade(period.grade)}</span>
                  {#if period.is_incomplete}
                    <span class="badge badge-warning ml-2">INCOMPLETE</span>
                  {/if}
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="mt-6 grid gap-6 sm:grid-cols-2">
      <!-- Within one period, what each kind of work is worth. -->
      <div class="card overflow-hidden">
        <div class="card-header"><h2 class="card-title">PERCENTAGE DISTRIBUTION</h2></div>
        <table class="table">
          <thead>
            <tr>
              <th scope="col">COMPONENTS</th>
              <th scope="col">PERCENTAGE</th>
            </tr>
          </thead>
          <tbody>
            {#each DISTRIBUTION_ROWS as row (row.key)}
              <tr>
                <th scope="row" class="font-medium">{row.label}</th>
                <td class="tabular-nums">{formatPercent(course.distribution[row.key])}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- What each grading period is worth. All five are listed, as 2024
           listed them, so a period the school does not use reads as 0%. -->
      <div class="card overflow-hidden">
        <div class="card-header"><h2 class="card-title">GRADE COMPONENTS</h2></div>
        <table class="table">
          <thead>
            <tr>
              <th scope="col">COMPONENTS</th>
              <th scope="col">PERCENTAGE</th>
            </tr>
          </thead>
          <tbody>
            {#each PERIOD_ORDER as period (period)}
              <tr>
                <th scope="row" class="font-medium uppercase">{PERIOD_LABELS[period]}</th>
                <td class="tabular-nums" class:muted={course.weights[period] === 0}>
                  {formatPercent(course.weights[period])}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</section>
