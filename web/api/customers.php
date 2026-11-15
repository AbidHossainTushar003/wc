<?php
/**
 * Customers API Endpoint
 * Provides customer list with lifetime metrics and order counts for the admin app
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/audit.php';

$pdo = Database::getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$admin = requireAdminToken($pdo);
if ($method === 'GET') {
    requireAdminPermission($admin, 'customers', 'read');
} elseif ($method === 'PUT') {
    requireAdminPermission($admin, 'customers', 'update');
} else {
    header('Allow: GET, PUT');
    jsonResponse(['error' => 'Method not allowed'], 405);
}

if ($method === 'GET') {
    if (isset($_GET['id'])) {
        $customerId = filter_var($_GET['id'], FILTER_VALIDATE_INT);
        if ($customerId === false || $customerId < 1) {
            jsonResponse(['error' => 'A valid customer ID is required.'], 422);
        }
        $stmt = $pdo->prepare("SELECT id, name, email, phone, address, area, city, is_vip, created_at FROM customers WHERE id = ?");
        $stmt->execute([(int)$customerId]);
        $customer = $stmt->fetch();
        if (!$customer) {
            jsonResponse(['error' => 'Customer not found'], 404);
        }

        // Fetch their orders
        $ordStmt = $pdo->prepare("SELECT id, order_number, total, order_status, created_at FROM orders WHERE customer_id = ? ORDER BY id DESC");
        $ordStmt->execute([(int)$customerId]);
        $customer['orders'] = $ordStmt->fetchAll();

        jsonResponse(['status' => 'success', 'data' => $customer]);
    }

    // List all customers
    $stmt = $pdo->query("
        SELECT 
            c.id, c.name, c.email, c.phone, c.address, c.area, c.city, c.is_vip, c.created_at,
            COUNT(o.id) AS total_orders,
            COALESCE(SUM(o.total), 0) AS total_spent
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id
        GROUP BY c.id
        ORDER BY total_spent DESC
    ");
    $customers = $stmt->fetchAll();

    jsonResponse(['status' => 'success', 'count' => count($customers), 'data' => $customers]);
}

$data = getRequestBody();
$customerId = filter_var($data['id'] ?? null, FILTER_VALIDATE_INT);
$isVip = $data['is_vip'] ?? null;
if ($customerId === false || $customerId < 1 || !is_bool($isVip)) {
    jsonResponse(['error' => 'A valid customer ID and VIP value are required.'], 422);
}

try {
    $pdo->beginTransaction();
    $stmt = $pdo->prepare('SELECT is_vip FROM customers WHERE id = ?');
    $stmt->execute([(int)$customerId]);
    $currentValue = $stmt->fetchColumn();
    if ($currentValue === false) {
        $pdo->rollBack();
        jsonResponse(['error' => 'Customer not found.'], 404);
    }
    $nextValue = $isVip ? 1 : 0;
    $pdo->prepare('UPDATE customers SET is_vip = ? WHERE id = ?')->execute([$nextValue, (int)$customerId]);
    logAuditRequired(
        $pdo,
        (int)$admin['id'],
        'update',
        'customer',
        (int)$customerId,
        ['is_vip' => (int)$currentValue],
        ['is_vip' => $nextValue]
    );
    $pdo->commit();
    jsonResponse(['status' => 'success', 'data' => ['id' => (int)$customerId, 'is_vip' => $nextValue]]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('Shopademia customer VIP update failed: ' . $error->getMessage());
    jsonResponse(['error' => 'The customer VIP tag could not be updated.'], 500);
}
