<?php
/**
 * Inventory / Stock API Endpoint
 * Dedicated backend for Screen 7 (Stock / Inventory)
 */

require_once __DIR__ . '/db.php';

$pdo = Database::getConnection();
$method = $_SERVER['REQUEST_METHOD'];
requireAdminToken($pdo);

switch ($method) {
    case 'GET':
        $stmt = $pdo->query("
            SELECT 
                p.id, p.name, p.sku, p.stock_quantity, p.regular_price, p.sale_price,
                c.name AS category_name,
                CASE 
                    WHEN p.stock_quantity = 0 THEN 'Out of Stock'
                    WHEN p.stock_quantity <= 5 THEN 'Low Stock'
                    ELSE 'In Stock'
                END AS stock_status
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            ORDER BY p.stock_quantity ASC, p.id DESC
        ");
        $inventory = $stmt->fetchAll();

        // Calculate summary counters
        $totalItems = count($inventory);
        $lowStockCount = 0;
        $outOfStockCount = 0;
        foreach ($inventory as $item) {
            if ($item['stock_quantity'] == 0) $outOfStockCount++;
            elseif ($item['stock_quantity'] <= 5) $lowStockCount++;
        }

        jsonResponse([
            'status' => 'success',
            'summary' => [
                'total_products' => $totalItems,
                'low_stock_count' => $lowStockCount,
                'out_of_stock_count' => $outOfStockCount
            ],
            'data' => $inventory
        ]);
        break;

    case 'POST':
    case 'PUT':
        $data = getRequestBody();
        if (empty($data['product_id'])) {
            jsonResponse(['error' => 'Product ID is required'], 422);
        }

        $productId = (int)$data['product_id'];

        if (isset($data['action']) && $data['action'] === 'adjust') {
            // Delta adjust (+/-)
            $delta = (int)($data['delta'] ?? 0);
            $stmt = $pdo->prepare("
                UPDATE products
                SET stock_quantity = CASE WHEN stock_quantity + ? < 0 THEN 0 ELSE stock_quantity + ? END
                WHERE id = ?
            ");
            $stmt->execute([$delta, $delta, $productId]);
        } elseif (isset($data['stock_quantity'])) {
            // Set exact value
            $newStock = max(0, (int)$data['stock_quantity']);
            $stmt = $pdo->prepare("UPDATE products SET stock_quantity = ? WHERE id = ?");
            $stmt->execute([$newStock, $productId]);
        } else {
            jsonResponse(['error' => 'Please provide stock_quantity or adjust delta'], 400);
        }

        // Return updated stock
        $stmt = $pdo->prepare("SELECT id, name, stock_quantity FROM products WHERE id = ?");
        $stmt->execute([$productId]);
        $updated = $stmt->fetch();

        jsonResponse([
            'status' => 'success',
            'message' => 'Stock updated successfully',
            'data' => $updated
        ]);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
