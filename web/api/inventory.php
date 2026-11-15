<?php
/**
 * Inventory / Stock API Endpoint
 * Dedicated backend for Screen 7 (Stock / Inventory)
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/audit.php';
require_once __DIR__ . '/inventory-domain.php';
require_once __DIR__ . '/idempotency.php';

$pdo = Database::getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$admin = requireAdminToken($pdo);
if ($method === 'GET') {
    requireAdminPermission($admin, 'inventory', 'read');
} elseif (!in_array($method, ['POST', 'PUT'], true)) {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

switch ($method) {
    case 'GET':
        if (($_GET['type'] ?? 'stock') === 'movements') {
            $stmt = $pdo->query("
                SELECT m.id, m.product_id, p.name AS product_name, m.type, m.quantity,
                       m.reference_id, m.notes, m.created_at
                FROM stock_movements m
                LEFT JOIN products p ON p.id = m.product_id
                ORDER BY m.id DESC
                LIMIT 200
            ");
            jsonResponse(['status' => 'success', 'data' => $stmt->fetchAll()]);
        }

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
        $productId = parseInventoryInteger($data['product_id'] ?? null);
        if ($productId === null || $productId < 1) {
            jsonResponse(['error' => 'A valid product ID is required.'], 422);
        }
        $notesProvided = array_key_exists('notes', $data);
        $notes = $notesProvided && is_string($data['notes']) ? trim($data['notes']) : '';
        if ($notesProvided && (!is_string($data['notes']) || $notes === '' || strlen($notes) > 500)) {
            jsonResponse(['error' => 'Enter a stock adjustment reason of 1 to 500 characters.'], 422);
        }

        $action = $data['action'] ?? '';
        if ($action !== '' && !in_array($action, ['adjust', 'set'], true)) {
            jsonResponse(['error' => 'Unsupported inventory action.'], 422);
        }
        if ($action === 'adjust') {
            requireAdminPermission($admin, 'inventory', 'adjust');
            $delta = parseInventoryInteger($data['delta'] ?? null);
            if ($delta === null || $delta === 0) {
                jsonResponse(['error' => 'Stock adjustment must be a non-zero whole number.'], 422);
            }
        } elseif (array_key_exists('stock_quantity', $data)) {
            requireAdminPermission($admin, 'inventory', 'set');
            $newStock = parseInventoryInteger($data['stock_quantity']);
            $expectedStock = parseInventoryInteger($data['expected_stock'] ?? null);
            if ($newStock === null || $newStock < 0 || $expectedStock === null || $expectedStock < 0) {
                jsonResponse(['error' => 'A non-negative stock quantity and expected_stock value are required.'], 422);
            }
        } else {
            jsonResponse(['error' => 'Provide an adjustment delta or an exact stock quantity.'], 422);
        }
        enforceApiRateLimit($pdo, 'inventory_mutation', 120, 900);
        $idempotencyKey = requireIdempotencyKey();
        $operation = $action === 'adjust' ? 'inventory.adjust' : 'inventory.set';
        $requestPayload = $action === 'adjust'
            ? array_merge(
                ['product_id' => $productId, 'delta' => $delta],
                $notesProvided ? ['notes' => $notes] : []
            )
            : ['product_id' => $productId, 'stock_quantity' => $newStock, 'expected_stock' => $expectedStock];

        try {
            $pdo->beginTransaction();
            reserveIdempotency($pdo, (int)$admin['id'], $operation, $idempotencyKey, $requestPayload);
            $lock = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
            $stmt = $pdo->prepare('SELECT id, name, stock_quantity FROM products WHERE id = ?' . $lock);
            $stmt->execute([$productId]);
            $product = $stmt->fetch();
            if (!$product) {
                $pdo->rollBack();
                jsonResponse(['error' => 'Product not found.'], 404);
            }

            $oldStock = parseInventoryInteger((string)$product['stock_quantity']);
            if ($oldStock === null || $oldStock < 0) {
                throw new RuntimeException('Stored product stock is invalid.');
            }
            if ($action === 'adjust') {
                $newStock = applyInventoryDelta($oldStock, $delta);
                if ($newStock === null) {
                    $pdo->rollBack();
                    jsonResponse(['error' => 'Adjustment would make stock negative or exceed the supported range.'], 409);
                }
            } elseif ($oldStock !== $expectedStock) {
                $pdo->rollBack();
                jsonResponse(['error' => 'Stock changed since it was loaded. Refresh and try again.'], 409);
            }

            $update = $pdo->prepare('UPDATE products SET stock_quantity = ? WHERE id = ?');
            $update->execute([$newStock, $productId]);
            $movementDelta = $newStock - $oldStock;
            if ($movementDelta !== 0) {
                $movementNotes = $notesProvided ? $notes : 'Admin inventory adjustment.';
                recordStockMovement($pdo, $productId, 'Adjustment', $movementDelta, null, $movementNotes);
            }
            logAuditRequired(
                $pdo,
                (int)$admin['id'],
                'adjust_stock',
                'product',
                $productId,
                ['stock_quantity' => $oldStock],
                ['stock_quantity' => $newStock]
            );
            $response = [
                'status' => 'success',
                'message' => 'Stock updated successfully',
                'data' => [
                    'id' => $productId,
                    'name' => $product['name'],
                    'stock_quantity' => $newStock
                ]
            ];
            completeIdempotency($pdo, (int)$admin['id'], $operation, $idempotencyKey, $response);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Shopademia inventory adjustment failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not update stock. Please try again.'], 500);
        }

        jsonResponse($response);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
