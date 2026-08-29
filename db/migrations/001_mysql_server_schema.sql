-- GradeInsite — server database (MySQL 8.4)
--
-- Lives on the school machine, served to both apps over the local network by
-- Apache + PHP. The desktop app pushes here when it can reach the server; the
-- student portal only ever reads from here.
--
-- Design notes (differences from the 2024 database, and why):
--
--   * No per-record tables. 2024 created "rcrd_<recordId>_<instructorId>" at
--     runtime, so finding one student's grades meant scanning every table in
--     the database. Here a class record is a row, and who is in it is a row in
--     `enrollments`.
--   * A student exists once. 2024 copied name, program and year into every
--     per-record table.
--   * Fixed-shape data is columns; only variable-length data is JSON. The
--     weights are a known set, so they are DECIMAL columns that SQL can sum and
--     validate. The raw score cells are a list whose length depends on how many
--     quizzes the instructor gave, so they stay JSON in `period_grades`.
--   * `fn` is gone. In 2024 it meant "Final" in one table and "First Name" in
--     another. Columns are spelled out here.
--   * Passwords are hashes, never plaintext (PHP password_hash(), bcrypt).
--
-- Every table the desktop pushes has a natural unique key, so re-sending a row
-- after a dropped connection updates it instead of duplicating it. That is what
-- makes the sync safe to retry:
--
--   students       student_no
--   class_records  (instructor_id, local_id)
--   enrollments    (class_record_id, student_id)
--   period_grades  (enrollment_id, period)

CREATE DATABASE IF NOT EXISTS `gradeinsite`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `gradeinsite`;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `period_grades`;
DROP TABLE IF EXISTS `enrollments`;
DROP TABLE IF EXISTS `class_records`;
DROP TABLE IF EXISTS `students`;
DROP TABLE IF EXISTS `instructors`;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- Migration bookkeeping
-- ---------------------------------------------------------------------------
--
-- The desktop gets tauri-plugin-sql's migration runner; the server has nothing,
-- because the stack is plain PHP by design. This table is the substitute: it
-- records which files have been applied to this database, so the next person to
-- open MySQL Workbench can tell without guessing. It is deliberately not part
-- of the DROP list above.

CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `filename`   VARCHAR(120) NOT NULL,
  `applied_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`filename`)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

CREATE TABLE `instructors` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`      VARCHAR(60)  NOT NULL,
  `password_hash` CHAR(60)     NOT NULL COMMENT 'password_hash(), bcrypt',
  `last_name`     VARCHAR(60)  NOT NULL,
  `first_name`    VARCHAR(60)  NOT NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_instructors_username` (`username`)
) ENGINE=InnoDB;

CREATE TABLE `students` (
  `id`             INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `student_no`     VARCHAR(30)      NOT NULL COMMENT 'school ID number; the portal login name',
  `last_name`      VARCHAR(60)      NOT NULL,
  `first_name`     VARCHAR(60)      NOT NULL,
  `middle_initial` VARCHAR(5)       DEFAULT NULL,
  `program`        VARCHAR(30)      NOT NULL,
  `year_level`     TINYINT UNSIGNED DEFAULT NULL,
  `contact`        VARCHAR(30)      DEFAULT NULL,
  `password_hash`  CHAR(60)         DEFAULT NULL COMMENT 'portal login; NULL until the student first sets one',
  `created_at`     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                             ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_students_student_no` (`student_no`),
  KEY `ix_students_name` (`last_name`, `first_name`),
  KEY `ix_students_class` (`program`, `year_level`),
  CONSTRAINT `ck_students_year_level`
    CHECK (`year_level` IS NULL OR `year_level` BETWEEN 1 AND 6)
) ENGINE=InnoDB;

-- `password_hash` is the one column on a mirrored table that the server owns:
-- the desktop has no copy of it and never sends it. A sync that updates a
-- student must therefore name its columns rather than replacing the row, or it
-- would log the student out of the portal.

-- ---------------------------------------------------------------------------
-- Class records
-- ---------------------------------------------------------------------------

