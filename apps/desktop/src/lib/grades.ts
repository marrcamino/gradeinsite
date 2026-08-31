import {
  COMPONENTS,
  LIST_COMPONENTS,
  SINGLE_COMPONENTS,
  activePeriods,
  componentShare,
  periodWeight,
} from './db/types'
import type {
  ClassRecord,
  Component,
  ListComponent,
  Period,
  PeriodLayout,
  RawScores,
  Remark,
} from './db/types'

/**
 * How a mark becomes a grade.
 *
 * In 2024 this arithmetic lived in the spreadsheet widget itself, spread across
 * cell hooks that wrote into fixed column numbers. Here it is a plain function
 * of a record, a layout and a row of marks, so the whole rule can be read in
 * one sitting and the sheet is the only thing that has to trust it.
 *
 * For one student in one grading period:
 *
 *     percentage  what they scored, over the perfect score
 *     equivalent  that percentage, cut down to the component's share
 *     rating      the six equivalents added together
 *
 * and then across the periods:
 *
 *     final       each period's rating, cut down to that period's weight
 */

/** Two decimal places — the precision the printed sheet has always shown. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** A period with no columns yet, which is what a new class record starts with. */
export function emptyLayout(): PeriodLayout {
  return { qe: [], at: [], as: [], co: null, op: null, me: null }
}

/**
 * Fit stored marks to the layout as it stands now.
 *
 * A column added or dropped after grades were entered leaves the saved arrays
 * the wrong length. Reading every row through here means a stale one shows
 * blanks in the new columns instead of running off the end of its own array.
 */
export function fitScores(layout: PeriodLayout, scores: RawScores | null): RawScores {
  return {
    qe: layout.qe.map((_, index) => scores?.qe?.[index] ?? null),
    at: layout.at.map((_, index) => scores?.at?.[index] ?? null),
    as: layout.as.map((_, index) => scores?.as?.[index] ?? null),
    co: scores?.co ?? null,
    op: scores?.op ?? null,
    me: scores?.me ?? null,
  }
}

/** A quiz or an assignment nobody has told us about yet is out of ten. */
const DEFAULT_PERFECT = 10

/**
 * What a newly added column is out of.
 *
 * An attendance column is one meeting, marked present or absent, so it is
 * always out of one — that is what makes `perfectScore` able to read attendance
 * either as a count of days or as a sum of columns and get the same number.
 */
export function newColumnPerfect(component: ListComponent): number {
  return component === 'at' ? 1 : DEFAULT_PERFECT
}

/**
 * Give every component the record grades at least one column.
 *
 * A component carrying a percentage but holding no columns can never produce a
 * percentage, which stops the whole period rating — so the sheet would show a
 * row of dashes and no way to guess why. Starting it at one column means the
 * grid always has somewhere to type, and the instructor adds or removes columns
 * from there.
 */
export function ensureColumns(record: ClassRecord, layout: PeriodLayout): PeriodLayout {
  const filled: PeriodLayout = { ...layout, qe: [...layout.qe], at: [...layout.at], as: [...layout.as] }

  for (const component of LIST_COMPONENTS) {
    if (componentShare(record, component) > 0 && filled[component].length === 0) {
      filled[component] = [newColumnPerfect(component)]
    }
  }

  return filled
}

/** Whether two layouts hold the same columns, so a rebuild knows to save. */
export function sameLayout(left: PeriodLayout, right: PeriodLayout): boolean {
  const sameList = (a: number[], b: number[]) =>
    a.length === b.length && a.every((value, index) => value === b[index])

  return (
    sameList(left.qe, right.qe) &&
    sameList(left.at, right.at) &&
    sameList(left.as, right.as) &&
    left.co === right.co &&
    left.op === right.op &&
    left.me === right.me
  )
}

/** Whether anything at all has been entered for a row, marks or none. */
export function hasAnyMark(scores: RawScores): boolean {
  return (
    scores.qe.some((mark) => mark !== null) ||
    scores.at.some((mark) => mark !== null) ||
    scores.as.some((mark) => mark !== null) ||
    scores.op !== null ||
    scores.co !== null ||
    scores.me !== null
  )
}

