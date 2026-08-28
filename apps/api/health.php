<?php
declare(strict_types=1);

/**
 * Is the server wired up? Proves Apache -> PHP -> PDO -> MySQL end to end.
 *
 * Reports which of the expected tables exist, so a half-run migration shows up
 * as a missing name rather than as a confusing failure somewhere else later.
 */

require __DIR__ . '/db.php';

$expected = ['instructors', 'students', 'class_records', 'enrollments', 'period_grades'];

$pdo = db();

$stmt = $pdo->query(
    'SELECT LOWER(table_name) AS name
       FROM information_schema.tables
      WHERE table_schema = DATABASE()'
);
$present = array_column($stmt->fetchAll(), 'name');
sort($present);

$missing = array_values(array_diff($expected, $present));

json_response([
    'ok'      => $missing === [],
    'server'  => $pdo->getAttribute(PDO::ATTR_SERVER_VERSION),
    'user'    => $pdo->query('SELECT CURRENT_USER()')->fetchColumn(),
    'tables'  => $present,
    'missing' => $missing,
], $missing === [] ? 200 : 500);
