<?php
/**
 * Health Check Endpoint (PRD-17)
 */

require_once __DIR__ . '/db.php';

try {
    $pdo = Database::getConnection();
    $stmt = $pdo->query("SELECT 1");
    $dbOk = $stmt && $stmt->fetchColumn() == 1;
} catch (Exception $e) {
    $dbOk = false;
}

$status = $dbOk ? 'healthy' : 'degraded';
$code = $dbOk ? 200 : 503;

jsonResponse([
    'status' => $status,
    'database' => $dbOk ? 'connected' : 'error',
    'php_version' => PHP_VERSION,
    'time_utc' => gmdate('Y-m-d H:i:s')
], $code);
