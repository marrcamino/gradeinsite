import { NOW, insert, rows, run } from './connection'
import type { Program } from './types'

/**
 * The school's programs.
 *
 * A local list, never synced: the server has no programs table and nothing over
 * there reads one. It exists so that "BSIT" is chosen rather than typed, and so
 * that the dean who signs a printed class record is looked up from the program
 * instead of being retyped on every sheet.
 */

export interface ProgramInput {
  pgname: string
  abbv: string
  dean?: string | null
}

const COLUMNS = 'id, pgname, abbv, dean, created_at, updated_at'

export function listPrograms(): Promise<Program[]> {
  return rows<Program>(`SELECT ${COLUMNS} FROM programs ORDER BY abbv`)
}

/**
 * The abbreviation is what records store, so it is normalised on the way in.
 * Records written before this table existed hold "BSIT", and a program added as
 * "bsit" has to match them rather than sit beside them.
 */
export function createProgram(input: ProgramInput): Promise<number> {
  return insert('INSERT INTO programs (pgname, abbv, dean) VALUES ($1, $2, $3)', [
    input.pgname.trim(),
    input.abbv.trim().toUpperCase(),
    input.dean?.trim() || null,
  ])
}

export function updateProgram(id: number, input: ProgramInput): Promise<number> {
  return run(
    `UPDATE programs
        SET pgname = $1, abbv = $2, dean = $3, updated_at = ${NOW}
      WHERE id = $4`,
    [input.pgname.trim(), input.abbv.trim().toUpperCase(), input.dean?.trim() || null, id]
  )
}

/**
 * Deleting a program leaves the records that name it alone.
 *
 * `class_records.program` is text, not a foreign key, so a record keeps the
 * abbreviation it was created with. That is deliberate: a program the school
 * stops offering must not take last year's class records down with it.
 */
export function deleteProgram(id: number): Promise<number> {
  return run('DELETE FROM programs WHERE id = $1', [id])
}
