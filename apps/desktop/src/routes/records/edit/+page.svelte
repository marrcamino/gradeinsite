<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import {
    COMPONENTS,
    COMPONENT_NAMES,
    PERIODS,
    PERIOD_NAMES,
    createClassRecord,
    describeInvalid,
    getClassRecord,
    listClassRecords,
    updateClassRecord,
  } from '$lib/db'
  import type { ClassRecordInput, Component, Period } from '$lib/db'
  import { session } from '$lib/session.svelte'

  /**
   * One class record, being created or corrected.
   *
   * The two grading tables are the point of the screen. They decide what the
   * sheet looks like and how a final grade is worked out, and the database
   * refuses anything that does not add to 100, so the totals are on screen
   * while they are being typed rather than only after a failed save.
   */

  const id = $derived(Number(page.url.searchParams.get('id')) || null)

  let draft = $state({
    program: '',
    year_level: 1,
    course_code: '',
    course_name: '',
    term: 1,
    school_year_start: new Date().getFullYear(),
    schedule: '',
    instructor_name: '',
  })

  // Kept apart from the flat columns so the two tables can be drawn by looping
  // over the period and component lists instead of naming eleven fields twice.
  let weights = $state<Record<Period, number | null>>({
    prelim: 0,
    premid: 0,
    midterm: 0,
    prefinal: 0,
    final: 0,
  })

  let shares = $state<Record<Component, number | null>>({
    qe: 0,
    at: 0,
    as: 0,
    co: 0,
    op: 0,
    me: 0,
  })

  let programs = $state<string[]>([])
  let loading = $state(true)
  let saving = $state(false)
  let error = $state('')

  const editing = $derived(id !== null)
  const weightTotal = $derived(PERIODS.reduce((sum, p) => sum + whole(weights[p]), 0))
  const shareTotal = $derived(COMPONENTS.reduce((sum, c) => sum + whole(shares[c]), 0))

  /**
   * Percentages are whole numbers here. The schema checks that they sum to
   * exactly 100, and a column of decimals can miss that by a rounding error
   * nobody can see in the form.
   */
  function whole(value: number | null): number {
    return Math.round(Number(value) || 0)
  }

  function totalBadge(total: number): string {
    if (total === 100) {
      return 'badge badge-success'
    }
    return total === 0 ? 'badge badge-neutral' : 'badge badge-danger'
  }

  async function load() {
    // Programs already used, so the same one is not typed three different ways.
    const existing = await listClassRecords()
    programs = [...new Set(existing.map((record) => record.program))].sort()

    if (id === null) {
      draft.instructor_name = session.displayName
      loading = false
      return
    }

    const record = await getClassRecord(id)
    if (!record) {
      error = 'That class record is no longer on this laptop.'
      loading = false
      return
    }

    draft = {
      program: record.program,
      year_level: record.year_level,
      course_code: record.course_code,
      course_name: record.course_name,
      term: record.term,
      school_year_start: record.school_year_start,
      schedule: record.schedule ?? '',
      instructor_name: record.instructor_name ?? '',
    }

    weights = {
      prelim: record.weight_prelim,
      premid: record.weight_premid,
      midterm: record.weight_midterm,
      prefinal: record.weight_prefinal,
      final: record.weight_final,
    }

    shares = {
      qe: record.pct_quizzes,
      at: record.pct_attendance,
      as: record.pct_assignment,
      co: record.pct_course_output,
      op: record.pct_oral,
      me: record.pct_major_exam,
    }

    loading = false
  }

  function toInput(): ClassRecordInput {
    return {
      program: draft.program,
      year_level: Number(draft.year_level),
      course_code: draft.course_code,
      course_name: draft.course_name,
      term: Number(draft.term),
      school_year_start: Number(draft.school_year_start),
      schedule: draft.schedule,
      instructor_name: draft.instructor_name,
      weight_prelim: whole(weights.prelim),
      weight_premid: whole(weights.premid),
      weight_midterm: whole(weights.midterm),
      weight_prefinal: whole(weights.prefinal),
      weight_final: whole(weights.final),
      pct_quizzes: whole(shares.qe),
      pct_attendance: whole(shares.at),
      pct_assignment: whole(shares.as),
      pct_course_output: whole(shares.co),
      pct_oral: whole(shares.op),
      pct_major_exam: whole(shares.me),
    }
  }

  /** The fields the shared validator does not cover, then the ones it does. */
  function problem(input: ClassRecordInput): string | null {
    if (!input.program.trim()) {
      return 'Choose or type the program this course belongs to.'
    }
    if (!Number.isInteger(input.school_year_start) || input.school_year_start < 2000) {
      return 'Enter the year the school year starts in, like 2026.'
    }
    return describeInvalid(input)
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    const input = toInput()
    error = problem(input) ?? ''

    if (error) {
      return
    }

    saving = true
    try {
      if (id === null) {
        await createClassRecord(input)
      } else {
        await updateClassRecord(id, input)
      }
      await goto('/records')
    } catch (failure) {
      error = `The record could not be saved: ${failure}`
      saving = false
    }
  }

  load()
</script>