/**
 * Whether a row still has a blank where a mark belongs — the LACK flag 2024
 * kept in a hidden column and used to redden the student's name.
 *
 * Only components the record actually grades are looked at, and attendance is
 * left out of it: a meeting is either ticked or not, so an unticked box is an
 * absence that has been recorded rather than a mark nobody has entered. In 2024
 * an absence did count as lacking, which meant a student who genuinely missed a
 * class stayed flagged all term with nothing the instructor could do about it.
 */
export function hasMissingMarks(
  record: ClassRecord,
  layout: PeriodLayout,
  scores: RawScores
): boolean {
  for (const component of LIST_COMPONENTS) {
    if (component === 'at' || componentShare(record, component) === 0) {
      continue
    }
    if (scores[component].some((mark) => mark === null)) {
      return true
    }
  }

  for (const component of SINGLE_COMPONENTS) {
    if (componentShare(record, component) > 0 && scores[component] === null) {
      return true
    }
  }

  return false
}

/**
 * The perfect score of one component in one period.
 *
 * Attendance is the odd one out: its columns are meeting days marked present or
 * absent, so the perfect score is how many columns there are rather than what
 * they add up to. The sheet gives every attendance column a perfect score of 1
 * so that those two readings are the same number either way.
 */
export function perfectScore(layout: PeriodLayout, component: Component): number {
  switch (component) {
    case 'at':
      return layout.at.length
    case 'qe':
    case 'as':
      return layout[component].reduce((total, score) => total + score, 0)
    default:
      return layout[component] ?? 0
  }
}

/** What a student has scored in one component, as a single total. */
export function rawTotal(scores: RawScores, component: Component): number {
  const marks = scores[component]

  if (Array.isArray(marks)) {
    return marks.reduce<number>((total, mark) => total + (mark ?? 0), 0)
  }
  return marks ?? 0
}

/**
 * One component as a percentage. Null means the layout has nothing to divide
 * by yet — no quizzes have been given, no perfect score set for the exam — so
 * there is no percentage to show rather than a zero to alarm anybody.
 */
export function componentPercentage(
  layout: PeriodLayout,
  scores: RawScores,
  component: Component
): number | null {
  const perfect = perfectScore(layout, component)
  if (perfect <= 0) {
    return null
  }

  const ratio = rawTotal(scores, component) / perfect

  // The major exam is transmuted onto a 60-100 scale rather than scaled to
  // 0-100 like the other five. The ratio is rounded to two places *before* the
  // transmutation, not after: that is the order the 2024 sheet used, and the
  // grades already printed from it only reproduce this way.
  if (component === 'me') {
    return round2(round2(ratio) * 40 + 60)
  }

  return round2(ratio * 100)
}

/**
 * What one component contributes to the period rating. A component the record
 * gives no share to contributes nothing, and is not allowed to hold the rating
 * up by having no columns.
 */
export function componentEquivalent(
  record: ClassRecord,
  layout: PeriodLayout,
  scores: RawScores,
  component: Component
): number | null {
  const share = componentShare(record, component)
  if (share === 0) {
    return 0
  }

  const percentage = componentPercentage(layout, scores, component)
  if (percentage === null) {
    return null
  }

  return round2((percentage * share) / 100)
}

export interface PeriodRating {
  /** The rating out of 100, or null while a component it needs has no columns. */
  rating: number | null
  /** The components carrying a share that still have no perfect score to use. */
  unset: Component[]
}

/** One period's grade: the six equivalents added up. */
export function periodRating(
  record: ClassRecord,
  layout: PeriodLayout,
  scores: RawScores
): PeriodRating {
  const unset: Component[] = []
  let rating = 0

  for (const component of COMPONENTS) {
    const equivalent = componentEquivalent(record, layout, scores, component)

    if (equivalent === null) {
      unset.push(component)
    } else {
      rating += equivalent
    }
  }

  return { rating: unset.length > 0 ? null : round2(rating), unset }
}

