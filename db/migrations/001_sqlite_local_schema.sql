-- GradeInsite — desktop local database (SQLite, via tauri-plugin-sql)
--
-- This file lives on the instructor's laptop and is the app's only source of
-- truth while offline. It mirrors the server schema table for table, so syncing
-- is a row-for-row push and never a reshaping exercise.
--
-- Differences from the server file, all of them SQLite facts rather than design
-- choices: no ENUM (CHECK constraints instead), no JSON type (TEXT holding
-- JSON, guarded by json_valid()), no TIMESTAMP (TEXT holding ISO-8601), and
-- grades are REAL.
--
-- Two tables exist only here:
--   * `server_endpoint`  — where the school server is, configured by the user
--                          (2024: `ipaddress`)
--   * `sync_outbox`      — what still needs pushing (2024: `unsync`)
--
-- One column exists only on the server: `students.password_hash`. The portal
-- login is not the instructor's business, so the desktop never holds it and
-- never sends it.
--
-- Nothing is created at runtime. 2024 issued CREATE TABLE per class record;
-- every table this app will ever need is in this file.

-- No PRAGMA and no BEGIN/COMMIT here. This file is applied by
-- tauri-plugin-sql's migration runner, which wraps it in its own transaction,
-- so a nested BEGIN would fail. Foreign keys are switched on per connection by
-- the plugin, not per migration.

-- ---------------------------------------------------------------------------
-- Local settings (one row each, enforced by the id CHECK)
-- ---------------------------------------------------------------------------

-- The signed-in instructor, cached so the app opens without the server.
-- `server_id` is their `instructors.id` in MySQL, and is what stamps every
-- record pushed up. It is also why `class_records` has no instructor column of
-- its own down here: a local database belongs to exactly one instructor.
CREATE TABLE IF NOT EXISTS "instructor_account" (
  "id"            INTEGER PRIMARY KEY CHECK ("id" = 1),
  "server_id"     INTEGER,
  "username"      TEXT,
  "password_hash" TEXT,
  "last_name"     TEXT,
  "first_name"    TEXT,
  "last_login_at" TEXT
);

-- Where the school server is. The user edits this in Settings; it is why the
-- app never needs a hardcoded IP address.
CREATE TABLE IF NOT EXISTS "server_endpoint" (
  "id"       INTEGER PRIMARY KEY CHECK ("id" = 1),
  "protocol" TEXT NOT NULL DEFAULT 'http://',
  "address"  TEXT NOT NULL DEFAULT '192.168.0.1',
  "port"     TEXT,
  "path"     TEXT NOT NULL DEFAULT 'gradeinsite/',
  -- When the last full sync finished, so the UI can say "last synced ..."
  -- without scanning the outbox.
  "last_sync_at" TEXT
);

-- ---------------------------------------------------------------------------
-- Mirrored data
-- ---------------------------------------------------------------------------

-- `server_id` is NULL until the row has been pushed; that is how the sync knows
-- what is new versus what is an update.
CREATE TABLE IF NOT EXISTS "students" (
  "id"             INTEGER PRIMARY KEY AUTOINCREMENT,
  "server_id"      INTEGER UNIQUE,
  "student_no"     TEXT NOT NULL UNIQUE,
  "last_name"      TEXT NOT NULL,
  "first_name"     TEXT NOT NULL,
  "middle_initial" TEXT,
  "program"        TEXT NOT NULL,
  "year_level"     INTEGER,
  "contact"        TEXT,
  "created_at"     TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at"     TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ("year_level" IS NULL OR "year_level" BETWEEN 1 AND 6)
);

