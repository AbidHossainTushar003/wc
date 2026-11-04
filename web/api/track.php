<?php
/**
 * Order Tracking API Endpoint
 * Dedicated backend for Page 14 (Order Tracking)
 */

require_once __DIR__ . '/db.php';

$pdo = Database::getConnection();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$query = trim($_GET['order'] ?? ($_GET['tracking_code'] ?? ''));
$phone = trim($_GET['phone'] ?? '');

if (empty($query)) {
    jsonResponse(['error' => 'Please provide an Order Number (e.g. WC-10021) or Tracking Code (e.g. TRK-WC-7721)'], 400);
}

$sql = "SELECT * FROM orders WHERE (order_number = ? OR tracking_code = ?)";
$params = [$query, $query];

if (!empty($phone)) {
    $sql .= " AND customer_phone LIKE ?";
    $params[] = '%' . substr($phone, -8);
}

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$order = $stmt->fetch();

if (!$order) {
    jsonResponse(['error' => 'No order found matching your tracking information. Please verify your order number and phone.'], 404);
}

// Fetch order items
$itemStmt = $pdo->prepare("SELECT product_name, quantity, price, total FROM order_items WHERE order_id = ?");
$itemStmt->execute([(int)$order['id']]);
$order['items'] = $itemStmt->fetchAll();

// Generate dynamic timeline stages based on order_status
$status = $order['order_status'];
$stages = [
    [
        'title' => 'Order Placed',
        'desc' => 'Order received and logged in system',
        'time' => date('d M Y, h:i A', strtotime($order['created_at'])),
        'completed' => true
    ],
    [
        'title' => 'Order Confirmed',
        'desc' => 'Verified by Wonderful Collection Dhanmondi Hub',
        'time' => in_array($status, ['Processing', 'Shipped', 'Delivered']) ? 'Completed' : 'Pending',
        'completed' => in_array($status, ['Processing', 'Shipped', 'Delivered'])
    ],
    [
        'title' => 'Packed & Quality Checked',
        'desc' => 'Securely packed with warranty and receipt',
        'time' => in_array($status, ['Processing', 'Shipped', 'Delivered']) ? 'Completed' : 'Pending',
        'completed' => in_array($status, ['Processing', 'Shipped', 'Delivered'])
    ],
    [
        'title' => 'Dispatched from Dhanmondi Hub',
        'desc' => 'Handed over to delivery rider for ' . $order['delivery_area'],
        'time' => in_array($status, ['Shipped', 'Delivered']) ? 'In Transit' : 'Pending',
        'completed' => in_array($status, ['Shipped', 'Delivered'])
    ],
    [
        'title' => 'Delivered to Customer',
        'desc' => 'Delivered at ' . $order['delivery_address'],
        'time' => ($status === 'Delivered') ? 'Delivered' : 'Estimated 2-4 hrs for Dhanmondi / 24 hrs Dhaka',
        'completed' => ($status === 'Delivered')
    ]
];

jsonResponse([
    'status' => 'success',
    'data' => [
        'order_number' => $order['order_number'],
        'tracking_code' => $order['tracking_code'],
        'order_status' => $order['order_status'],
        'customer_name' => $order['customer_name'],
        'delivery_address' => $order['delivery_address'],
        'delivery_area' => $order['delivery_area'],
        'payment_method' => $order['payment_method'],
        'payment_status' => $order['payment_status'],
        'total' => (float)$order['total'],
        'items' => $order['items'],
        'timeline' => $stages
    ]
]);