/**
 * What one period contributes to the final average: its rating, cut down to
 * the weight the record gives that period. The GPA sheet prints this beside
 * each rating, so it is a function rather than a line inside the total.
 */
export function weightedShare(record: ClassRecord, period: Period, rating: number): number {
  return round2((rating * periodWeight(record, period)) / 100)
}

export interface FinalGrade {
  /** The weighted total over the active periods. Null if the record grades none. */
  grade: number | null
  /** Active periods with no rating yet — while any remain, the total is partial. */
  missing: Period[]
}

/**
 * The final average: each period's rating, weighted, added up.
 *
 * A period with no rating counts as nothing, which is what 2024 did too — so
 * halfway through a term the total is genuinely low rather than wrong. What is
 * new is `missing`, so the sheet can say the number is not final yet instead of
 * putting an alarming average in front of an instructor in October.
 */
export function finalGrade(record: ClassRecord, ratings: Map<Period, number | null>): FinalGrade {
  const periods = activePeriods(record)
  if (periods.length === 0) {
    return { grade: null, missing: [] }
  }

  const missing: Period[] = []
  let total = 0

  for (const period of periods) {
    const rating = ratings.get(period) ?? null

    if (rating === null) {
      missing.push(period)
    } else {
      total += weightedShare(record, period, rating)
    }
  }

  return { grade: round2(total), missing }
}

/**
 * The school's grading table, as (highest average that earns it, point). An
 * average takes the point of the first row it still fits under, so the list has
 * to stay in ascending order.
 */
const EQUIVALENTS: [number, number][] = [
  [74.4, 5.0],
  [75.4, 3.0],
  [76.4, 2.9],
  [77.4, 2.8],
  [78.4, 2.7],
  [79.4, 2.6],
  [81.4, 2.5],
  [83.4, 2.4],
  [85.4, 2.3],
  [87.4, 2.2],
  [89.4, 2.1],
  [90.4, 2.0],
  [91.0, 1.9],
  [92.4, 1.8],
  [93.4, 1.7],
  [94.4, 1.6],
  [95.4, 1.5],
  [96.4, 1.4],
  [97.4, 1.3],
  [98.4, 1.2],
  [99.4, 1.1],
  [100, 1.0],
]

/** The 1.0-5.0 point a final average earns, or null if it is off the table. */
export function equivalentGrade(average: number): number | null {
  const found = EQUIVALENTS.find(([ceiling]) => average <= ceiling)
  return found ? found[1] : null
}

/**
 * Passing is above 75, not at it. The table above is very slightly kinder — it
 * gives 75.4 a 3.0 — but the remark is what the record reports, and this is the
 * line 2024 drew.
 */
export function remarksFor(average: number): Remark {
  return average <= 75 ? 'FAILED' : 'PASSED'
}

export interface FinalStanding {
  /** The rating in each period the record grades, or null where none is in yet. */
  ratings: Map<Period, number | null>
  /** The weighted average. Zero-based while periods are missing, never null. */
  average: number
  /** Active periods with no rating yet — while any remain, the average is partial. */
  missing: Period[]
  equivalent: number | null
  remarks: Remark
}

/**
 * Where one student stands: their periods, their average, and what that
 * average earns them.
 *
 * The GPA sheet and the printed record show the same three figures, so they
 * ask the same function for them rather than each adding up the periods its
 * own way — that divergence is how the 2024 code ended up with two spellings
 * of the final average that had to be kept in step by hand.
 */
export function finalStanding(
  record: ClassRecord,
  ratings: Map<Period, number | null>
): FinalStanding {
  const { grade, missing } = finalGrade(record, ratings)
  const average = grade ?? 0

  return {
    ratings,
    average,
    missing,
    equivalent: equivalentGrade(average),
    remarks: remarksFor(average),
  }
}
