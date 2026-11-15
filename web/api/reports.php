<?php
/**
 * Reports & Analytics API Endpoint
 * Dedicated backend for Screen 1 (Dashboard) and Screen 8 (Reports)
 */

require_once __DIR__ . '/db.php';

$pdo = Database::getConnection();
$admin = requireAdminToken($pdo);
requireAdminPermission($admin, 'reports', 'read');
if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
    $pdo->exec("SET time_zone = '+00:00'");
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

function reportDateRange(): array {
    $from = $_GET['from'] ?? null;
    $to = $_GET['to'] ?? null;
    if ($from === null && $to === null) {
        return [null, null, null, null];
    }
    if (!is_string($from) || !is_string($to)) {
        jsonResponse(['error' => 'Both from and to dates are required.'], 422);
    }

    $dhaka = new DateTimeZone('Asia/Dhaka');
    $fromDate = DateTimeImmutable::createFromFormat('!Y-m-d', $from, $dhaka);
    $toDate = DateTimeImmutable::createFromFormat('!Y-m-d', $to, $dhaka);
    $errors = DateTimeImmutable::getLastErrors();
    if (!$fromDate
        || !$toDate
        || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
        || $fromDate->format('Y-m-d') !== $from
        || $toDate->format('Y-m-d') !== $to
        || $fromDate > $toDate
        || $fromDate->diff($toDate)->days > 3660) {
        jsonResponse(['error' => 'Enter a valid date range no longer than ten years.'], 422);
    }

    $utc = new DateTimeZone('UTC');
    $startUtc = $fromDate->setTimezone($dhaka)->setTimezone($utc)->format('Y-m-d H:i:s');
    $endUtc = $toDate->modify('+1 day')->setTimezone($dhaka)->setTimezone($utc)->format('Y-m-d H:i:s');
    return [$startUtc, $endUtc, $from, $to];
}

[$rangeStart, $rangeEnd, $rangeFrom, $rangeTo] = reportDateRange();
$orderWhere = '1 = 1';
$orderParams = [];
if ($rangeStart !== null && $rangeEnd !== null) {
    $orderWhere = 'created_at >= ? AND created_at < ?';
    $orderParams = [$rangeStart, $rangeEnd];
}

// Revenue is limited to orders marked paid and excludes cancelled orders.
$totalsStmt = $pdo->prepare("
    SELECT 
        COUNT(id) AS total_orders,
        COALESCE(SUM(CASE WHEN payment_status = 'Paid' AND order_status <> 'Cancelled' THEN total ELSE 0 END), 0) AS paid_order_revenue,
        COALESCE(AVG(CASE WHEN payment_status = 'Paid' AND order_status <> 'Cancelled' THEN total END), 0) AS average_paid_order_value,
        COALESCE(SUM(CASE WHEN order_status <> 'Cancelled' THEN discount ELSE 0 END), 0) AS total_discounts
    FROM orders
    WHERE $orderWhere
");
$totalsStmt->execute($orderParams);
$totals = $totalsStmt->fetch();

// 2. Status Breakdown
$statusStmt = $pdo->prepare("
    SELECT order_status, COUNT(id) AS count, COALESCE(SUM(total), 0) AS order_value
    FROM orders
    WHERE $orderWhere
    GROUP BY order_status
");
$statusStmt->execute($orderParams);
$statusBreakdown = $statusStmt->fetchAll();

// 3. Top Selling Products
$topProductsStmt = $pdo->prepare("
    SELECT 
        oi.product_id, oi.product_name,
        SUM(oi.quantity) AS total_units_sold,
        SUM(oi.total) AS total_order_value
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    WHERE $orderWhere AND o.order_status <> 'Cancelled'
    GROUP BY oi.product_id, oi.product_name
    ORDER BY total_units_sold DESC
    LIMIT 5
");
$topProductsStmt->execute($orderParams);
$topProducts = $topProductsStmt->fetchAll();

// 4. Low stock count for dashboard alert
$stockStmt = $pdo->query("SELECT COUNT(id) AS low_stock FROM products WHERE stock_quantity <= 5 AND is_archived = 0");
$lowStock = $stockStmt->fetch()['low_stock'] ?? 0;

// 5. Total customers count
$custStmt = $pdo->query("SELECT COUNT(id) AS total_customers FROM customers");
$totalCustomers = $custStmt->fetch()['total_customers'] ?? 0;

// 6. Recent Orders for Dashboard quick view
$recentStmt = $pdo->prepare("
    SELECT id, order_number, customer_name, customer_phone, delivery_area, total, order_status, created_at 
    FROM orders 
    WHERE $orderWhere
    ORDER BY id DESC 
    LIMIT 6
");
$recentStmt->execute($orderParams);
$recentOrders = $recentStmt->fetchAll();

$financeWhere = 'created_at >= ? AND created_at < ?';
$financeParams = [];
if ($rangeStart !== null && $rangeEnd !== null) {
    $financeParams = [$rangeStart, $rangeEnd];
} else {
    $financeWhere = '1 = 1';
}
$financeStmt = $pdo->prepare("
    SELECT
        COALESCE(SUM(CASE WHEN type = 'Income' THEN amount ELSE 0 END), 0) AS recorded_income,
        COALESCE(SUM(CASE WHEN type = 'Expense' THEN amount ELSE 0 END), 0) AS recorded_expenses
    FROM transactions
    WHERE $financeWhere
");
$financeStmt->execute($financeParams);
$finance = $financeStmt->fetch();

$pendingStmt = $pdo->prepare("
    SELECT
        COALESCE(SUM(CASE WHEN order_status IN ('Pending', 'Processing', 'Shipped') THEN 1 ELSE 0 END), 0) AS pending_orders,
        COALESCE(SUM(CASE WHEN payment_status = 'Pending Verification' THEN 1 ELSE 0 END), 0) AS pending_payment_verification
    FROM orders
");
$pendingStmt->execute();
$pending = $pendingStmt->fetch();

jsonResponse([
    'status' => 'success',
    'data' => [
        'overview' => [
            'range' => $rangeFrom === null ? null : ['from' => $rangeFrom, 'to' => $rangeTo],
            'paid_order_revenue' => (float)$totals['paid_order_revenue'],
            'total_orders' => (int)$totals['total_orders'],
            'average_paid_order_value' => round((float)$totals['average_paid_order_value'], 2),
            'total_discounts' => (float)$totals['total_discounts'],
            'recorded_income' => (float)$finance['recorded_income'],
            'recorded_expenses' => (float)$finance['recorded_expenses'],
            'pending_orders' => (int)$pending['pending_orders'],
            'pending_payment_verification' => (int)$pending['pending_payment_verification'],
            'total_customers' => (int)$totalCustomers,
            'low_stock_alerts' => (int)$lowStock
        ],
        'status_breakdown' => $statusBreakdown,
        'top_products' => $topProducts,
        'recent_orders' => $recentOrders
    ]
]);
