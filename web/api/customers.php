<?php
/**
 * Customers API Endpoint
 * Provides customer list with lifetime metrics and order counts for the admin app
 */

require_once __DIR__ . '/db.php';

$pdo = Database::getConnection();
$method = $_SERVER['REQUEST_METHOD'];
requireAdminToken($pdo);

if ($method === 'GET') {
    if (isset($_GET['id'])) {
        $stmt = $pdo->prepare("SELECT id, name, email, phone, address, area, city, created_at FROM customers WHERE id = ?");
        $stmt->execute([(int)$_GET['id']]);
        $customer = $stmt->fetch();
        if (!$customer) {
            jsonResponse(['error' => 'Customer not found'], 404);
        }

        // Fetch their orders
        $ordStmt = $pdo->prepare("SELECT id, order_number, total, order_status, created_at FROM orders WHERE customer_id = ? ORDER BY id DESC");
        $ordStmt->execute([(int)$_GET['id']]);
        $customer['orders'] = $ordStmt->fetchAll();

        jsonResponse(['status' => 'success', 'data' => $customer]);
    }

    // List all customers
    $stmt = $pdo->query("
        SELECT 
            c.id, c.name, c.email, c.phone, c.address, c.area, c.city, c.created_at,
            COUNT(o.id) AS total_orders,
            COALESCE(SUM(o.total), 0) AS total_spent
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id
        GROUP BY c.id
        ORDER BY total_spent DESC
    ");
    $customers = $stmt->fetchAll();

    jsonResponse(['status' => 'success', 'count' => count($customers), 'data' => $customers]);
} else {
    jsonResponse(['error' => 'Method not allowed'], 405);
}