CREATE TABLE IF NOT EXISTS "class_records" (
  "id"                INTEGER PRIMARY KEY AUTOINCREMENT,
  "server_id"         INTEGER UNIQUE,

  "program"           TEXT    NOT NULL,
  "year_level"        INTEGER NOT NULL,
  "course_code"       TEXT    NOT NULL,
  "course_name"       TEXT    NOT NULL,
  "term"              INTEGER NOT NULL,
  "school_year_start" INTEGER NOT NULL,
  "school_year_end"   INTEGER NOT NULL,
  "schedule"          TEXT,
  "instructor_name"   TEXT,

  -- Grade components: what each grading period is worth. 0 means the school
  -- does not use that period, and its sheet stays hidden.
  "weight_prelim"     REAL NOT NULL DEFAULT 0,
  "weight_premid"     REAL NOT NULL DEFAULT 0,
  "weight_midterm"    REAL NOT NULL DEFAULT 0,
  "weight_prefinal"   REAL NOT NULL DEFAULT 0,
  "weight_final"      REAL NOT NULL DEFAULT 0,

  -- Percentage distribution: within one period, what each kind of work is worth.
  "pct_quizzes"       REAL NOT NULL DEFAULT 0,
  "pct_attendance"    REAL NOT NULL DEFAULT 0,
  "pct_assignment"    REAL NOT NULL DEFAULT 0,
  "pct_course_output" REAL NOT NULL DEFAULT 0,
  "pct_oral"          REAL NOT NULL DEFAULT 0,
  "pct_major_exam"    REAL NOT NULL DEFAULT 0,

  -- The shape of the sheet (2024: `sheetnum`): how many score columns each
  -- period has and what each one is worth. A record with no scores yet still
  -- has to draw its columns, and quizzes set up in advance have to survive a
  -- restart.
  --
  --   {"prelim":{"qe":[20,20,15],"at":[1,1],"as":[10],"co":100,"op":50,"me":60}}
  "sheet_layout"      TEXT CHECK ("sheet_layout" IS NULL OR json_valid("sheet_layout")),

  "created_at"        TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at"        TEXT NOT NULL DEFAULT (datetime('now')),
  "synced_at"         TEXT,

  CHECK ("term" IN (1, 2)),
  CHECK ("year_level" BETWEEN 1 AND 6),
  CHECK ("school_year_end" = "school_year_start" + 1),
  CHECK ("weight_prelim" + "weight_premid" + "weight_midterm"
       + "weight_prefinal" + "weight_final" IN (0, 100)),
  CHECK ("pct_quizzes" + "pct_attendance" + "pct_assignment"
       + "pct_course_output" + "pct_oral" + "pct_major_exam" IN (0, 100))
);

CREATE TABLE IF NOT EXISTS "enrollments" (
  "id"              INTEGER PRIMARY KEY AUTOINCREMENT,
  "server_id"       INTEGER UNIQUE,
  "class_record_id" INTEGER NOT NULL REFERENCES "class_records" ("id") ON DELETE CASCADE,
  "student_id"      INTEGER NOT NULL REFERENCES "students" ("id")      ON DELETE CASCADE,
  "row_order"       INTEGER,
  "final_grade"     REAL,
  "remarks"         TEXT,
  "created_at"      TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at"      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE ("class_record_id", "student_id"),
  CHECK ("final_grade" IS NULL OR "final_grade" BETWEEN 0 AND 100),
  -- The server holds this as an ENUM, which matches case-insensitively and
  -- stores the declared spelling. This CHECK is case-sensitive, so it is the
  -- stricter of the two: write remarks in upper case and both sides agree.
  CHECK ("remarks" IS NULL OR "remarks" IN ('PASSED','FAILED','INC','DROPPED'))
);

-- One row per student per grading period. `raw_scores` is the JSON behind the
-- grade — the individual marks the sheet shows:
--
--   {"qe":[10,8,null],"at":[1,1,0],"as":[20],"co":95,"op":88,"me":47}
--
-- Its lists line up position for position with the matching period of
-- `class_records.sheet_layout`, which holds the perfect scores.
CREATE TABLE IF NOT EXISTS "period_grades" (
  "id"            INTEGER PRIMARY KEY AUTOINCREMENT,
  "server_id"     INTEGER UNIQUE,
  "enrollment_id" INTEGER NOT NULL REFERENCES "enrollments" ("id") ON DELETE CASCADE,
  "period"        TEXT    NOT NULL
                  CHECK ("period" IN ('prelim','premid','midterm','prefinal','final')),
  "grade"         REAL,
  "is_incomplete" INTEGER NOT NULL DEFAULT 0 CHECK ("is_incomplete" IN (0, 1)),
  "raw_scores"    TEXT CHECK ("raw_scores" IS NULL OR json_valid("raw_scores")),
  "created_at"    TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at"    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE ("enrollment_id", "period"),
  CHECK ("grade" IS NULL OR "grade" BETWEEN 0 AND 100)
);