<main class="mx-auto w-full max-w-5xl flex-1 overflow-auto px-6 py-6">
  <a href="/records" class="link text-xs">&larr; Class records</a>

  <h1 class="mt-3 text-xl font-semibold tracking-tight">
    {editing ? 'Edit class record' : 'New class record'}
  </h1>

  {#if loading}
    <p class="hint mt-2">Loading…</p>
  {:else}
    <form onsubmit={submit} class="mt-6 space-y-6">
      <section class="card">
        <div class="card-header">
          <h2 class="card-title">Course</h2>
        </div>

        <div class="card-body grid gap-4 sm:grid-cols-2">
          <div class="space-y-1">
            <label class="label" for="program">Program</label>
            <input
              id="program"
              bind:value={draft.program}
              list="programs"
              placeholder="BSIT"
              autocomplete="off"
              class="input"
            />
            <datalist id="programs">
              {#each programs as program (program)}
                <option value={program}></option>
              {/each}
            </datalist>
          </div>

          <div class="space-y-1">
            <label class="label" for="year-level">Year level</label>
            <select id="year-level" bind:value={draft.year_level} class="select">
              {#each [1, 2, 3, 4, 5, 6] as level (level)}
                <option value={level}>{level}</option>
              {/each}
            </select>
          </div>

          <div class="space-y-1">
            <label class="label" for="course-code">Course code</label>
            <input
              id="course-code"
              bind:value={draft.course_code}
              placeholder="IT 311"
              autocomplete="off"
              class="input"
            />
          </div>

          <div class="space-y-1">
            <label class="label" for="course-name">Course description</label>
            <input
              id="course-name"
              bind:value={draft.course_name}
              placeholder="Systems Integration and Architecture"
              autocomplete="off"
              class="input"
            />
          </div>

          <div class="space-y-1">
            <label class="label" for="term">Term</label>
            <select id="term" bind:value={draft.term} class="select">
              <option value={1}>1st Semester</option>
              <option value={2}>2nd Semester</option>
            </select>
          </div>

          <div class="space-y-1">
            <label class="label" for="school-year">School year</label>
            <div class="flex items-center gap-2">
              <input
                id="school-year"
                bind:value={draft.school_year_start}
                type="number"
                min="2000"
                max="2100"
                step="1"
                class="input w-28"
              />
              <span class="hint">to {Number(draft.school_year_start) + 1}</span>
            </div>
          </div>

          <div class="space-y-1">
            <label class="label" for="schedule">Schedule</label>
            <input
              id="schedule"
              bind:value={draft.schedule}
              placeholder="MWF 9:00 - 10:00 AM"
              autocomplete="off"
              class="input"
            />
            <p class="hint">Optional. Printed on the sheet.</p>
          </div>

          <div class="space-y-1">
            <label class="label" for="instructor">Instructor</label>
            <input
              id="instructor"
              bind:value={draft.instructor_name}
              autocomplete="off"
              class="input"
            />
            <p class="hint">Optional. Printed on the sheet.</p>
          </div>
        </div>
      </section>

      <div class="grid gap-6 sm:grid-cols-2">
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">Grading periods</h2>
            <p class="hint">
              What each period is worth in the final grade. A period left at 0 is not used and
              gets no sheet.
            </p>
          </div>

          <div class="card-body space-y-2">
            {#each PERIODS as period (period)}
              <div class="flex items-center gap-3">
                <label class="label flex-1" for="weight-{period}">{PERIOD_NAMES[period]}</label>
                <input
                  id="weight-{period}"
                  bind:value={weights[period]}
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  class="input input-sm w-20 text-right"
                />
              </div>
            {/each}

            <div class="flex items-center gap-3 border-t border-border pt-3">
              <span class="label flex-1">Total</span>
              <span class={totalBadge(weightTotal)}>{weightTotal}%</span>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-header">
            <h2 class="card-title">Percentage distribution</h2>
            <p class="hint">
              Within one period, what each kind of work is worth. The same split is used for
              every period.
            </p>
          </div>

          <div class="card-body space-y-2">
            {#each COMPONENTS as component (component)}
              <div class="flex items-center gap-3">
                <label class="label flex-1" for="share-{component}">
                  {COMPONENT_NAMES[component]}
                </label>
                <input
                  id="share-{component}"
                  bind:value={shares[component]}
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  class="input input-sm w-20 text-right"
                />
              </div>
            {/each}

            <div class="flex items-center gap-3 border-t border-border pt-3">
              <span class="label flex-1">Total</span>
              <span class={totalBadge(shareTotal)}>{shareTotal}%</span>
            </div>
          </div>
        </section>
      </div>

      <p class="hint">
        Both tables have to add up to 100 before the sheet can compute a grade. Leaving them
        at 0 saves the record and lets the scheme be filled in later.
      </p>

      {#if error}
        <p class="alert alert-error">{error}</p>
      {/if}

      <div class="flex items-center gap-2">
        <button type="submit" disabled={saving} class="btn btn-primary">
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Create record'}
        </button>
        <a href="/records" class="btn btn-outline">Cancel</a>
      </div>
    </form>
  {/if}
</main>
