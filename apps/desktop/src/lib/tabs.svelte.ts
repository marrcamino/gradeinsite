import type { ClassRecord, Period } from '$lib/db'

/**
 * The open class records, as browser tabs.
 *
 * An instructor works across several records at once — copying a name from one
 * section into another, comparing two sheets — so the app keeps them open side
 * by side the way a browser does, rather than making each one a page you
 * navigate to and back out of.
 *
 * The tabs live in memory for one run of the app. Nothing here is written to
 * the database: which records happened to be open is not a fact about the
 * records, and a tab bar restored from last week would be noise.
 */

/** The sheets along the bottom of an open record, in the order they appear. */
export type Shelf = 'input' | Period | 'gpa' | 'print'

export interface RecordTab {
  /** The tab's own identity, so closing the right one never depends on which record it holds. */
  id: number
  /** The record on show, or null in a tab that is still choosing one. */
  recordId: number | null
  /** What the tab is labelled — the course code, or "New tab" until one is picked. */
  title: string
  /** Which sheet along the bottom is open, kept per tab. */
  shelf: Shelf
}

class TabStore {
  tabs = $state<RecordTab[]>([])
  activeId = $state<number | null>(null)

  #nextId = 1

  get active(): RecordTab | null {
    return this.tabs.find((tab) => tab.id === this.activeId) ?? null
  }

  /** True when the window should show the record list instead of a sheet. */
  get showingPicker(): boolean {
    return this.active === null || this.active.recordId === null
  }

  select(id: number) {
    this.activeId = id
  }

  /** A new, empty tab — the plus button, and what an empty window opens with. */
  addBlank(): RecordTab {
    const tab: RecordTab = {
      id: this.#nextId++,
      recordId: null,
      title: 'New tab',
      shelf: 'input',
    }
    this.tabs.push(tab)
    this.activeId = tab.id
    return tab
  }

  /**
   * Show a record.
   *
   * A record already open is brought forward rather than opened twice, which is
   * what a browser does with a pinned page and stops two tabs disagreeing about
   * the same sheet. An empty tab takes the record instead of a new tab opening
   * beside it, so "add a tab, then pick a record" ends with one tab, not two.
   */
  open(record: ClassRecord) {
    const already = this.tabs.find((tab) => tab.recordId === record.id)
    if (already) {
      this.activeId = already.id
      return
    }

    const blank = this.active?.recordId === null ? this.active : null
    const tab = blank ?? this.addBlank()

    tab.recordId = record.id
    tab.title = record.course_code
    tab.shelf = 'input'
    this.activeId = tab.id
  }

  /** Keep a tab's label right after the record behind it is renamed or deleted. */
  refresh(records: ClassRecord[]) {
    for (const tab of this.tabs) {
      if (tab.recordId === null) {
        continue
      }

      const record = records.find((candidate) => candidate.id === tab.recordId)
      if (record) {
        tab.title = record.course_code
      } else {
        // The record was deleted from under the tab. Emptying it back to the
        // picker is gentler than closing a tab the instructor is looking at.
        tab.recordId = null
        tab.title = 'New tab'
      }
    }
  }

  /** Close a tab, focusing its right-hand neighbour the way a browser does. */
  close(id: number) {
    const index = this.tabs.findIndex((tab) => tab.id === id)
    if (index === -1) {
      return
    }

    this.tabs.splice(index, 1)

    if (this.activeId !== id) {
      return
    }
    const next = this.tabs[index] ?? this.tabs[index - 1] ?? null
    this.activeId = next?.id ?? null
  }
}

export const tabs = new TabStore()
