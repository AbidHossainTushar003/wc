<?php
/**
 * Order Tracking API Endpoint
 * Dedicated backend for Page 14 (Order Tracking)
 */

require_once __DIR__ . '/db.php';

$pdo = Database::getConnection();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

enforceApiRateLimit($pdo, 'order_tracking', 20, 900);
$data = getRequestBody();
$query = trim(is_string($data['order'] ?? null) ? $data['order'] : (is_string($data['tracking_code'] ?? null) ? $data['tracking_code'] : ''));
$phone = trim(is_string($data['phone'] ?? null) ? $data['phone'] : '');

if (empty($query)) {
    jsonResponse(['error' => 'Please provide an Order Number (e.g. WC-10021) or Tracking Code (e.g. TRK-WC-7721)'], 400);
}
if ($phone === '') {
    jsonResponse(['error' => 'Please provide the phone number used when placing the order.'], 400);
}

$normalizePhone = static function (string $value): string {
    $digits = preg_replace('/\D+/', '', $value);
    if (str_starts_with($digits, '00880')) {
        $digits = substr($digits, 2);
    }
    if (str_starts_with($digits, '880')) {
        $digits = '0' . substr($digits, 3);
    }
    return $digits;
};
$phone = $normalizePhone($phone);
if (strlen($phone) < 8 || strlen($phone) > 15) {
    jsonResponse(['error' => 'Please provide a valid phone number.'], 400);
}

$sql = "SELECT * FROM orders WHERE (order_number = ? OR tracking_code = ?)";
$stmt = $pdo->prepare($sql);
$stmt->execute([$query, $query]);
$order = $stmt->fetch();

if (!$order || !hash_equals($normalizePhone((string)$order['customer_phone']), $phone)) {
    jsonResponse(['error' => 'No order found matching your tracking information. Please verify your order number and phone.'], 404);
}

// Fetch order items
$itemStmt = $pdo->prepare("SELECT product_name, quantity, price, total FROM order_items WHERE order_id = ?");
$itemStmt->execute([(int)$order['id']]);
$order['items'] = $itemStmt->fetchAll();
$deliveryArea = stripos((string)$order['delivery_area'], 'dhanmondi') !== false
    ? 'Dhaka'
    : $order['delivery_area'];

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
        'desc' => 'Verified by Wonderful Collection',
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
        'title' => 'Dispatched by Wonderful Collection',
        'desc' => 'Handed over to the delivery rider',
        'time' => in_array($status, ['Shipped', 'Delivered']) ? 'In Transit' : 'Pending',
        'completed' => in_array($status, ['Shipped', 'Delivered'])
    ],
    [
        'title' => 'Delivered to Customer',
        'desc' => 'Delivery completed.',
        'time' => ($status === 'Delivered') ? 'Delivered' : 'Delivery estimate provided by courier',
        'completed' => ($status === 'Delivered')
    ]
];

jsonResponse([
    'status' => 'success',
    'data' => [
        'order_number' => $order['order_number'],
        'tracking_code' => $order['tracking_code'],
        'order_status' => $order['order_status'],
        'delivery_area' => $deliveryArea,
        'payment_method' => $order['payment_method'],
        'payment_status' => $order['payment_status'],
        'total' => (float)$order['total'],
        'items' => $order['items'],
        'timeline' => $stages
    ]
]);
