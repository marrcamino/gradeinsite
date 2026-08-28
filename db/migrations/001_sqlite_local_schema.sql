-- GradeInsite — desktop local database (SQLite, via tauri-plugin-sql)
--
-- This file lives on the instructor's laptop and is the app's only source of
-- truth while offline. It mirrors the server schema table for table, so syncing
-- is a row-for-row push and never a reshaping exercise.
--
-- Differences from the server file, all of them SQLite facts rather than design
-- choices: no ENUM (CHECK constraints instead), no JSON type (TEXT holding
-- JSON), no TIMESTAMP (TEXT holding ISO-8601), and grades are REAL.
--
-- Two tables exist only here:
--   * `server_endpoint`  — where the school server is, configured by the user
--                          (2024: `ipaddress`)
--   * `sync_outbox`      — what still needs pushing (2024: `unsync`)
--
-- Nothing is created at runtime. 2024 issued CREATE TABLE per class record;
-- every table this app will ever need is in this file.

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- ---------------------------------------------------------------------------
-- Local settings (one row each, enforced by the id CHECK)
-- ---------------------------------------------------------------------------

-- The signed-in instructor, cached so the app opens without the server.
-- `server_id` is their `instructors.id` in MySQL, and is what stamps every
-- record pushed up.
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
  "path"     TEXT NOT NULL DEFAULT 'gradeinsite/'
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
  "updated_at"     TEXT NOT NULL DEFAULT (datetime('now'))
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

  "created_at"        TEXT NOT NULL DEFAULT (datetime('now')),
  "updated_at"        TEXT NOT NULL DEFAULT (datetime('now')),
  "synced_at"         TEXT,

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
  UNIQUE ("class_record_id", "student_id")
);

-- One row per student per grading period. `raw_scores` is the JSON behind the
-- grade — the individual marks the sheet shows:
--
--   {"qe":[10,8,null],"at":[1,1,0],"as":[20],"co":95,"op":88,"me":47}
CREATE TABLE IF NOT EXISTS "period_grades" (
  "id"            INTEGER PRIMARY KEY AUTOINCREMENT,
  "server_id"     INTEGER UNIQUE,
  "enrollment_id" INTEGER NOT NULL REFERENCES "enrollments" ("id") ON DELETE CASCADE,
  "period"        TEXT    NOT NULL
                  CHECK ("period" IN ('prelim','premid','midterm','prefinal','final')),
  "grade"         REAL,
  "is_incomplete" INTEGER NOT NULL DEFAULT 0 CHECK ("is_incomplete" IN (0, 1)),
  "raw_scores"    TEXT,
  "updated_at"    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE ("enrollment_id", "period")
);

-- ---------------------------------------------------------------------------
-- Outbox
-- ---------------------------------------------------------------------------

-- What has changed since the laptop last reached the server. The sync drains
-- this in order; anything still here means the school server has not seen it.
-- `payload` is the JSON body that will be posted, captured at queue time so a
-- later local edit cannot rewrite history mid-sync.
CREATE TABLE IF NOT EXISTS "sync_outbox" (
  "id"          INTEGER PRIMARY KEY AUTOINCREMENT,
  "entity"      TEXT NOT NULL
                CHECK ("entity" IN ('student','class_record','enrollment','period_grade')),
  "entity_id"   INTEGER NOT NULL,
  "operation"   TEXT NOT NULL CHECK ("operation" IN ('insert','update','delete')),
  "payload"     TEXT NOT NULL,
  "queued_at"   TEXT NOT NULL DEFAULT (datetime('now')),
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "last_error"  TEXT
);

CREATE INDEX IF NOT EXISTS "ix_enrollments_record"  ON "enrollments"   ("class_record_id");
CREATE INDEX IF NOT EXISTS "ix_enrollments_student" ON "enrollments"   ("student_id");
CREATE INDEX IF NOT EXISTS "ix_period_grades_enr"   ON "period_grades" ("enrollment_id");
CREATE INDEX IF NOT EXISTS "ix_outbox_queued"       ON "sync_outbox"   ("queued_at");

-- The two single-row settings tables start empty-but-present, so the app can
-- UPDATE them without a first-run special case.
INSERT OR IGNORE INTO "instructor_account" ("id") VALUES (1);
INSERT OR IGNORE INTO "server_endpoint"    ("id") VALUES (1);

COMMIT;
