# How the 2024 grade sheet table worked

Reference notes on the Handsontable grade sheet in the 2024 capstone
(`Z:\capstone\tauri-app\src\`). This is reference material only — the rewrite
has to reproduce the *behaviour and layout* described here, not the code.

Read this before building the grading-period sheets in `apps/desktop`.

## Where it lives in the 2024 source

| File | Role |
|---|---|
| `components/content/Holder.svelte` | Renders one `<SheetTbl>` per grading period the record uses |
| `components/content/holder/SheetTbl.svelte` | Builds the Handsontable instance — merges, hidden columns, per-cell renderers |
| `utils/helper/headerInitialData.ts` | Builds the two header rows (`tableHeader2` is the one actually used) |
| `utils/helper/sheetDataLoader.ts` | Reads the record + students out of SQLite and shapes the grid data |
| `utils/helper/gradeDistribution.ts` | Works out which columns start hidden |
| `utils/helper/customTblRenderer.ts` | The three globally registered custom renderers |
| `utils/class/tableSheet.ts` | `HotTbleShts` — every hook, every calculation, and saving |
| `components/content/Shelf.svelte` | The bottom sheet tabs (`Input`, periods…, `GPA`, `PRINT`) |
| `components/NewTask.svelte` | The "New Task" modal that reveals one more column |

## The one big idea

**The grid is not dynamic in the sense of adding and removing columns.**

Every grading-period sheet is always the *same physical 71-column grid*. What
changes per record is only which of those columns are **hidden**. Adding a quiz
column does not insert a column — it unhides the next one of fifteen
pre-allocated slots. Turning off a whole component does not delete columns — it
hides that component's entire block.

This is why the merge definitions, the renderer rules and the calculation code
can all be written against hardcoded column indices and still work for every
record.

## The fixed column map

Column order comes from the key order of the first data object returned by
`tableHeader2()`. Handsontable derives its columns from that object, so the
prop names and the indices are locked together:

| Index | Prop | Meaning |
|---|---|---|
| 0 | `no` | NO (row number) |
| 1 | `ln` | LASTNAME |
| 2 | `fn` | FIRSTNAME |
| 3 | `mi` | MI |
| 4 | `pg` | PROGRAM (`"BSIT - 1"`, program + year joined at load time) |
| 5–19 | `qe1`–`qe15` | Quizzes / exercises — 15 task slots |
| 20 | `qe16` | TOTAL |
| 21 | `qe17` | GRD |
| 22 | `qe18` | EQV |
| 23–37 | `at1`–`at15` | Attendance — 15 day slots |
| 38 / 39 / 40 | `at16` / `at17` / `at18` | TOTAL / GRD / EQV |
| 41–55 | `as1`–`as15` | Assignment — 15 task slots |
| 56 / 57 / 58 | `as16` / `as17` / `as18` | TOTAL / GRD / EQV |
| 59 / 60 / 61 | `op1` / `op2` / `op3` | Oral participation — score / GRD / EQV |
| 62 / 63 / 64 | `co1` / `co2` / `co3` | Course output / project |
| 65 / 66 / 67 | `me1` / `me2` / `me3` | Major exam |
| 68 | `ratg` | RATING (the period grade) |
| 69 | `id` | Student id — **always hidden**, used as the save key |
| 70 | `lack` | 1 if the student has a missing score — **always hidden** |

Three components get fifteen slots each; three get exactly one. That asymmetry
is deliberate: quizzes, attendance and assignments are repeatable tasks, while
oral participation, project and major exam are single scores.

> The `mergeCells` comments in `SheetTbl.svelte` label column 59 as COURSE
> OUTPUT and 62 as ORAL. That is wrong — the key order and every calculation in
> `tableSheet.ts` put oral at 59 and course output at 62. Trust the code, not
> the comment.

## Two header rows that are actually data rows

`colHeaders: true` shows Handsontable's own A, B, C… letters. The real header is
the **first two rows of the data array**:

```
data: [...headers, ...data]   //  headers is 2 rows, data is the students
```

- **Row 0** — group labels with the weight baked into the text:
  `QUIZZES / EXERCISES (30%)`, `ATTENDANCE (10%)`, `ASSIGNMENT (10%)`,
  `ORAL (10%)`, `PROJECT (20%)`, `MAJOR EXAM (20%)`, plus `RATING`.
  Only the anchor key carries the label; the rest of the block is `null` so the
  merge can swallow them.
- **Row 1** — the per-task **maximum scores**, then the literal words
  `TOTAL (n)`, `GRD`, `EQV`. This row is **editable**. Typing `20` into `qe3`
  is how the instructor declares that quiz 3 is out of 20.
- **Row 2 onward** — students, one row each, sorted by last name.

So editing a header cell is an ordinary `afterChange` event, and the whole
"schema" of the sheet is just row 1 of the grid. That is the trick that makes
the sheet feel like Excel.

## The merges

Twelve static regions, declared once against the full 71-column grid:

```
{ row: 0, col: 0,  rowspan: 2, colspan: 1  }   // NO
{ row: 0, col: 1,  rowspan: 2, colspan: 1  }   // LASTNAME
{ row: 0, col: 2,  rowspan: 2, colspan: 1  }   // FIRSTNAME
{ row: 0, col: 3,  rowspan: 2, colspan: 1  }   // MI
{ row: 0, col: 4,  rowspan: 2, colspan: 1  }   // PROGRAM
{ row: 0, col: 5,  rowspan: 1, colspan: 18 }   // QUIZZES / EXERCISES
{ row: 0, col: 23, rowspan: 1, colspan: 18 }   // ATTENDANCE
{ row: 0, col: 41, rowspan: 1, colspan: 18 }   // ASSIGNMENT
{ row: 0, col: 59, rowspan: 1, colspan: 3  }   // ORAL
{ row: 0, col: 62, rowspan: 1, colspan: 3  }   // COURSE OUTPUT
{ row: 0, col: 65, rowspan: 1, colspan: 3  }   // MAJOR EXAM
{ row: 0, col: 68, rowspan: 2, colspan: 1  }   // RATING
```

Two shapes only:

- **Identity columns and RATING** merge *vertically* (`rowspan: 2`) so one label
  spans both header rows — they have no sub-header.
- **Component blocks** merge *horizontally* across their whole span, which is
  `15 task slots + TOTAL + GRD + EQV = 18`, or `1 + GRD + EQV = 3` for the
  single-score components.

The merge list never changes. It is not recalculated when columns are hidden —
Handsontable renders a hidden column at zero width, so an 18-wide merge visually
shrinks to however many slots are actually showing. This is the single most
important detail to carry into the rewrite: **merges are declared over the full
grid, visibility is what varies.**

`id` (69) and `lack` (70) are outside every merge and permanently hidden.

## What makes it dynamic

### 1. Which grading-period sheets exist

`record_list.gcValues` is a JSON object of the five periods with a percentage
each: `{ pl, pm, mt, pf, fn }`. `filterGcValues()` drops every key whose value is
`"0%"`, and the survivors become both the bottom sheet tabs and the
`{#each}` → `<SheetTbl>` loop. A record weighted only Midterm/Final therefore
gets exactly two grade sheets, and the shelf reads `Input, Midterm, Final, GPA,
PRINT`.

### 2. Which components appear inside a sheet

`record_list.pdValues` holds the percentage distribution:
`{ qe, at, co, as, op, me }`. Any component at `0` is switched off, and
`hideSheetsColoums()` hides that component's **entire block** — anchor column,
all fifteen slots, and TOTAL/GRD/EQV.

### 3. How many task columns are showing

`record_list.<pl|pm|mt|pf|fn>` holds a `GradeComponentDetails` JSON per period:

```json
{ "qe": [20, 15, 30], "at": [1, 1], "as": [], "co": 100, "op": null, "me": 75 }
```

The **length of each array is the column count**. `hideSheetsColoums()` slices
the standing hidden-column list by that length, so three saved quiz max-scores
means columns 5, 6, 7 are visible and 8–19 are hidden.

### 4. Adding a column

The toolbar's **New Task** button opens a modal listing the components this
record actually uses, and confirming calls:

```ts
removeCol(what) {
  this.plugin.showColumn(this.quizzesAndExercies.at(0));
  this.quizzesAndExercies.shift();
  this.hot.render();
}
```

That is the whole mechanism — reveal the next hidden slot and drop it off the
hidden list. The name `removeCol` means "remove from the hidden array", not
"remove a column", which is worth knowing before reading that file.

Consequences to be aware of:

- **Fifteen is a hard ceiling** per component. Past that, `.at(0)` is
  `undefined` and nothing happens.
- **There is no un-add.** Nothing ever hides a column again within a session.
- The new column is not persisted until the instructor types a max score into
  row 1, which fires `reCalcCountbleScr` and rebuilds the array from the header
  row, and the record is then saved.

## The calculation chain

Everything hangs off a single `afterChange` hook that branches on the row and
the prop name. Row 1 changes recalculate the whole column for every student;
rows ≥ 2 recalculate just that student.

Per component, left to right:

1. **TOTAL** — sum of the raw scores. Attendance is the exception: its total is
   a **count** of ticked days, and its maximum is `arr.length`, not the sum.
2. **GRD** — `TOTAL / maxTotal * 100`, where `maxTotal` is the sum of the header
   row's max scores (or, again, the day count for attendance).
3. **EQV** — `GRD * (pdValues[component] / 100)`, the component's weighted
   contribution.
4. **RATING** (col 68) — the sum of all six EQV columns.

**The major exam is transmuted, not scaled:**

```
me GRD = (score / max) * 40 + 60
```

Oral participation and course output use the plain `* 100`. This asymmetry is
intentional legacy behaviour — reproduce it rather than "fixing" it.

Every result is formatted with `.toFixed(2).replace(/(\.00$|0\.0$|0+)$/, "")`,
which trims trailing zeros. Note that this regex also eats a trailing zero from
a value like `92.50`, producing `92.5` — cosmetic, but it is why grades in the
2024 app show a ragged number of decimals.

If a component's max total is `0` the calculation is skipped and a toast fires:
*"Unable calculate the total grade for … Missing max scores."*

### The LACK flag

`isLack(row)` sweeps every enabled component's cells for that student and writes
`1` or `0` into the hidden column 70. When it is `1`, the LASTNAME and FIRSTNAME
cells render with the `not-good` class (a red background). It is the "this
student is missing a score" signal, recomputed on every change and saved
alongside the grades.

## Rendering

`SheetTbl.svelte` uses a single `cells(row, col, prop)` callback — a long chain
of index-range `if`s, each assigning a renderer and a class. There are no
`columns` definitions at all.

Each component block gets its own pastel tint, defined in `styles.css`:

| Component | Class | Colour |
|---|---|---|
| Quizzes / exercises | `tbred` | `#fff5f5` |
| Attendance | `tbgreen` | `#f4fff7` |
| Assignment | `tbblue` | `#f2f4ff` |
| Oral participation | `tbpurple` | `#fff4ff` |
| Course output | `tbyellow` | `#fffdf4` |
| Major exam | `tbsky` | `#f4feff` |
| Identity + headers | `tbth` | `#fafafa` |

Three renderers are registered globally in `customTblRenderer.ts`:

- **`taskScores`** — centred numeric input. Used for every editable score cell
  and for the attendance max-score header row.
- **`taskCheckboxScores`** — attendance body cells only (23–37, row ≥ 2). It sets
  the cell `readOnly` and overwrites `TD.innerHTML` with a raw
  `<input type="checkbox">`. The checkbox is decorative; an
  `afterOnCellMouseUp` hook catches clicks in that range and flips the
  underlying `1`/`0` itself. Attendance is stored as ones and zeroes, not
  booleans.
- **`calculatedCellsScores`** — registered but unused; `SheetTbl` inlines that
  logic instead.

Derived cells (TOTAL/GRD/EQV, RATING, NO, names, id, lack) are all made
`readOnly`, have `pointerEvents` disabled, and are excluded from undo and
copy/paste. The RATING cell is coloured by value: `#f1d4d4` at 75 or below,
`#d7f1e1` above.

An `afterScroll` hook calls `hot.render()` on every scroll, because the
renderers mutate cell metadata rather than deriving it. That is a performance
smell worth not reproducing.

## Persistence

Per record, the 2024 app created a table at runtime:

```sql
CREATE TABLE "rcrd_<recordId>_<userId>" (
  id, ln, fn, mi, pg, yr, ct, stid, serverid,
  gpl, gpm, gmt, gpf, gfn,
  pllack, pmlack, mtlack, pflack, fnlack
)
```

One column per grading period, holding **the whole row as a JSON object** —
columns 5 through 68 keyed by prop name (`qe1`…`me3`, `ratg`), 64 values. The
2024 student web app reads it straight back with expressions like `.qe17`, so
that key-based shape is baked into both apps.

Saving walks a `logs` array of dirty row indices and issues one
`UPDATE … WHERE stid = ?` per student, then writes the component arrays back to
`record_list.<period>` regardless of whether anything changed.

Two things the rewrite is explicitly meant to fix are visible here: **tables
created at runtime** (`rcrd_<id>_<user>`) and **string-interpolated SQL**
(`SELECT ${sheetname} … WHERE id = ${dbid}`). The grid layout above is the
specification; this storage scheme is not.

## The GPA sheet

The `GPA` tab is a second, much smaller Handsontable built the same way: two
header rows, `mergeCells` for `No` (rowspan 2), `Name` (colspan 3) and `Program`
(rowspan 2), then a *dynamically supplied* merge list — one pair of GRD/EQV
columns per grading period the record uses, appended with `...merge`. Everything
is read-only, and the `remarks` column is tinted green for `PASSED` and red
otherwise. It refreshes whenever the shelf switches to `GPA`, and via a Refresh
button in the toolbar.

## Summary for the rewrite

- One fixed 71-column grid per grading period; hide, never insert or delete.
- Two data rows serve as the header; row 1 holds editable maximum scores and is
  effectively the sheet's schema.
- Merges are static over the full grid — hidden columns collapse them for free.
- Fifteen slots per repeatable component, one per single-score component.
- Attendance counts rather than sums, and stores `1`/`0` behind a fake checkbox.
- The major exam transmutes with `* 40 + 60`.
- `gcValues` decides which sheets exist; `pdValues` decides which components
  show; the saved max-score arrays decide how many columns show.
