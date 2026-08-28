-- GradeInsite — the account the PHP API connects as (MySQL 8.4)
--
-- Run this once, as root, after 001_mysql_server_schema.sql.
--
-- The API never connects as root. It gets its own account with exactly the
-- privileges the endpoints need and nothing else: it can read and write rows,
-- but it cannot create, alter or drop a table, so a mistake in a query -- or a
-- flaw that gets past the prepared statements -- cannot reshape the database.
--
-- Replace CHANGE_ME with a real password, and put the same value in
-- apps/api/config.local.php, which is gitignored.

CREATE USER IF NOT EXISTS 'gradeinsite'@'localhost'
  IDENTIFIED BY 'CHANGE_ME';

GRANT SELECT, INSERT, UPDATE, DELETE
  ON `gradeinsite`.* TO 'gradeinsite'@'localhost';

FLUSH PRIVILEGES;
