<?php
/**
 * Office Sale & Wholesale API Endpoint (Sprint 4)
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/audit.php';

$pdo = Database::getConnection();
$admin = requireAdminToken($pdo);
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $stmt = $pdo->query("SELECT * FROM office_sales ORDER BY id DESC LIMIT 100");
        jsonResponse(['status' => 'success', 'data' => $stmt->fetchAll()]);
        break;

    case 'POST':
        $data = getRequestBody();
        $customerName = trim($data['customer_name'] ?? 'Walk-in Customer');
        $customerPhone = trim($data['customer_phone'] ?? '');
        $items = $data['items'] ?? [];
        $discount = (float)($data['discount'] ?? 0);
        $paid = (float)($data['paid'] ?? 0);
        $paymentMethod = trim($data['payment_method'] ?? 'Cash');

        if (empty($items) || !is_array($items)) {
            jsonResponse(['error' => 'Office sale must contain at least one item.'], 422);
        }

        try {
            $pdo->beginTransaction();
            $subtotal = 0.00;

            foreach ($items as $item) {
                $productId = (int)($item['product_id'] ?? 0);
                $qty = (int)($item['quantity'] ?? 1);
                if ($productId < 1 || $qty < 1) {
                    throw new Exception('Invalid product or quantity in sale.');
                }

                $pStmt = $pdo->prepare("SELECT id, name, sale_price, regular_price, stock_quantity FROM products WHERE id = ? FOR UPDATE");
                $pStmt->execute([$productId]);
                $prod = $pStmt->fetch();
                if (!$prod) {
                    throw new Exception("Product ID $productId not found.");
                }
                if ($prod['stock_quantity'] < $qty) {
                    throw new Exception("Insufficient stock for product: {$prod['name']}. Available: {$prod['stock_quantity']}");
                }

                $price = (float)($prod['sale_price'] ?? $prod['regular_price']);
                $lineTotal = $price * $qty;
                $subtotal += $lineTotal;

                $updStock = $pdo->prepare("UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?");
                $updStock->execute([$qty, $productId]);
            }

            $total = max(0, $subtotal - $discount);
            $due = max(0, $total - $paid);
            $invoiceNumber = 'OS-' . date('Ymd') . '-' . rand(1000, 9999);

            $saleStmt = $pdo->prepare("
                INSERT INTO office_sales (invoice_number, customer_name, customer_phone, subtotal, discount, total, paid, due, payment_method)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $saleStmt->execute([$invoiceNumber, $customerName, $customerPhone, $subtotal, $discount, $total, $paid, $due, $paymentMethod]);
            $saleId = (int)$pdo->lastInsertId();

            logAudit($pdo, (int)$admin['id'], 'create', 'office_sale', $saleId, null, $data);
            $pdo->commit();
            jsonResponse(['status' => 'success', 'message' => 'Office sale completed successfully.', 'data' => ['invoice_number' => $invoiceNumber, 'total' => $total]]);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            jsonResponse(['error' => $e->getMessage()], 500);
        }
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
