<script lang="ts">
  import { createProgram, deleteProgram, listPrograms, updateProgram } from '$lib/db'
  import type { Program } from '$lib/db'

  /**
   * The school's programs, as 2024's "Modify Programs" had them: one row per
   * program, with its name, its abbreviation and the dean who signs a printed
   * class record for it.
   *
   * 2024 made the cells `contenteditable` and tracked the edit with data
   * attributes on the DOM. The same table is drawn here, but a row being edited
   * swaps to ordinary inputs — the visible structure is what the manuscript
   * fixes, not the way the typing is captured.
   *
   * The abbreviation is the part that matters to the rest of the app: it is
   * what a class record stores, so it is what has to be spelled the same way
   * every time. Changing one here does not rewrite the records that already
   * name it, which is why it is the field the form warns about.
   */

  let dialog = $state<HTMLDialogElement>()
  let programs = $state<Program[]>([])
  let editing = $state<number | 'new' | null>(null)
  let confirming = $state<number | null>(null)
  let error = $state('')
  let busy = $state(false)

  let draft = $state({ pgname: '', abbv: '', dean: '' })

  async function open() {
    dialog?.showModal()
    await load()
  }

  async function load() {
    programs = await listPrograms()
  }

  function startNew() {
    editing = 'new'
    confirming = null
    error = ''
    draft = { pgname: '', abbv: '', dean: '' }
  }

  function startEdit(program: Program) {
    editing = program.id
    confirming = null
    error = ''
    draft = {
      pgname: program.pgname,
      abbv: program.abbv,
      dean: program.dean ?? '',
    }
  }

  function cancel() {
    editing = null
    error = ''
  }

  async function save() {
    error = ''

    if (!draft.pgname.trim() || !draft.abbv.trim()) {
      error = 'A program needs a name and an abbreviation.'
      return
    }

    // `abbv` is UNIQUE and NOCASE, so the database would refuse this anyway;
    // saying which program already holds it is more use than the constraint.
    const clash = programs.find(
      (program) =>
        program.abbv.toLowerCase() === draft.abbv.trim().toLowerCase() && program.id !== editing
    )
    if (clash) {
      error = `${clash.abbv} is already ${clash.pgname}.`
      return
    }

    busy = true
    try {
      if (editing === 'new') {
        await createProgram(draft)
      } else if (editing !== null) {
        await updateProgram(editing, draft)
      }
    } catch (failure) {
      error = `The program could not be saved: ${failure}`
      busy = false
      return
    }
    busy = false

    editing = null
    await load()
  }

  async function destroy(id: number) {
    busy = true
    try {
      await deleteProgram(id)
    } catch (failure) {
      error = `The program could not be deleted: ${failure}`
    }
    busy = false

    confirming = null
    await load()
  }
</script>

<button type="button" onclick={open} class="btn btn-sm btn-ghost"> Programs </button>

<dialog bind:this={dialog} class="dialog" aria-labelledby="programs-title">
  <div class="card-header">
    <h3 id="programs-title" class="card-title">Programs</h3>
    <p class="hint">
      The programs the school offers. A class record picks one of these instead of having it typed,
      so the same program is spelled the same way on every record.
    </p>
  </div>

  <div class="card-body">
    {#if error}
      <p class="alert alert-error mb-3">{error}</p>
    {/if}

    <table class="table">
      <thead>
        <tr>
          <th>Program name</th>
          <th class="w-28">Abbreviation</th>
          <th>Program dean</th>
          <th class="w-40 text-right">&nbsp;</th>
        </tr>
      </thead>
      <tbody>
        {#each programs as program (program.id)}
          {#if editing === program.id}
            <tr>
              <td>
                <input
                  bind:value={draft.pgname}
                  aria-label="Program name"
                  class="input input-sm"
                />
              </td>
              <td>
                <input
                  bind:value={draft.abbv}
                  aria-label="Abbreviation"
                  class="input input-sm uppercase"
                />
              </td>
              <td>
                <input bind:value={draft.dean} aria-label="Program dean" class="input input-sm" />
              </td>
              <td class="text-right whitespace-nowrap">
                <button
                  type="button"
                  onclick={save}
                  disabled={busy}
                  class="btn btn-sm btn-primary"
                >
                  Save
                </button>
                <button type="button" onclick={cancel} class="btn btn-sm btn-ghost">Cancel</button>
              </td>
            </tr>
          {:else}
            <tr>
              <td class="font-medium">{program.pgname}</td>
              <td class="whitespace-nowrap">{program.abbv}</td>
              <td class="muted">{program.dean ?? ''}</td>
              <td class="text-right whitespace-nowrap">
                {#if confirming === program.id}
                  <span class="hint mr-2">Delete it?</span>
                  <button
                    type="button"
                    onclick={() => destroy(program.id)}
                    disabled={busy}
                    class="btn btn-sm btn-destructive"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onclick={() => (confirming = null)}
                    class="btn btn-sm btn-ghost"
                  >
                    Keep
                  </button>
                {:else}
                  <button
                    type="button"
                    onclick={() => startEdit(program)}
                    class="btn btn-sm btn-ghost"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onclick={() => (confirming = program.id)}
                    class="btn btn-sm btn-ghost"
                  >
                    Delete
                  </button>
                {/if}
              </td>
            </tr>
          {/if}
        {/each}

        {#if editing === 'new'}
          <tr>
            <td>
              <input
                bind:value={draft.pgname}
                placeholder="Bachelor of Science in Information Technology"
                aria-label="Program name"
                class="input input-sm"
              />
            </td>
            <td>
              <input
                bind:value={draft.abbv}
                placeholder="BSIT"
                aria-label="Abbreviation"
                class="input input-sm uppercase"
              />
            </td>
            <td>
              <input
                bind:value={draft.dean}
                placeholder="Dean's name"
                aria-label="Program dean"
                class="input input-sm"
              />
            </td>
            <td class="text-right whitespace-nowrap">
              <button type="button" onclick={save} disabled={busy} class="btn btn-sm btn-primary">
                Add
              </button>
              <button type="button" onclick={cancel} class="btn btn-sm btn-ghost">Cancel</button>
            </td>
          </tr>
        {/if}
      </tbody>
    </table>

    {#if programs.length === 0 && editing !== 'new'}
      <p class="hint mt-3">
        No programs yet. Until one is added, a class record's program is typed in by hand.
      </p>
    {/if}

    {#if editing === null}
      <button type="button" onclick={startNew} class="btn btn-sm btn-outline mt-3">
        Add a program
      </button>
    {/if}
  </div>

  <div class="card-footer">
    <button type="button" onclick={() => dialog?.close()} class="btn btn-sm btn-ghost">
      Close
    </button>
  </div>
</dialog>
