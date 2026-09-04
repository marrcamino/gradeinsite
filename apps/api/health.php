<?php
declare(strict_types=1);

/**
 * Is the server wired up? Proves Apache -> PHP -> PDO -> MySQL end to end.
 *
 * Two callers, wanting different things:
 *
 *   * The setup script, running ON the server while installing it. It wants to
 *     know which tables exist, so a half-applied migration shows up as a
 *     missing name rather than as a confusing failure somewhere later.
 *   * The desktop app's "is the server there?" check, over the wi-fi. It only
 *     looks at whether the request succeeded.
 *
 * Only the first needs detail, and only the first is local — so that is the
 * line this draws. A student's browser on the school wi-fi can reach this
 * endpoint too, and the MySQL version, the database account's name and the
 * list of tables are all things worth not handing out for free. Answering by
 * where the request came from keeps the setup script working with no token to
 * configure and no credentials to type.
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
$healthy = $missing === [];

// The loopback addresses only. A forwarded header would be trivial to fake, so
// this deliberately trusts nothing but the socket.
$remote  = $_SERVER['REMOTE_ADDR'] ?? '';
$isLocal = in_array($remote, ['127.0.0.1', '::1'], true);

$body = ['ok' => $healthy];

if ($isLocal) {
    $body['server']  = $pdo->getAttribute(PDO::ATTR_SERVER_VERSION);
    $body['user']    = $pdo->query('SELECT CURRENT_USER()')->fetchColumn();
    $body['tables']  = $present;
    $body['missing'] = $missing;
}

// The status code still carries the answer either way, so a remote caller can
// tell a working server from a broken one without being told how it is built.
json_response($body, $healthy ? 200 : 500);
