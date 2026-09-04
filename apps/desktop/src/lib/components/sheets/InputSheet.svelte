<script lang="ts">
  import {
    createStudent,
    deleteStudent,
    enrolStudent,
    findStudentByNumber,
    getStudent,
    listStudentsNotIn,
    removeEnrollment,
    reorderSheet,
    studentFootprint,
    updateStudent,
  } from '$lib/db'
  import type { ClassRecord, SheetRow, Student } from '$lib/db'
  import { resetPortalPassword } from '$lib/api/students'
  import { isOffline } from '$lib/api/client'
  import { session } from '$lib/session.svelte'
  import { studentName, yearLevelName } from '$lib/format'

  /**
   * The Input sheet: who is on this class record.
   *
   * A student exists once on the computer and is put on a sheet by enrolling
   * them. 2024 copied the name and program into a table made for this one
   * record, so correcting a spelling meant finding every copy of it. Here the
   * correction is made once, on the student, and every record showing them
   * follows — which is the whole point of their existing once.
   *
   * Two different removals live on this sheet, and the wording is what keeps
   * them apart. "Remove" on a row takes the student off THIS record and is the
   * ordinary thing: a student who dropped the subject. "Delete from this
   * computer" is inside the student's own details, because that is where you
   * can see whose details you are about to destroy, and it says how many
   * records and grades go with them.
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

  /** Which job the one dialog is doing. */
  let editing = $state<number | null>(null)
  /** What a delete would destroy, counted when the details open. */
  let footprint = $state<{ records: number; grades: number } | null>(null)
  let confirmingDelete = $state(false)
  let busy = $state(false)

  /**
   * The outcome of a portal password reset, shown in the dialogue.
   *
   * Not a toast: the instructor has to pass the next step on to the student
   * in person, so the sentence saying what the student must now do should
   * stay on screen until the dialogue is closed.
   */
  let resetState = $state<'idle' | 'working' | 'done' | 'failed'>('idle')
  let resetMessage = $state('')

  let draft = $state({
    student_no: '',
    last_name: '',
    first_name: '',
    middle_initial: '',
    program: '',
    year_level: 1,
    contact: '',
  })

  /** Seeded from the record when the form opens: a class list is nearly always
   *  one program, and reading it here rather than at init keeps the default
   *  right if the record is reloaded under the sheet. */
  function startNew() {
    editing = null
    draft.program = record.program
    draft.year_level = record.year_level
    dialog?.showModal()
  }

  /**
   * The student's own details, read fresh rather than taken from the row.
   *
   * A sheet row carries only what the table draws, so it has no `contact` —
   * and editing from a partial copy would blank the fields it never held.
   */
  async function startEdit(studentId: number) {
    const student = await getStudent(studentId)
    if (!student) {
      error = 'That student is no longer on this computer.'
      return
    }

    editing = student.id
    draft.student_no = student.student_no
    draft.last_name = student.last_name
    draft.first_name = student.first_name
    draft.middle_initial = student.middle_initial ?? ''
    draft.program = student.program
    draft.year_level = student.year_level ?? record.year_level
    draft.contact = student.contact ?? ''
    footprint = await studentFootprint(student.id)
    dialog?.showModal()
  }

  /** The dialog is modal, so Esc closes it as well as the buttons do. Clearing
   *  on `close` rather than in a handler means every way out leaves it clean. */
  function reset() {
    draft.student_no = ''
    draft.last_name = ''
    draft.first_name = ''
    draft.middle_initial = ''
    draft.contact = ''
    error = ''
    editing = null
    footprint = null
    confirmingDelete = false
    resetState = 'idle'
    resetMessage = ''
  }

  /**
   * Let this student claim their portal account again.
   *
   * There is no email on a school network, so a student who forgets their
   * portal password cannot be sent a link — the instructor is the only
   * authority available, and this is it. It clears the password rather than
   * setting a new one, so nothing has to be read out or written down: the
   * student sets their own on the portal with their ID number and last name.
   *
   * Deliberately not behind a confirmation. It is undoable in the sense that
   * matters — the student simply claims the account again — unlike the delete
   * below it, which is why that one asks and this one does not.
   */
  async function resetPortal() {
    const credentials = session.credentials
    if (!credentials) {
      resetState = 'failed'
      resetMessage = 'Sign in again so the server knows who is asking.'
      return
    }

    resetState = 'working'
    resetMessage = ''

    const result = await resetPortalPassword(credentials, draft.student_no)

    if (result.ok) {
      resetState = 'done'
      resetMessage = result.data.was_set
        ? `${result.data.name} can now set a new password on the student page, using their ID number and last name.`
        : `${result.data.name} had no password yet. They can set one on the student page, using their ID number and last name.`
      return
    }

    resetState = 'failed'
    // The portal password lives only on the server, so unlike the rest of this
    // sheet there is no offline version of this to fall back on.
    resetMessage = isOffline(result)
      ? 'This needs the school network, because the student page password is kept on the server.'
      : result.message
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

  async function save(event: SubmitEvent) {
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
    //
    // Editing has to allow the number the student already holds, or nobody
    // could correct their own spelling of anything else.
    const existing = await findStudentByNumber(draft.student_no.trim())
    if (existing && existing.id !== editing) {
      error = rows.some((row) => row.student_id === existing.id)
        ? `${existing.student_no} is already on this record, as ${studentName(existing)}.`
        : `${existing.student_no} is already on this computer, as ${studentName(existing)}. Close this and search for them instead.`
      return
    }

    const input = {
      student_no: draft.student_no,
      last_name: draft.last_name,
      first_name: draft.first_name,
      middle_initial: draft.middle_initial,
      program: draft.program,
      year_level: Number(draft.year_level),
      contact: draft.contact,
    }

    busy = true
    try {
      if (editing === null) {
        const studentId = await createStudent(input)
        await enrolStudent(record.id, studentId)
      } else {
        await updateStudent(editing, input)
      }
    } catch (failure) {
      error = `The student could not be saved: ${failure}`
      busy = false
      return
    }
    busy = false

    dialog?.close()
    await refresh()
  }

  /**
   * Delete the student from this computer entirely.
   *
   * Not the same thing as the "Remove" on a row, and the only place the two
   * could be confused is here, which is why this one is behind the student's
   * details and states what goes with them.
   */
  async function destroy() {
    if (editing === null) {
      return
    }

    busy = true
    try {
      await deleteStudent(editing)
    } catch (failure) {
      error = `The student could not be deleted: ${failure}`
      busy = false
      return
    }
    busy = false

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
      <p class="hint mt-2">Every student on this computer is already on this record.</p>
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
    {#if editing === null}
      <h3 id="new-student-title" class="card-title">A student who is not on this computer yet</h3>
      <p class="hint">They are created once here, then put on {record.course_code}.</p>
    {:else}
      <h3 id="new-student-title" class="card-title">Student details</h3>
      <p class="hint">
        A student is held once on this computer, so a correction here shows on every record they
        are on{footprint && footprint.records > 1 ? ` — ${footprint.records} of them` : ''}.
      </p>
    {/if}
  </div>

  <form onsubmit={save}>
    <div class="card-body grid gap-3 sm:grid-cols-6">
      {#if error}
        <p class="alert alert-error sm:col-span-6">{error}</p>
      {/if}
      <div class="space-y-1 sm:col-span-3">
        <label class="label" for="new-no">Student number</label>
        <!-- Fixed once the student exists, exactly as 2024 froze the ID Number
             cell on a saved row. It is also the name the server knows them by:
             `sync-push.php` matches a student on their number, so changing it
             here would not rename them over there, it would make a second
             student and leave the first one enrolled. -->
        <input
          id="new-no"
          bind:value={draft.student_no}
          readonly={editing !== null}
          autocomplete="off"
          class="input input-sm"
        />
        {#if editing !== null}
          <p class="hint">A student number cannot be changed once the student exists.</p>
        {/if}
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
      <div class="space-y-1 sm:col-span-6">
        <label class="label" for="new-contact">Contact <span class="muted">(optional)</span></label>
        <input
          id="new-contact"
          bind:value={draft.contact}
          autocomplete="off"
          class="input input-sm"
        />
      </div>
    </div>
    <div class="card-footer">
      <button type="submit" disabled={busy} class="btn btn-sm btn-primary">
        {editing === null ? 'Add to record' : 'Save changes'}
      </button>
      <button type="button" onclick={() => dialog?.close()} class="btn btn-sm btn-ghost">
        Cancel
      </button>

      {#if editing !== null}
        <!-- The student page password is the one thing here the server owns, so
             this is the one button on the dialogue that needs the network. -->
        <button
          type="button"
          onclick={resetPortal}
          disabled={busy || resetState === 'working'}
          class="btn btn-sm btn-outline"
          title="Let this student set a new password on the student page"
        >
          {resetState === 'working' ? 'Resetting…' : 'Reset student page password'}
        </button>

        <!-- Kept apart from the two buttons above, because it is the one thing
             on this dialogue that cannot be undone. -->
        <div class="ml-auto">
          {#if confirmingDelete}
            <button
              type="button"
              onclick={destroy}
              disabled={busy}
              class="btn btn-sm btn-destructive"
            >
              Yes, delete
            </button>
            <button
              type="button"
              onclick={() => (confirmingDelete = false)}
              class="btn btn-sm btn-ghost"
            >
              Keep
            </button>
          {:else}
            <button
              type="button"
              onclick={() => (confirmingDelete = true)}
              class="btn btn-sm btn-ghost text-destructive"
            >
              Delete from this computer
            </button>
          {/if}
        </div>
      {/if}
    </div>

    {#if confirmingDelete && footprint}
      <div class="card-body border-t border-border pt-3">
        <p class="alert alert-warning">
          {draft.first_name}
          {draft.last_name} comes off
          {footprint.records === 1 ? 'this record' : `all ${footprint.records} records they are on`}{footprint.grades >
          0
            ? `, and ${footprint.grades} ${footprint.grades === 1 ? 'grade' : 'grades'} already entered for them go too`
            : ''}. This cannot be undone.
        </p>
        <p class="hint mt-2">
          The school server keeps its own copy of the student, along with the login they use to see
          their grades. Only this computer forgets them.
        </p>
      </div>
    {/if}

    <!-- Below the footer rather than beside the button: the sentence tells the
         instructor what to say to the student next, so it should stay put until
         the dialogue is closed. -->
    {#if resetState === 'done'}
      <p class="alert alert-success mx-4 mb-4">{resetMessage}</p>
    {:else if resetState === 'failed'}
      <p class="alert alert-error mx-4 mb-4">{resetMessage}</p>
    {/if}
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
                  onclick={() => startEdit(row.student_id)}
                  class="btn btn-sm btn-ghost"
                >
                  Edit
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
