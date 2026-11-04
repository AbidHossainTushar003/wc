<?php
/**
 * Reports & Analytics API Endpoint
 * Dedicated backend for Screen 1 (Dashboard) and Screen 8 (Reports)
 */

require_once __DIR__ . '/db.php';

$pdo = Database::getConnection();
requireAdminToken($pdo);

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

// 1. Overall Totals
$totalsStmt = $pdo->query("
    SELECT 
        COUNT(id) AS total_orders,
        COALESCE(SUM(total), 0) AS gross_revenue,
        COALESCE(AVG(total), 0) AS average_order_value,
        COALESCE(SUM(discount), 0) AS total_discounts
    FROM orders
");
$totals = $totalsStmt->fetch();

// 2. Status Breakdown
$statusStmt = $pdo->query("
    SELECT order_status, COUNT(id) AS count, COALESCE(SUM(total), 0) AS revenue 
    FROM orders 
    GROUP BY order_status
");
$statusBreakdown = $statusStmt->fetchAll();

// 3. Top Selling Products
$topProductsStmt = $pdo->query("
    SELECT 
        oi.product_id, oi.product_name,
        SUM(oi.quantity) AS total_units_sold,
        SUM(oi.total) AS total_revenue
    FROM order_items oi
    GROUP BY oi.product_id, oi.product_name
    ORDER BY total_units_sold DESC
    LIMIT 5
");
$topProducts = $topProductsStmt->fetchAll();

// 4. Low stock count for dashboard alert
$stockStmt = $pdo->query("SELECT COUNT(id) AS low_stock FROM products WHERE stock_quantity <= 5");
$lowStock = $stockStmt->fetch()['low_stock'] ?? 0;

// 5. Total customers count
$custStmt = $pdo->query("SELECT COUNT(id) AS total_customers FROM customers");
$totalCustomers = $custStmt->fetch()['total_customers'] ?? 0;

// 6. Recent Orders for Dashboard quick view
$recentStmt = $pdo->query("
    SELECT id, order_number, customer_name, customer_phone, delivery_area, total, order_status, created_at 
    FROM orders 
    ORDER BY id DESC 
    LIMIT 6
");
$recentOrders = $recentStmt->fetchAll();

jsonResponse([
    'status' => 'success',
    'data' => [
        'overview' => [
            'gross_revenue' => (float)$totals['gross_revenue'],
            'total_orders' => (int)$totals['total_orders'],
            'average_order_value' => round((float)$totals['average_order_value'], 2),
            'total_discounts' => (float)$totals['total_discounts'],
            'total_customers' => (int)$totalCustomers,
            'low_stock_alerts' => (int)$lowStock
        ],
        'status_breakdown' => $statusBreakdown,
        'top_products' => $topProducts,
        'recent_orders' => $recentOrders
    ]
]);