CREATE TABLE `class_records` (
  `id`                INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  `instructor_id`     INT UNSIGNED      NOT NULL,
  `local_id`          INT UNSIGNED      DEFAULT NULL
                      COMMENT 'the row id this record has in the desktop SQLite file; makes sync idempotent',

  `program`           VARCHAR(30)       NOT NULL,
  `year_level`        TINYINT UNSIGNED  NOT NULL,
  `course_code`       VARCHAR(30)       NOT NULL,
  `course_name`       VARCHAR(120)      NOT NULL,
  `term`              TINYINT UNSIGNED  NOT NULL COMMENT '1 = first semester, 2 = second',
  `school_year_start` SMALLINT UNSIGNED NOT NULL,
  `school_year_end`   SMALLINT UNSIGNED NOT NULL,
  `schedule`          VARCHAR(60)       DEFAULT NULL,
  `instructor_name`   VARCHAR(120)      DEFAULT NULL
                      COMMENT 'name printed on the sheet; may differ from the account holder',

  -- Grade components (2024: gcValues). How much each grading period is worth.
  -- A weight of 0 means the school does not use that period, and the desktop
  -- app hides its sheet. The five together should total 100.
  `weight_prelim`     DECIMAL(5,2)      NOT NULL DEFAULT 0.00,
  `weight_premid`     DECIMAL(5,2)      NOT NULL DEFAULT 0.00,
  `weight_midterm`    DECIMAL(5,2)      NOT NULL DEFAULT 0.00,
  `weight_prefinal`   DECIMAL(5,2)      NOT NULL DEFAULT 0.00,
  `weight_final`      DECIMAL(5,2)      NOT NULL DEFAULT 0.00,

  -- Percentage distribution (2024: pdValues). Within one period, how much each
  -- kind of work is worth. These six should also total 100.
  `pct_quizzes`       DECIMAL(5,2)      NOT NULL DEFAULT 0.00 COMMENT 'quizzes and exercises',
  `pct_attendance`    DECIMAL(5,2)      NOT NULL DEFAULT 0.00,
  `pct_assignment`    DECIMAL(5,2)      NOT NULL DEFAULT 0.00,
  `pct_course_output` DECIMAL(5,2)      NOT NULL DEFAULT 0.00 COMMENT 'course output / project',
  `pct_oral`          DECIMAL(5,2)      NOT NULL DEFAULT 0.00 COMMENT 'oral participation',
  `pct_major_exam`    DECIMAL(5,2)      NOT NULL DEFAULT 0.00,

  -- The shape of the sheet, recovering what 2024 kept in `sheetnum`: how many
  -- score columns each period has and what each one is worth. Without it, a
  -- record with no scores entered yet has no columns to draw, and an instructor
  -- who set up ten quizzes in advance would lose that on the next open.
  --
  --   {"prelim":{"qe":[20,20,15],"at":[1,1],"as":[10],"co":100,"op":50,"me":60}}
  --
  -- Each list holds the perfect score of one column, so its length is the
  -- column count. Course output, oral participation and the major exam are
  -- single columns, so they are single numbers rather than lists.
  `sheet_layout`      JSON              DEFAULT NULL,

  `created_at`        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP
                                                 ON UPDATE CURRENT_TIMESTAMP,
  `synced_at`         TIMESTAMP         NULL DEFAULT NULL
                      COMMENT 'when the desktop app last pushed this record',

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_class_records_origin` (`instructor_id`, `local_id`),
  KEY `ix_class_records_course` (`course_code`, `school_year_start`, `term`),
  CONSTRAINT `fk_class_records_instructor`
    FOREIGN KEY (`instructor_id`) REFERENCES `instructors` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `ck_class_records_term`
    CHECK (`term` IN (1, 2)),
  CONSTRAINT `ck_class_records_year_level`
    CHECK (`year_level` BETWEEN 1 AND 6),
  CONSTRAINT `ck_class_records_school_year`
    CHECK (`school_year_end` = `school_year_start` + 1),
  CONSTRAINT `ck_class_records_period_weights`
    CHECK (`weight_prelim` + `weight_premid` + `weight_midterm`
         + `weight_prefinal` + `weight_final` IN (0, 100)),
  CONSTRAINT `ck_class_records_component_weights`
    CHECK (`pct_quizzes` + `pct_attendance` + `pct_assignment`
         + `pct_course_output` + `pct_oral` + `pct_major_exam` IN (0, 100))
) ENGINE=InnoDB;

-- Which students are in which class record. This is the table that makes the
-- student portal a single query instead of a scan.
CREATE TABLE `enrollments` (
  `id`              INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  `class_record_id` INT UNSIGNED      NOT NULL,
  `student_id`      INT UNSIGNED      NOT NULL,
  `row_order`       SMALLINT UNSIGNED DEFAULT NULL
                    COMMENT 'position in the sheet, so print order survives a sync',
  `final_grade`     DECIMAL(5,2)      DEFAULT NULL
                    COMMENT 'computed by the desktop app from the period grades and weights; the portal displays it, never recomputes it',
  `remarks`         ENUM('PASSED','FAILED','INC','DROPPED') DEFAULT NULL,
  `created_at`      TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP
                                               ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_enrollments` (`class_record_id`, `student_id`),
  KEY `ix_enrollments_student` (`student_id`),
  CONSTRAINT `fk_enrollments_class_record`
    FOREIGN KEY (`class_record_id`) REFERENCES `class_records` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_enrollments_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `ck_enrollments_final_grade`
    CHECK (`final_grade` IS NULL OR `final_grade` BETWEEN 0 AND 100)
) ENGINE=InnoDB;

