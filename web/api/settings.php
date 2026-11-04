<?php
/**
 * Settings API Endpoint
 * Dedicated backend for Screen 9 (Settings) and public store configuration
 */

require_once __DIR__ . '/db.php';

$pdo = Database::getConnection();
$method = $_SERVER['REQUEST_METHOD'];
if (!($method === 'GET' && ($_GET['public'] ?? '') === '1')) {
    requireAdminToken($pdo);
}

switch ($method) {
    case 'GET':
        if (($_GET['public'] ?? '') === '1') {
            $stmt = $pdo->prepare("
                SELECT key_name, value_data
                FROM settings
                WHERE key_name IN (
                    'announcement_text',
                    'delivery_fee_dhanmondi',
                    'delivery_fee_dhaka',
                    'delivery_fee_outside_dhaka',
                    'free_delivery_min_amount'
                )
            ");
            $stmt->execute();
            $settings = [];
            foreach ($stmt->fetchAll() as $row) {
                $settings[$row['key_name']] = $row['value_data'];
            }
            jsonResponse([
                'status' => 'success',
                'data' => [
                    'announcement_text' => $settings['announcement_text'] ?? 'Delivery availability and estimates are shown at checkout.',
                    'delivery_fee_dhanmondi' => $settings['delivery_fee_dhanmondi'] ?? '60',
                    'delivery_fee_dhaka' => $settings['delivery_fee_dhaka'] ?? '80',
                    'delivery_fee_outside_dhaka' => $settings['delivery_fee_outside_dhaka'] ?? '130',
                    'free_delivery_min_amount' => $settings['free_delivery_min_amount'] ?? '2000'
                ]
            ]);
        }

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
        if (array_key_exists('announcement_text', $data)) {
            $announcement = $data['announcement_text'];
            if (!is_string($announcement) || preg_match('/\A.{0,240}\z/usD', $announcement) !== 1) {
                jsonResponse(['error' => 'Announcement text must be valid text no longer than 240 characters.'], 422);
            }
            $data['announcement_text'] = trim($announcement);
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