-- ---------------------------------------------------------------------------
-- Outbox
-- ---------------------------------------------------------------------------

-- What has changed since the laptop last reached the server. The sync drains
-- this in order; anything still here means the school server has not seen it.
-- `payload` is the JSON body that will be posted, captured at queue time so a
-- later local edit cannot rewrite history mid-sync.
--
-- A delete is the reason `entity_id` alone is not enough to replay a row: by
-- the time the outbox drains, the local row is gone, so `payload` has to carry
-- whatever the server needs to find its copy.
CREATE TABLE IF NOT EXISTS "sync_outbox" (
  "id"          INTEGER PRIMARY KEY AUTOINCREMENT,
  "entity"      TEXT NOT NULL
                CHECK ("entity" IN ('student','class_record','enrollment','period_grade')),
  "entity_id"   INTEGER NOT NULL,
  "operation"   TEXT NOT NULL CHECK ("operation" IN ('insert','update','delete')),
  "payload"     TEXT NOT NULL CHECK (json_valid("payload")),
  "queued_at"   TEXT NOT NULL DEFAULT (datetime('now')),
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "last_error"  TEXT
);

CREATE INDEX IF NOT EXISTS "ix_students_class"      ON "students"      ("program", "year_level");
CREATE INDEX IF NOT EXISTS "ix_class_records_course" ON "class_records" ("course_code", "school_year_start", "term");
CREATE INDEX IF NOT EXISTS "ix_enrollments_record"  ON "enrollments"   ("class_record_id");
CREATE INDEX IF NOT EXISTS "ix_enrollments_student" ON "enrollments"   ("student_id");
CREATE INDEX IF NOT EXISTS "ix_period_grades_enr"   ON "period_grades" ("enrollment_id");
CREATE INDEX IF NOT EXISTS "ix_outbox_queued"       ON "sync_outbox"   ("queued_at");

-- Keep `updated_at` honest without the app having to remember. The server gets
-- this for free from ON UPDATE CURRENT_TIMESTAMP; SQLite needs triggers.
CREATE TRIGGER IF NOT EXISTS "tg_students_updated"
AFTER UPDATE ON "students" FOR EACH ROW
WHEN OLD."updated_at" = NEW."updated_at"
BEGIN
  UPDATE "students" SET "updated_at" = datetime('now') WHERE "id" = OLD."id";
END;

CREATE TRIGGER IF NOT EXISTS "tg_class_records_updated"
AFTER UPDATE ON "class_records" FOR EACH ROW
WHEN OLD."updated_at" = NEW."updated_at"
BEGIN
  UPDATE "class_records" SET "updated_at" = datetime('now') WHERE "id" = OLD."id";
END;

CREATE TRIGGER IF NOT EXISTS "tg_enrollments_updated"
AFTER UPDATE ON "enrollments" FOR EACH ROW
WHEN OLD."updated_at" = NEW."updated_at"
BEGIN
  UPDATE "enrollments" SET "updated_at" = datetime('now') WHERE "id" = OLD."id";
END;

CREATE TRIGGER IF NOT EXISTS "tg_period_grades_updated"
AFTER UPDATE ON "period_grades" FOR EACH ROW
WHEN OLD."updated_at" = NEW."updated_at"
BEGIN
  UPDATE "period_grades" SET "updated_at" = datetime('now') WHERE "id" = OLD."id";
END;

-- The two single-row settings tables start empty-but-present, so the app can
-- UPDATE them without a first-run special case.
INSERT OR IGNORE INTO "instructor_account" ("id") VALUES (1);
INSERT OR IGNORE INTO "server_endpoint"    ("id") VALUES (1);
