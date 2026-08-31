-- GradeInsite — desktop local database, migration 2
--
-- Fix a class record edit being queued when nobody edited anything.
--
-- `tg_class_records_outbox_update` decided whether an UPDATE was a real edit by
-- asking whether the sync's own bookkeeping columns had changed:
--
--   WHEN OLD."server_id" IS NEW."server_id" AND OLD."synced_at" IS NEW."synced_at"
--
-- The reasoning was that a push writes `server_id` and `synced_at` back after
-- the server accepts a record, so an UPDATE that leaves both alone must have
-- come from the instructor. That holds for the other three tables, whose sync
-- write only ever touches `server_id` and is skipped entirely when the value is
-- already there (`WHERE ... AND "server_id" IS NOT $1`).
--
-- A class record is different, because its sync write also refreshes
-- `synced_at` to the current time. That write cannot be skipped — a re-push of
-- an edited record keeps the same `server_id`, and `synced_at` still has to
-- move — so the timestamp is what the guard leans on. `synced_at` has
-- millisecond resolution, and one push can stamp the same record twice: a
-- record that was created and then edited before the computer next reached the
-- server has two entries in the queue, and `markPushed()` runs once per entry
-- with no network in between. When both stamps land inside the same
-- millisecond, neither guarded column changes, the guard reads the write as an
-- instructor edit, and queues a change nobody made.
--
-- The queue then never reports empty: every sync leaves an entry behind, so the
-- app goes on saying there is something left to send. Measured on the
-- development machine it happened in a little over half of the pushes that
-- carried two changes for one record — the database is in WAL mode, where a
-- write does not wait for the disk and two of them comfortably fit in a
-- millisecond.
--
-- So the trigger now asks the opposite, and more direct, question: did any
-- column the payload actually carries change? A sync write touches none of
-- them, so it cannot fire the trigger however fast the clock ticks, and there
-- is no longer a timing question to get wrong. `IS NOT` rather than `<>`
-- throughout, so a column going to or from NULL counts as a change.
--
-- The payload below is unchanged from migration 1.

DROP TRIGGER IF EXISTS "tg_class_records_outbox_update";

CREATE TRIGGER "tg_class_records_outbox_update"
AFTER UPDATE ON "class_records" FOR EACH ROW
WHEN OLD."program"           IS NOT NEW."program"
  OR OLD."year_level"        IS NOT NEW."year_level"
  OR OLD."course_code"       IS NOT NEW."course_code"
  OR OLD."course_name"       IS NOT NEW."course_name"
  OR OLD."term"              IS NOT NEW."term"
  OR OLD."school_year_start" IS NOT NEW."school_year_start"
  OR OLD."school_year_end"   IS NOT NEW."school_year_end"
  OR OLD."schedule"          IS NOT NEW."schedule"
  OR OLD."instructor_name"   IS NOT NEW."instructor_name"
  OR OLD."weight_prelim"     IS NOT NEW."weight_prelim"
  OR OLD."weight_premid"     IS NOT NEW."weight_premid"
  OR OLD."weight_midterm"    IS NOT NEW."weight_midterm"
  OR OLD."weight_prefinal"   IS NOT NEW."weight_prefinal"
  OR OLD."weight_final"      IS NOT NEW."weight_final"
  OR OLD."pct_quizzes"       IS NOT NEW."pct_quizzes"
  OR OLD."pct_attendance"    IS NOT NEW."pct_attendance"
  OR OLD."pct_assignment"    IS NOT NEW."pct_assignment"
  OR OLD."pct_course_output" IS NOT NEW."pct_course_output"
  OR OLD."pct_oral"          IS NOT NEW."pct_oral"
  OR OLD."pct_major_exam"    IS NOT NEW."pct_major_exam"
  OR OLD."sheet_layout"      IS NOT NEW."sheet_layout"
BEGIN
  INSERT INTO "sync_outbox" ("entity", "entity_id", "operation", "payload")
  VALUES ('class_record', NEW."id", 'update', json_object(
    'local_id',          NEW."id",
    'program',           NEW."program",
    'year_level',        NEW."year_level",
    'course_code',       NEW."course_code",
    'course_name',       NEW."course_name",
    'term',              NEW."term",
    'school_year_start', NEW."school_year_start",
    'school_year_end',   NEW."school_year_end",
    'schedule',          NEW."schedule",
    'instructor_name',   NEW."instructor_name",
    'weight_prelim',     NEW."weight_prelim",
    'weight_premid',     NEW."weight_premid",
    'weight_midterm',    NEW."weight_midterm",
    'weight_prefinal',   NEW."weight_prefinal",
    'weight_final',      NEW."weight_final",
    'pct_quizzes',       NEW."pct_quizzes",
    'pct_attendance',    NEW."pct_attendance",
    'pct_assignment',    NEW."pct_assignment",
    'pct_course_output', NEW."pct_course_output",
    'pct_oral',          NEW."pct_oral",
    'pct_major_exam',    NEW."pct_major_exam",
    'sheet_layout',      json(NEW."sheet_layout")
  ));
END;
