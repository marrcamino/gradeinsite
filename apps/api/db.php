<?php
declare(strict_types=1);

/**
 * Shared PDO connection for every GradeInsite endpoint.
 *
 * PDO with real prepared statements, so query values can never be parsed
 * as SQL. The 2024 version interpolated values straight into the query
 * string, which was injectable.
 */
function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $configFile = __DIR__ . '/config.local.php';
    if (!is_file($configFile)) {
        json_error('Server is not configured: config.local.php is missing.', 500);
    }
    $cfg = require $configFile;

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $cfg['host'],
        $cfg['port'],
        $cfg['database'],
        $cfg['charset']
    );

    try {
        $pdo = new PDO($dsn, $cfg['username'], $cfg['password'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        // Never leak credentials or SQL to the client.
        error_log('DB connection failed: ' . $e->getMessage());
        json_error('Database connection failed.', 500);
    }

    return $pdo;
}

/** Decode a JSON request body into an array. */
function json_input(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw === false ? '' : $raw, true);
    return is_array($data) ? $data : [];
}

function json_response(mixed $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data);
    exit;
}

function json_error(string $message, int $status = 400): never
{
    json_response(['error' => $message], $status);
}
