<script lang="ts">
  import {
    createStudent,
    enrolStudent,
    findStudentByNumber,
    listStudentsNotIn,
    removeEnrollment,
    reorderSheet,
  } from '$lib/db'
  import type { ClassRecord, SheetRow, Student } from '$lib/db'
  import { studentName, yearLevelName } from '$lib/format'

  /**
   * The Input sheet: who is on this class record.
   *
   * A student exists once on the laptop and is put on a sheet by enrolling
   * them. 2024 copied the name and program into a table made for this one
   * record, so correcting a spelling meant finding every copy of it.
   */

  let {
    record,
    rows,
    onchange,
  }: { record: ClassRecord; rows: SheetRow[]; onchange: () => Promise<void> } = $props()

  let available = $state<Student[]>([])
  let adding = $state(false)
  let dialog = $state<HTMLDialogElement>()
  let search = $state('')
  let confirming = $state<number | null>(null)
  let error = $state('')

  let draft = $state({
    student_no: '',
    last_name: '',
    first_name: '',
    middle_initial: '',
    program: '',
    year_level: 1,
  })

  /** Seeded from the record when the form opens: a class list is nearly always
   *  one program, and reading it here rather than at init keeps the default
   *  right if the record is reloaded under the sheet. */
  function startNew() {
    draft.program = record.program
    draft.year_level = record.year_level
    dialog?.showModal()
  }

  /** The dialog is modal, so Esc closes it as well as the buttons do. Clearing
   *  on `close` rather than in a handler means every way out leaves it clean. */
  function reset() {
    draft.student_no = ''
    draft.last_name = ''
    draft.first_name = ''
    draft.middle_initial = ''
    error = ''
  }

  const matches = $derived.by(() => {
    const needle = search.trim().toLowerCase()
    const pool = needle
      ? available.filter((student) =>
          `${student.last_name} ${student.first_name} ${student.student_no}`
            .toLowerCase()
            .includes(needle)
        )
      : available
    return pool.slice(0, 8)
  })

  async function loadAvailable() {
    available = await listStudentsNotIn(record.id)
  }

  async function refresh() {
    await onchange()
    await loadAvailable()
  }

  async function enrol(studentId: number) {
    await enrolStudent(record.id, studentId)
    search = ''
    await refresh()
  }

  async function unenrol(enrollmentId: number) {
    await removeEnrollment(enrollmentId)
    confirming = null
    await refresh()
  }

  async function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= rows.length) {
      return
    }

    const next = [...rows]
    const held = next[index]
    next[index] = next[target]
    next[target] = held

    await reorderSheet(next.map((row) => row.id))
    await onchange()
  }

  async function createAndEnrol(event: SubmitEvent) {
    event.preventDefault()
    error = ''

    if (!draft.student_no.trim() || !draft.last_name.trim() || !draft.first_name.trim()) {
      error = 'A student needs a student number, a last name and a first name.'
      return
    }

    // `students.student_no` is unique, so this would fail at the database
    // otherwise - and the student is very likely already here, which is a more
    // useful thing to say than a constraint error. Which advice to give depends
    // on where they are: the search list hides anyone already on this record,
    // so sending someone to search for them there would be a dead end.
    const existing = await findStudentByNumber(draft.student_no.trim())
    if (existing) {
      error = rows.some((row) => row.student_id === existing.id)
        ? `${existing.student_no} is already on this record, as ${studentName(existing)}.`
        : `${existing.student_no} is already on this laptop, as ${studentName(existing)}. Close this and search for them instead.`
      return
    }

    try {
      const studentId = await createStudent({
        student_no: draft.student_no,
        last_name: draft.last_name,
        first_name: draft.first_name,
        middle_initial: draft.middle_initial,
        program: draft.program,
        year_level: Number(draft.year_level),
      })
      await enrolStudent(record.id, studentId)
    } catch (failure) {
      error = `The student could not be added: ${failure}`
      return
    }

    dialog?.close()
    await refresh()
  }

  loadAvailable()
</script>

<div class="flex flex-wrap items-end gap-3">
  <div class="mr-auto">
    <h2 class="text-base font-semibold tracking-tight">Students</h2>
    <p class="hint mt-1">
      {rows.length}
      {rows.length === 1 ? 'student' : 'students'} on this record, in the order the printed
      sheet uses.
    </p>
  </div>
  <button
    type="button"
    onclick={() => {
      adding = !adding
      search = ''
    }}
    class="btn btn-sm {adding ? 'btn-ghost' : 'btn-primary'}"
  >
    {adding ? 'Done' : 'Add student'}
  </button>
</div>

