<?php
/**
 * Error Log Viewer API Endpoint (Owner Only) (Sprint 6, GAP-14)
 */

require_once __DIR__ . '/db.php';

$pdo = Database::getConnection();
$admin = requireAdminToken($pdo);

if ($admin['role'] !== 'Super Admin') {
    jsonResponse(['error' => 'Error log viewer is restricted to the store owner.'], 403);
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$stmt = $pdo->query("SELECT * FROM error_logs ORDER BY id DESC LIMIT 100");
jsonResponse(['status' => 'success', 'data' => $stmt->fetchAll()]);
