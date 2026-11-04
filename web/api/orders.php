<?php
/**
 * Orders API Endpoint
 * Handles checkout placement, admin order retrieval, and status transitions.
 */

require_once __DIR__ . '/db.php';

$pdo = Database::getConnection();
$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'POST' && !($method === 'GET' && isset($_GET['customer_id']) && !isset($_GET['id']))) {
    requireAdminToken($pdo);
}

switch ($method) {
    case 'GET':
        if (isset($_GET['id'])) {
            $stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
            $stmt->execute([(int)$_GET['id']]);
            $order = $stmt->fetch();
            if (!$order) {
                jsonResponse(['error' => 'Order not found'], 404);
            }

            $itemStmt = $pdo->prepare('SELECT * FROM order_items WHERE order_id = ?');
            $itemStmt->execute([(int)$_GET['id']]);
            $order['items'] = $itemStmt->fetchAll();
            jsonResponse(['status' => 'success', 'data' => $order]);
        }

        if (isset($_GET['customer_id'])) {
            $customer = requireCustomerToken($pdo);
            if ((int)$_GET['customer_id'] !== (int)$customer['id']) {
                jsonResponse(['error' => 'You may only view your own orders'], 403);
            }
            $stmt = $pdo->prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC');
            $stmt->execute([(int)$customer['id']]);
            $orders = $stmt->fetchAll();
            foreach ($orders as &$order) {
                $itemStmt = $pdo->prepare('SELECT * FROM order_items WHERE order_id = ?');
                $itemStmt->execute([(int)$order['id']]);
                $order['items'] = $itemStmt->fetchAll();
            }
            jsonResponse(['status' => 'success', 'data' => $orders]);
        }

        $sql = 'SELECT * FROM orders WHERE 1=1';
        $params = [];
        if (!empty($_GET['status'])) {
            $sql .= ' AND order_status = ?';
            $params[] = $_GET['status'];
        }
        if (!empty($_GET['q'])) {
            $q = '%' . trim($_GET['q']) . '%';
            $sql .= ' AND (order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ? OR tracking_code LIKE ?)';
            array_push($params, $q, $q, $q, $q);
        }

        $stmt = $pdo->prepare($sql . ' ORDER BY id DESC');
        $stmt->execute($params);
        $orders = $stmt->fetchAll();
        foreach ($orders as &$order) {
            $itemStmt = $pdo->prepare('SELECT * FROM order_items WHERE order_id = ?');
            $itemStmt->execute([(int)$order['id']]);
            $order['items'] = $itemStmt->fetchAll();
        }
        jsonResponse(['status' => 'success', 'count' => count($orders), 'data' => $orders]);
        break;

    case 'POST':
        enforceApiRateLimit($pdo, 'checkout', 10, 900);
        $data = getRequestBody();
        $customerId = null;
        if (getAdminTokenFromRequest() !== null) {
            $customer = requireCustomerToken($pdo);
            $customerId = (int)$customer['id'];
        }
        foreach (['customer_name', 'customer_phone', 'delivery_address'] as $requiredField) {
            if (!isset($data[$requiredField]) || !is_string($data[$requiredField]) || trim($data[$requiredField]) === '') {
                jsonResponse(['error' => 'Please provide complete delivery details and at least one item.'], 422);
            }
        }
        if (strlen(trim($data['customer_name'])) > 150
            || strlen(trim($data['customer_phone'])) > 30
            || strlen(trim($data['delivery_address'])) > 4000) {
            jsonResponse(['error' => 'One or more delivery fields are too long.'], 422);
        }
        if (preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $data['customer_name'] . $data['customer_phone'] . $data['delivery_address'])
            || !preg_match('/^\+?[0-9][0-9\s()-]{6,28}$/', trim($data['customer_phone']))) {
            jsonResponse(['error' => 'Please provide valid delivery details and phone number.'], 422);
        }
        if (!isset($data['items']) || !is_array($data['items']) || count($data['items']) === 0 || count($data['items']) > 50) {
            jsonResponse(['error' => 'Please provide between 1 and 50 order items.'], 422);
        }

        $quantities = [];
        foreach ($data['items'] as $item) {
            if (!is_array($item) || !isset($item['product_id'], $item['quantity'])) {
                jsonResponse(['error' => 'Each item must include a product ID and quantity.'], 422);
            }
            $productId = filter_var($item['product_id'], FILTER_VALIDATE_INT);
            $quantity = filter_var($item['quantity'], FILTER_VALIDATE_INT);
            if ($productId === false || $productId < 1 || $quantity === false || $quantity < 1 || $quantity > 100) {
                jsonResponse(['error' => 'Item product IDs and quantities must be positive valid integers.'], 422);
            }
            $quantities[$productId] = ($quantities[$productId] ?? 0) + $quantity;
            if ($quantities[$productId] > 100) {
                jsonResponse(['error' => 'A product quantity cannot exceed 100.'], 422);
            }
        }

        $deliveryZone = $data['delivery_zone'] ?? (
            isset($data['delivery_area']) && stripos((string)$data['delivery_area'], 'outside') !== false
                ? 'outside_dhaka'
                : (isset($data['delivery_area']) && stripos((string)$data['delivery_area'], 'dhanmondi') !== false ? 'dhanmondi' : 'dhaka')
        );
        if (!in_array($deliveryZone, ['dhanmondi', 'dhaka', 'outside_dhaka'], true)) {
            jsonResponse(['error' => 'Invalid delivery zone.'], 422);
        }
        if (isset($data['delivery_area']) && (!is_string($data['delivery_area']) || strlen($data['delivery_area']) > 80)) {
            jsonResponse(['error' => 'Invalid delivery area.'], 422);
        }
        $deliveryArea = [
            'dhanmondi' => 'Dhanmondi',
            'dhaka' => 'Inside Dhaka',
            'outside_dhaka' => 'Outside Dhaka'
        ][$deliveryZone];
        $paymentMethod = $data['payment_method'] ?? 'Cash on Delivery';
        if (!in_array($paymentMethod, ['Cash on Delivery', 'bKash', 'Nagad', 'Rocket'], true)) {
            jsonResponse(['error' => 'Invalid payment method.'], 422);
        }
        $trxId = is_string($data['trx_id'] ?? null) ? trim($data['trx_id']) : '';
        $customerEmail = is_string($data['customer_email'] ?? null) ? trim($data['customer_email']) : '';
        $notes = is_string($data['notes'] ?? null) ? trim($data['notes']) : '';
        if (strlen($customerEmail) > 150 || strlen($trxId) > 100 || strlen($notes) > 2000) {
            jsonResponse(['error' => 'One or more order fields are too long.'], 422);
        }
        if ($customerEmail !== '' && !filter_var($customerEmail, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(['error' => 'Please provide a valid email address.'], 422);
        }
        if (preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $trxId . $notes)) {
            jsonResponse(['error' => 'One or more order fields contain invalid characters.'], 422);
        }

        $deliverySetting = [
            'dhanmondi' => 'delivery_fee_dhanmondi',
            'dhaka' => 'delivery_fee_dhaka',
            'outside_dhaka' => 'delivery_fee_outside_dhaka'
        ][$deliveryZone];
        $feeStmt = $pdo->prepare('SELECT value_data FROM settings WHERE key_name = ?');
        $feeStmt->execute([$deliverySetting]);
        $deliveryFeeValue = $feeStmt->fetchColumn();
        $deliveryFee = $deliveryFeeValue === false
            ? ['dhanmondi' => 60.00, 'dhaka' => 80.00, 'outside_dhaka' => 130.00][$deliveryZone]
            : max(0, (float)$deliveryFeeValue);
        $freeDeliveryStmt = $pdo->prepare('SELECT value_data FROM settings WHERE key_name = ?');
        $freeDeliveryStmt->execute(['free_delivery_min_amount']);
        $freeDeliveryThreshold = $freeDeliveryStmt->fetchColumn();

        $pdo->beginTransaction();
        try {
            $subtotal = 0.0;
            $lineItems = [];
            $productStmt = $pdo->prepare('SELECT id, name, regular_price, sale_price, stock_quantity FROM products WHERE id = ?');
            foreach ($quantities as $productId => $quantity) {
                $productStmt->execute([(int)$productId]);
                $product = $productStmt->fetch();
                if (!$product) {
                    throw new DomainException('An item in your cart is no longer available.');
                }
                if ((int)$product['stock_quantity'] < $quantity) {
                    throw new DomainException('Not enough stock for ' . $product['name'] . '.');
                }

                $salePrice = $product['sale_price'];
                $price = $salePrice !== null && (float)$salePrice > 0
                    ? (float)$salePrice
                    : (float)$product['regular_price'];
                $lineTotal = round($price * $quantity, 2);
                $subtotal += $lineTotal;
                $lineItems[] = [
                    'product_id' => (int)$product['id'],
                    'product_name' => $product['name'],
                    'price' => $price,
                    'quantity' => $quantity,
                    'total' => $lineTotal
                ];
            }
            $subtotal = round($subtotal, 2);
            if ($deliveryZone !== 'outside_dhaka'
                && $freeDeliveryThreshold !== false
                && is_numeric($freeDeliveryThreshold)
                && (float)$freeDeliveryThreshold > 0
                && $subtotal >= (float)$freeDeliveryThreshold) {
                $deliveryFee = 0.0;
            }

            $discount = 0.0;
            $coupon = null;
            $couponCode = is_string($data['coupon_code'] ?? null) ? strtoupper(trim($data['coupon_code'])) : '';
            if ($couponCode !== '') {
                $couponStmt = $pdo->prepare('SELECT * FROM coupons WHERE UPPER(code) = ? AND is_active = 1');
                $couponStmt->execute([$couponCode]);
                $coupon = $couponStmt->fetch();
                if (!$coupon
                    || ($coupon['expiry_date'] && $coupon['expiry_date'] < gmdate('Y-m-d'))
                    || ((int)$coupon['usage_limit'] > 0 && (int)$coupon['times_used'] >= (int)$coupon['usage_limit'])
                    || $subtotal < (float)$coupon['min_order']) {
                    throw new DomainException('The coupon is invalid or no longer available.');
                }
                if ($coupon['type'] === 'percentage') {
                    $discount = $subtotal * (float)$coupon['value'] / 100;
                    if ($coupon['max_discount'] !== null && (float)$coupon['max_discount'] > 0) {
                        $discount = min($discount, (float)$coupon['max_discount']);
                    }
                } else {
                    $discount = (float)$coupon['value'];
                }
                $discount = round(min(max(0, $discount), $subtotal), 2);
            }

            $total = round($subtotal - $discount + $deliveryFee, 2);
            $orderNumber = 'WC-' . strtoupper(bin2hex(random_bytes(5)));
            $trackingCode = 'TRK-WC-' . strtoupper(bin2hex(random_bytes(5)));
            $paymentStatus = $trxId !== '' || in_array($paymentMethod, ['bKash', 'Nagad', 'Rocket'], true)
                ? 'Pending Verification'
                : 'Pending';

            $orderStmt = $pdo->prepare("
                INSERT INTO orders (
                    order_number, customer_id, customer_name, customer_phone, customer_email,
                    delivery_address, delivery_area, delivery_fee, subtotal, discount, total,
                    payment_method, payment_status, trx_id, order_status, tracking_code, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)
            ");
            $orderStmt->execute([
                $orderNumber,
                $customerId,
                trim($data['customer_name']),
                trim($data['customer_phone']),
                $customerEmail,
                trim($data['delivery_address']),
                $deliveryArea,
                $deliveryFee,
                $subtotal,
                $discount,
                $total,
                $paymentMethod,
                $paymentStatus,
                $trxId !== '' ? $trxId : null,
                $trackingCode,
                $notes
            ]);
            $orderId = $pdo->lastInsertId();

            $itemStmt = $pdo->prepare("
                INSERT INTO order_items (order_id, product_id, product_name, price, quantity, total)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $stockStmt = $pdo->prepare("
                UPDATE products SET stock_quantity = stock_quantity - ?
                WHERE id = ? AND stock_quantity >= ?
            ");
            foreach ($lineItems as $item) {
                $stockStmt->execute([$item['quantity'], $item['product_id'], $item['quantity']]);
                if ($stockStmt->rowCount() !== 1) {
                    throw new DomainException('Stock changed while placing your order. Please try again.');
                }
                $itemStmt->execute([
                    $orderId,
                    $item['product_id'],
                    $item['product_name'],
                    $item['price'],
                    $item['quantity'],
                    $item['total']
                ]);
            }

            if ($coupon) {
                $couponUpdate = $pdo->prepare("
                    UPDATE coupons SET times_used = times_used + 1
                    WHERE id = ? AND is_active = 1 AND (usage_limit <= 0 OR times_used < usage_limit)
                ");
                $couponUpdate->execute([(int)$coupon['id']]);
                if ($couponUpdate->rowCount() !== 1) {
                    throw new DomainException('The coupon is no longer available.');
                }
            }

            $pdo->commit();
            jsonResponse([
                'status' => 'success',
                'message' => 'Order placed successfully!',
                'data' => [
                    'order_id' => $orderId,
                    'order_number' => $orderNumber,
                    'tracking_code' => $trackingCode,
                    'total' => $total
                ]
            ], 201);
        } catch (DomainException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            jsonResponse(['error' => $e->getMessage()], 409);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Wonderful Collection order transaction failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Failed to place order. Please try again.'], 500);
        }
        break;

    case 'PUT':
        $data = getRequestBody();
        $orderId = filter_var($data['id'] ?? null, FILTER_VALIDATE_INT);
        if ($orderId === false || $orderId < 1) {
            jsonResponse(['error' => 'A valid order ID is required'], 422);
        }

        $fields = [];
        $params = [];
        if (isset($data['order_status'])) {
            $allowedStatus = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
            if (!in_array($data['order_status'], $allowedStatus, true)) {
                jsonResponse(['error' => 'Invalid order status value'], 400);
            }
            $fields[] = 'order_status = ?';
            $params[] = $data['order_status'];
        }
        if (isset($data['payment_status'])) {
            $allowedPaymentStatus = ['Pending', 'Pending Verification', 'Paid', 'Failed', 'Refunded'];
            if (!in_array($data['payment_status'], $allowedPaymentStatus, true)) {
                jsonResponse(['error' => 'Invalid payment status value'], 400);
            }
            $fields[] = 'payment_status = ?';
            $params[] = $data['payment_status'];
        }
        if (isset($data['notes'])) {
            if (!is_string($data['notes']) || strlen($data['notes']) > 2000) {
                jsonResponse(['error' => 'Order notes must be 2,000 characters or fewer.'], 422);
            }
            $fields[] = 'notes = ?';
            $params[] = trim($data['notes']);
        }
        if (!$fields) {
            jsonResponse(['error' => 'No fields provided for update'], 400);
        }

        $pdo->beginTransaction();
        try {
            $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
            $lockClause = $driver === 'mysql' ? ' FOR UPDATE' : '';
            $orderStmt = $pdo->prepare('SELECT order_status FROM orders WHERE id = ?' . $lockClause);
            $orderStmt->execute([$orderId]);
            $order = $orderStmt->fetch();
            if (!$order) {
                $pdo->rollBack();
                jsonResponse(['error' => 'Order not found'], 404);
            }

            $currentStatus = $order['order_status'];
            if ($currentStatus === 'Cancelled'
                && isset($data['order_status'])
                && $data['order_status'] !== 'Cancelled') {
                throw new DomainException('A cancelled order cannot be reopened.');
            }

            if (isset($data['order_status'])
                && $data['order_status'] === 'Cancelled'
                && $currentStatus !== 'Cancelled') {
                $itemsStmt = $pdo->prepare("
                    SELECT product_id, SUM(quantity) AS quantity
                    FROM order_items
                    WHERE order_id = ?
                    GROUP BY product_id
                ");
                $itemsStmt->execute([$orderId]);
                $items = $itemsStmt->fetchAll();
                if (!$items) {
                    throw new DomainException('Order items are unavailable; stock could not be restored.');
                }

                $restoreStockStmt = $pdo->prepare(
                    'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?'
                );
                foreach ($items as $item) {
                    $restoreStockStmt->execute([(int)$item['quantity'], (int)$item['product_id']]);
                    if ($restoreStockStmt->rowCount() !== 1) {
                        throw new DomainException('Product stock could not be restored for this order.');
                    }
                }
            }

            $params[] = $orderId;
            $updateStmt = $pdo->prepare('UPDATE orders SET ' . implode(', ', $fields) . ' WHERE id = ?');
            $updateStmt->execute($params);
            $pdo->commit();

            if (isset($data['order_status'])) {
                logSecurityEvent('order_status_updated');
            }
            if (isset($data['payment_status'])) {
                logSecurityEvent('order_payment_status_updated');
            }
            jsonResponse(['status' => 'success', 'message' => 'Order updated successfully']);
        } catch (DomainException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            jsonResponse(['error' => $e->getMessage()], 409);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Wonderful Collection order update transaction failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Failed to update order. Please try again.'], 500);
        }
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