{#if adding}
  <div class="card card-body mt-4 bg-muted/40">
    <input
      bind:value={search}
      placeholder="Search name or student number"
      aria-label="Search students"
      autocomplete="off"
      class="input input-sm"
    />

    {#if available.length === 0}
      <p class="hint mt-2">Every student on this laptop is already on this record.</p>
    {:else if matches.length === 0}
      <p class="hint mt-2">Nobody here matches &ldquo;{search}&rdquo;.</p>
    {:else}
      <ul class="mt-2 space-y-1">
        {#each matches as student (student.id)}
          <li>
            <button
              type="button"
              onclick={() => enrol(student.id)}
              class="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <span class="font-medium">{studentName(student)}</span>
              <span class="muted text-xs">{student.student_no}</span>
              <span class="muted ml-auto text-xs">
                {student.program}
                {student.year_level ? yearLevelName(student.year_level) : ''}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <button type="button" onclick={startNew} class="btn btn-sm btn-outline mt-3">
      Add someone new
    </button>
  </div>
{/if}

<dialog bind:this={dialog} onclose={reset} class="dialog" aria-labelledby="new-student-title">
  <div class="card-header">
    <h3 id="new-student-title" class="card-title">A student who is not on this laptop yet</h3>
    <p class="hint">They are created once here, then put on {record.course_code}.</p>
  </div>

  <form onsubmit={createAndEnrol}>
    <div class="card-body grid gap-3 sm:grid-cols-6">
      {#if error}
        <p class="alert alert-error sm:col-span-6">{error}</p>
      {/if}
      <div class="space-y-1 sm:col-span-3">
        <label class="label" for="new-no">Student number</label>
        <input id="new-no" bind:value={draft.student_no} autocomplete="off" class="input input-sm" />
      </div>
      <div class="space-y-1 sm:col-span-3">
        <label class="label" for="new-last">Last name</label>
        <input id="new-last" bind:value={draft.last_name} autocomplete="off" class="input input-sm" />
      </div>
      <div class="space-y-1 sm:col-span-4">
        <label class="label" for="new-first">First name</label>
        <input
          id="new-first"
          bind:value={draft.first_name}
          autocomplete="off"
          class="input input-sm"
        />
      </div>
      <div class="space-y-1 sm:col-span-2">
        <label class="label" for="new-mi">M.I.</label>
        <input
          id="new-mi"
          bind:value={draft.middle_initial}
          maxlength="4"
          autocomplete="off"
          class="input input-sm"
        />
      </div>
      <div class="space-y-1 sm:col-span-4">
        <label class="label" for="new-program">Program</label>
        <input
          id="new-program"
          bind:value={draft.program}
          autocomplete="off"
          class="input input-sm"
        />
      </div>
      <div class="space-y-1 sm:col-span-2">
        <label class="label" for="new-year">Year</label>
        <select id="new-year" bind:value={draft.year_level} class="select input-sm">
          {#each [1, 2, 3, 4, 5, 6] as level (level)}
            <option value={level}>{level}</option>
          {/each}
        </select>
      </div>
    </div>
    <div class="card-footer">
      <button type="submit" class="btn btn-sm btn-primary">Add to record</button>
      <button type="button" onclick={() => dialog?.close()} class="btn btn-sm btn-ghost">
        Cancel
      </button>
    </div>
  </form>
</dialog>

{#if rows.length === 0}
  <p class="hint mt-6">
    Nobody is on this record yet. Add the class list and the grading period sheets become
    something to fill in.
  </p>
{:else}
  <section class="card mt-4">
    <table class="table">
      <thead>
        <tr>
          <th class="w-10">No</th>
          <th>Name</th>
          <th>Student no.</th>
          <th>Program</th>
          <th class="text-right">&nbsp;</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row, index (row.id)}
          <tr>
            <td class="muted">{index + 1}</td>
            <td class="font-medium">{studentName(row)}</td>
            <td class="muted whitespace-nowrap">{row.student_no}</td>
            <td class="muted whitespace-nowrap">
              {row.program}
              {row.year_level ? yearLevelName(row.year_level) : ''}
            </td>
            <td class="text-right whitespace-nowrap">
              {#if confirming === row.id}
                <span class="hint mr-2">Take them off this record?</span>
                <button
                  type="button"
                  onclick={() => unenrol(row.id)}
                  class="btn btn-sm btn-destructive"
                >
                  Remove
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
                  onclick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Move {studentName(row)} up"
                  class="btn btn-sm btn-ghost px-1.5"
                >
                  &uarr;
                </button>
                <button
                  type="button"
                  onclick={() => move(index, 1)}
                  disabled={index === rows.length - 1}
                  aria-label="Move {studentName(row)} down"
                  class="btn btn-sm btn-ghost px-1.5"
                >
                  &darr;
                </button>
                <button
                  type="button"
                  onclick={() => (confirming = row.id)}
                  class="btn btn-sm btn-ghost"
                >
                  Remove
                </button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}
