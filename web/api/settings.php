<?php
/**
 * Settings API Endpoint
 * Dedicated backend for Screen 9 (Settings) and public store configuration
 */

require_once __DIR__ . '/db.php';

$pdo = Database::getConnection();
$method = $_SERVER['REQUEST_METHOD'];
requireAdminToken($pdo);

switch ($method) {
    case 'GET':
        $stmt = $pdo->query("SELECT key_name, value_data FROM settings");
        $rows = $stmt->fetchAll();
        $settings = [];
        foreach ($rows as $r) {
            $settings[$r['key_name']] = $r['value_data'];
        }

        jsonResponse(['status' => 'success', 'data' => $settings]);
        break;

    case 'POST':
    case 'PUT':
        $data = getRequestBody();
        if (empty($data)) {
            jsonResponse(['error' => 'No settings provided to update'], 400);
        }

        $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        $sql = $driver === 'sqlite'
            ? 'INSERT OR REPLACE INTO settings (key_name, value_data) VALUES (?, ?)'
            : 'INSERT INTO settings (key_name, value_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE value_data = VALUES(value_data)';
        $stmt = $pdo->prepare($sql);
        foreach ($data as $key => $val) {
            $stmt->execute([$key, is_scalar($val) ? (string)$val : json_encode($val)]);
        }

        jsonResponse(['status' => 'success', 'message' => 'Settings updated successfully']);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
