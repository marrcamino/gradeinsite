-- GradeInsite — desktop local database, migration 3
--
-- The list of programs the school offers.
--
-- `class_records.program` and `students.program` hold an abbreviation as text —
-- "BSIT" — and until now the instructor typed it into every record. Two
-- spellings of the same program split it in two: a class list filtered by
-- program misses half of itself, and the printed record carries whichever
-- version was typed that day.
--
-- This is the same table 2024 had, with the same three columns. It never
-- reached the server there and it does not here either, which is why there is
-- no matching MySQL migration: a program is a fact about the school, the same
-- on every laptop, and nothing on the server reads it. The student portal shows
-- a student the grades for their own courses and never names a program's dean.
-- It sits alongside `server_endpoint` and `sync_outbox` as a table this laptop
-- keeps to itself, and it has no `server_id` and no outbox trigger for the same
-- reason.
--
-- `dean` is here because the printed class record is signed by the dean OF THAT
-- PROGRAM. 2024 looked the name up from this table by the record's program, so
-- an instructor teaching for two departments got the right signature on each
-- printed sheet without retyping it.
--
-- No PRAGMA and no BEGIN/COMMIT: the migration runner supplies the transaction.

CREATE TABLE IF NOT EXISTS "programs" (
  "id"         INTEGER PRIMARY KEY AUTOINCREMENT,
  -- "Bachelor of Science in Information Technology" — what the picker shows.
  "pgname"     TEXT NOT NULL,
  -- "BSIT" — what is stored on a record and printed on the sheet. Unique
  -- because it is the value records point at, and NOCASE so that "bsit" cannot
  -- be added beside "BSIT" and quietly become a second program.
  "abbv"       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  -- The dean who signs a printed class record for this program.
  "dean"       TEXT,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now')),
  CHECK (length(trim("pgname")) > 0),
  CHECK (length(trim("abbv")) > 0)
);
