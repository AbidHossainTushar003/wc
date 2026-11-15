<?php
/**
 * Office Sale & Wholesale API Endpoint (Sprint 4)
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/audit.php';
require_once __DIR__ . '/finance-domain.php';
require_once __DIR__ . '/inventory-domain.php';
require_once __DIR__ . '/idempotency.php';
require_once __DIR__ . '/order-domain.php';

$method = $_SERVER['REQUEST_METHOD'];
$saleData = null;
if ($method === 'POST') {
    $saleData = getRequestBody();
    if (containsUnsupportedVariantPurchaseData($saleData)) {
        jsonResponse(['error' => 'Product variants are not supported for sales.'], 422);
    }
}

$pdo = Database::getConnection();
$admin = requireAdminToken($pdo);
requireAdminPermission($admin, 'sales', $method === 'GET' ? 'read' : 'create');

switch ($method) {
    case 'GET':
        $stmt = $pdo->query("SELECT * FROM office_sales ORDER BY id DESC LIMIT 100");
        jsonResponse(['status' => 'success', 'data' => $stmt->fetchAll()]);
        break;

    case 'POST':
        $data = $saleData;
        $customerName = !array_key_exists('customer_name', $data)
            ? 'Walk-in Customer'
            : (is_string($data['customer_name']) ? trim($data['customer_name']) : '');
        $customerPhone = !array_key_exists('customer_phone', $data)
            ? ''
            : (is_string($data['customer_phone']) ? trim($data['customer_phone']) : '');
        $items = $data['items'] ?? [];
        $discount = normalizeMoneyAmount($data['discount'] ?? 0);
        $paid = normalizeMoneyAmount($data['paid'] ?? 0);
        $paymentMethod = !array_key_exists('payment_method', $data)
            ? 'Cash'
            : (is_string($data['payment_method']) ? trim($data['payment_method']) : '');

        if ($customerName === '' || strlen($customerName) > 150 || strlen($customerPhone) > 30
            || $discount === null || $paid === null || $paymentMethod === '' || strlen($paymentMethod) > 50
            || !is_array($items) || count($items) < 1 || count($items) > 100) {
            jsonResponse(['error' => 'Enter valid customer, payment, discount, and sale item details.'], 422);
        }

        enforceApiRateLimit($pdo, 'office_sales_mutation', 60, 900);
        $quantities = [];
        foreach ($items as $item) {
            if (!is_array($item)) {
                jsonResponse(['error' => 'Each sale item must contain a product ID and whole-number quantity.'], 422);
            }
            $productId = parseFinancialId($item['product_id'] ?? null);
            $quantity = parseInventoryInteger($item['quantity'] ?? null);
            if ($productId === null || $quantity === null || $quantity < 1
                || ($quantities[$productId] ?? 0) > PHP_INT_MAX - $quantity) {
                jsonResponse(['error' => 'Each sale item must contain a valid product ID and positive whole-number quantity.'], 422);
            }
            $quantities[$productId] = ($quantities[$productId] ?? 0) + $quantity;
        }
        ksort($quantities, SORT_NUMERIC);

        $discountCents = moneyToMinorUnits($discount);
        $paidCents = moneyToMinorUnits($paid);
        $idempotencyKey = requireIdempotencyKey();
        $requestPayload = [
            'customer_name' => $customerName,
            'customer_phone' => $customerPhone,
            'items' => $quantities,
            'discount' => $discount,
            'paid' => $paid,
            'payment_method' => $paymentMethod
        ];

        try {
            $pdo->beginTransaction();
            reserveIdempotency($pdo, (int)$admin['id'], 'sales.office.create', $idempotencyKey, $requestPayload);
            $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
            $lock = $driver === 'mysql' ? ' FOR UPDATE' : '';
            $subtotalCents = 0;
            $movementRecords = [];

            foreach ($quantities as $productId => $quantity) {
                $pStmt = $pdo->prepare('SELECT id, name, sale_price, regular_price, stock_quantity FROM products WHERE id = ? AND is_archived = 0 AND is_sellable = 1' . $lock);
                $pStmt->execute([$productId]);
                $prod = $pStmt->fetch();
                if (!$prod) {
                    $pdo->rollBack();
                    jsonResponse(['error' => 'A product in this sale was not found.'], 404);
                }
                $stock = parseInventoryInteger((string)$prod['stock_quantity']);
                if ($stock === null || $stock < $quantity) {
                    $pdo->rollBack();
                    jsonResponse(['error' => 'Insufficient stock for one or more sale items. Refresh inventory and try again.'], 409);
                }

                $price = normalizeMoneyAmount($prod['sale_price'] ?? $prod['regular_price']);
                $priceCents = $price === null ? null : moneyToMinorUnits($price);
                if ($priceCents === null || $priceCents < 1
                    || $quantity > intdiv(PHP_INT_MAX - $subtotalCents, $priceCents)) {
                    throw new RuntimeException('Product price is invalid or sale total exceeds the supported range.');
                }
                $subtotalCents += $priceCents * $quantity;

                $updStock = $pdo->prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity >= ?');
                $updStock->execute([$quantity, $productId, $quantity]);
                if ($updStock->rowCount() !== 1) {
                    throw new RuntimeException('Stock changed during office sale.');
                }
                $movementRecords[] = ['product_id' => (int)$productId, 'quantity' => $quantity];
            }

            if ($discountCents > $subtotalCents) {
                $pdo->rollBack();
                jsonResponse(['error' => 'Discount cannot exceed the sale subtotal.'], 422);
            }
            $totalCents = $subtotalCents - $discountCents;
            if ($paidCents > $totalCents) {
                $pdo->rollBack();
                jsonResponse(['error' => 'Paid amount cannot exceed the sale total.'], 422);
            }
            $subtotal = minorUnitsToMoney($subtotalCents);
            $discount = minorUnitsToMoney($discountCents);
            $total = minorUnitsToMoney($totalCents);
            $paid = minorUnitsToMoney($paidCents);
            $due = minorUnitsToMoney($totalCents - $paidCents);
            $invoiceNumber = 'OS-' . gmdate('Ymd') . '-' . strtoupper(bin2hex(random_bytes(5)));

            $saleStmt = $pdo->prepare("
                INSERT INTO office_sales (invoice_number, customer_name, customer_phone, subtotal, discount, total, paid, due, payment_method)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $saleStmt->execute([$invoiceNumber, $customerName, $customerPhone, $subtotal, $discount, $total, $paid, $due, $paymentMethod]);
            $saleId = (int)$pdo->lastInsertId();

            foreach ($movementRecords as $movement) {
                recordStockMovement($pdo, $movement['product_id'], 'Sale', $movement['quantity'], $saleId, 'Office sale ' . $invoiceNumber);
            }
            logAuditRequired(
                $pdo,
                (int)$admin['id'],
                'create',
                'office_sale',
                $saleId,
                null,
                ['invoice_number' => $invoiceNumber, 'total' => $total, 'paid' => $paid, 'due' => $due]
            );
            $response = [
                'status' => 'success',
                'message' => 'Office sale completed successfully.',
                'data' => ['invoice_number' => $invoiceNumber, 'total' => (float)$total]
            ];
            completeIdempotency($pdo, (int)$admin['id'], 'sales.office.create', $idempotencyKey, $response);
            $pdo->commit();
            jsonResponse($response);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Shopademia office sale failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not complete the office sale. Please try again.'], 500);
        }
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