-- One row per student per grading period.
--
-- `grade` is the computed period grade the portal shows. `raw_scores` keeps the
-- individual marks behind it, as JSON because the number of quizzes and
-- assignments is up to the instructor:
--
--   {"qe":[10,8,null],"at":[1,1,0],"as":[20],"co":95,"op":88,"me":47}
--
-- qe / at / as are lists (quizzes and exercises, attendance, assignments);
-- co / op / me are single marks (course output, oral participation, major exam).
-- The lists line up position for position with the ones in the matching period
-- of `class_records.sheet_layout`, which holds the perfect scores. A null cell
-- is a mark not entered yet, which is what `is_incomplete` summarises for the
-- portal.
CREATE TABLE `period_grades` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `enrollment_id` INT UNSIGNED NOT NULL,
  `period`        ENUM('prelim','premid','midterm','prefinal','final') NOT NULL,
  `grade`         DECIMAL(5,2) DEFAULT NULL COMMENT 'NULL = not graded yet',
  `is_incomplete` TINYINT(1)   NOT NULL DEFAULT 0
                  COMMENT 'the 2024 "<period>lack" flag: some scores are still missing',
  `raw_scores`    JSON         DEFAULT NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                        ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_period_grades` (`enrollment_id`, `period`),
  CONSTRAINT `fk_period_grades_enrollment`
    FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `ck_period_grades_grade`
    CHECK (`grade` IS NULL OR `grade` BETWEEN 0 AND 100),
  CONSTRAINT `ck_period_grades_incomplete`
    CHECK (`is_incomplete` IN (0, 1))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- The whole student portal, in one query
-- ---------------------------------------------------------------------------
--
--   SELECT c.course_code, c.course_name, c.term,
--          c.school_year_start, c.school_year_end,
--          e.final_grade, e.remarks,
--          p.period, p.grade, p.is_incomplete
--     FROM enrollments   e
--     JOIN class_records c ON c.id = e.class_record_id
--     LEFT JOIN period_grades p ON p.enrollment_id = e.id
--    WHERE e.student_id = ?
--    ORDER BY c.school_year_start DESC, c.term, c.course_code, p.period;
--
-- `p.period` sorts correctly on its own: a MySQL ENUM sorts by the order its
-- values were declared, which here is prelim through final.
--
-- The student id comes from the PHP session, never from the request, so a
-- student cannot fetch someone else's grades by changing a parameter.

INSERT INTO `schema_migrations` (`filename`)
  VALUES ('001_mysql_server_schema.sql')
  ON DUPLICATE KEY UPDATE `applied_at` = CURRENT_TIMESTAMP;
