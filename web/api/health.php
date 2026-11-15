<?php
/**
 * Health Check Endpoint (PRD-17)
 */

$localConfig = __DIR__ . '/config.local.php';
$databaseEnvironmentKeys = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS'];
$hasCompleteDatabaseEnvironment = true;
foreach ($databaseEnvironmentKeys as $key) {
    $value = getenv($key);
    if (!is_string($value) || trim($value) === '') {
        $hasCompleteDatabaseEnvironment = false;
        break;
    }
}

$respond = static function (array $body, int $statusCode): void {
    header('Content-Type: application/json; charset=UTF-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('X-Content-Type-Options: nosniff');
    http_response_code($statusCode);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
};

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    require_once __DIR__ . '/config.php';
    exit;
}

if (!is_file($localConfig) && !$hasCompleteDatabaseEnvironment) {
    $respond([
        'status' => 'degraded',
        'database' => 'unconfigured',
        'configuration' => 'missing'
    ], 503);
    exit;
}

require_once __DIR__ . '/config.php';

try {
    if (WC_ISOLATED_TEST_MODE) {
        require_once __DIR__ . '/db.php';
        $pdo = Database::getConnection();
    } else {
        $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_TIMEOUT => 2
        ]);
    }
    $dbOk = (int)$pdo->query('SELECT 1')->fetchColumn() === 1;
} catch (PDOException $e) {
    error_log('Shopademia health database check failed');
    $dbOk = false;
}

$status = $dbOk ? 'healthy' : 'degraded';
$code = $dbOk ? 200 : 503;

$respond([
    'status' => $status,
    'database' => $dbOk ? 'connected' : 'error'
], $code);
