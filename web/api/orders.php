<?php
/**
 * Orders API Endpoint
 * Handles checkout placement, admin order retrieval, and status transitions.
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/mail.php';
require_once __DIR__ . '/audit.php';
require_once __DIR__ . '/inventory-domain.php';
require_once __DIR__ . '/delivery-domain.php';
require_once __DIR__ . '/order-domain.php';
require_once __DIR__ . '/catalog-domain.php';
require_once __DIR__ . '/feedback-notifications.php';

$method = $_SERVER['REQUEST_METHOD'];

$checkoutData = null;
if ($method === 'POST') {
    $checkoutData = getRequestBody();
    if (containsUnsupportedVariantPurchaseData($checkoutData)) {
        jsonResponse(['error' => 'Product variants are not supported for checkout.'], 422);
    }
}

$pdo = Database::getConnection();
$admin = null;
if ($method !== 'POST' && !($method === 'GET' && isset($_GET['customer_id']) && !isset($_GET['id']))) {
    $admin = requireAdminToken($pdo);
    requireAdminPermission($admin, 'orders', $method === 'GET' ? 'read' : 'update');
}

function attachOrderItems(PDO $pdo, array &$orders): void {
    if ($orders === []) {
        return;
    }
    $ids = array_map(static fn(array $order): int => (int)$order['id'], $orders);
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $itemStmt = $pdo->prepare("SELECT * FROM order_items WHERE order_id IN ({$placeholders}) ORDER BY order_id, id");
    $itemStmt->execute($ids);
    $itemsByOrder = [];
    foreach ($itemStmt->fetchAll() as $item) {
        $itemsByOrder[(int)$item['order_id']][] = $item;
    }
    foreach ($orders as &$order) {
        $order['items'] = $itemsByOrder[(int)$order['id']] ?? [];
    }
    unset($order);
}

function attachCustomerFeedbackState(PDO $pdo, array &$orders): void {
    if ($orders === []) {
        return;
    }

    $itemIds = [];
    foreach ($orders as $order) {
        foreach ($order['items'] ?? [] as $item) {
            $itemIds[] = (int)$item['id'];
        }
    }
    $feedbackByItem = [];
    if ($itemIds !== []) {
        $placeholders = implode(',', array_fill(0, count($itemIds), '?'));
        $stmt = $pdo->prepare("SELECT order_item_id FROM customer_feedback WHERE order_item_id IN ({$placeholders})");
        $stmt->execute($itemIds);
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $itemId) {
            $feedbackByItem[(int)$itemId] = true;
        }
    }

    foreach ($orders as &$order) {
        $itemCount = count($order['items'] ?? []);
        $submittedCount = 0;
        foreach ($order['items'] as &$item) {
            $item['feedback_submitted'] = isset($feedbackByItem[(int)$item['id']]);
            if ($item['feedback_submitted']) {
                $submittedCount++;
            }
        }
        unset($item);
        $order['feedback_status'] = $order['order_status'] !== 'Delivered'
            ? 'Locked'
            : ($itemCount > 0 && $submittedCount === $itemCount ? 'Submitted' : 'Available');
    }
    unset($order);
}

function emailVerificationRequiredForOrders(): bool {
    $configured = defined('REQUIRE_VERIFIED_EMAIL_FOR_ORDERS')
        ? REQUIRE_VERIFIED_EMAIL_FOR_ORDERS
        : getenv('REQUIRE_VERIFIED_EMAIL_FOR_ORDERS');
    if ($configured === false || $configured === null
        || (is_string($configured) && trim($configured) === '')) {
        return true;
    }

    $required = is_bool($configured)
        ? $configured
        : filter_var($configured, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
    if ($required === null) {
        error_log('Shopademia order email-verification configuration is invalid.');
        jsonResponse(['error' => 'Order requirements are temporarily unavailable. Please try again later.'], 500);
    }
    return $required;
}

function findIdempotentOrder(PDO $pdo, string $idempotencyKey, string $lockClause = ''): ?array {
    $stmt = $pdo->prepare("
        SELECT o.id, o.order_number, o.tracking_code, o.total, o.idempotency_fingerprint,
               o.customer_id, o.customer_name, o.customer_phone, o.customer_email,
               o.delivery_address, o.delivery_zone, o.coupon_id, o.discount,
               o.payment_method, o.trx_id, o.notes, c.code AS coupon_code
        FROM orders o
        LEFT JOIN coupons c ON c.id = o.coupon_id
        WHERE o.idempotency_key = ?
        LIMIT 1
    " . $lockClause);
    $stmt->execute([$idempotencyKey]);
    $order = $stmt->fetch();
    return is_array($order) ? $order : null;
}

function legacyOrderRequestFingerprint(PDO $pdo, array $order): ?string {
    $couponId = $order['coupon_id'] ?? null;
    $couponCode = $order['coupon_code'] ?? null;
    if (($couponId !== null && !is_string($couponCode))
        || ($couponId === null && (float)($order['discount'] ?? 0) > 0)) {
        return null;
    }

    $itemsStmt = $pdo->prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ? ORDER BY id');
    $itemsStmt->execute([(int)$order['id']]);
    $quantities = [];
    foreach ($itemsStmt->fetchAll() as $item) {
        if ($item['product_id'] === null) {
            return null;
        }
        $productId = (int)$item['product_id'];
        $quantities[$productId] = ($quantities[$productId] ?? 0) + (int)$item['quantity'];
    }
    if ($quantities === []) {
        return null;
    }

    $deliveryAddress = (string)($order['delivery_address'] ?? '');
    $deliveryZone = $order['delivery_zone'] ?? '';
    if (!in_array($deliveryZone, ['local_dhaka', 'dhaka', 'outside_dhaka'], true)) {
        $deliveryZone = inferCheckoutDeliveryZone(strtolower(trim($deliveryAddress)));
    }
    if (!in_array($deliveryZone, ['local_dhaka', 'dhaka', 'outside_dhaka'], true)) {
        return null;
    }

    return checkoutRequestFingerprint(
        $order['customer_id'] === null ? null : (int)$order['customer_id'],
        (string)$order['customer_name'],
        (string)$order['customer_phone'],
        (string)($order['customer_email'] ?? ''),
        $deliveryAddress,
        $deliveryZone,
        is_string($couponCode) ? strtoupper(trim($couponCode)) : '',
        (string)$order['payment_method'],
        (string)($order['trx_id'] ?? ''),
        (string)($order['notes'] ?? ''),
        $quantities
    );
}

function respondWithIdempotentOrder(PDO $pdo, array $order, string $requestFingerprint): void {
    $storedFingerprint = $order['idempotency_fingerprint'] ?? null;
    if ($storedFingerprint === null) {
        $storedFingerprint = legacyOrderRequestFingerprint($pdo, $order);
        if ($storedFingerprint === null) {
            jsonResponse([
                'error' => 'This previous order cannot be verified against the checkout request. Please check your orders before retrying.'
            ], 409);
        }
        $updateStmt = $pdo->prepare(
            'UPDATE orders SET idempotency_fingerprint = ? WHERE id = ? AND idempotency_fingerprint IS NULL'
        );
        $updateStmt->execute([$storedFingerprint, (int)$order['id']]);
        $fingerprintStmt = $pdo->prepare('SELECT idempotency_fingerprint FROM orders WHERE id = ? LIMIT 1');
        $fingerprintStmt->execute([(int)$order['id']]);
        $storedFingerprint = $fingerprintStmt->fetchColumn();
        if ($storedFingerprint === false) {
            $storedFingerprint = null;
        }
    }

    if (!is_string($storedFingerprint)
        || !checkoutRequestFingerprintMatches($storedFingerprint, $requestFingerprint)) {
        jsonResponse([
            'error' => 'This checkout request key was already used with different order details. Please refresh checkout and try again.'
        ], 409);
    }

    jsonResponse([
        'status' => 'success',
        'message' => 'This order request was already submitted.',
        'data' => [
            'order_id' => (int)$order['id'],
            'order_number' => $order['order_number'],
            'tracking_code' => $order['tracking_code'],
            'total' => (float)$order['total']
        ]
    ]);
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
            $page = max(1, (int)($_GET['page'] ?? 1));
            $perPage = min(100, max(1, (int)($_GET['per_page'] ?? 25)));
            $offset = ($page - 1) * $perPage;
            $stmt = $pdo->prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT ? OFFSET ?');
            $stmt->bindValue(1, (int)$customer['id'], PDO::PARAM_INT);
            $stmt->bindValue(2, $perPage, PDO::PARAM_INT);
            $stmt->bindValue(3, $offset, PDO::PARAM_INT);
            $stmt->execute();
            $orders = $stmt->fetchAll();
            attachOrderItems($pdo, $orders);
            attachCustomerFeedbackState($pdo, $orders);
            jsonResponse(['status' => 'success', 'data' => $orders, 'pagination' => ['page' => $page, 'per_page' => $perPage]]);
        }

        $sql = 'SELECT * FROM orders WHERE 1=1';
        $params = [];
        if (!empty($_GET['status'])) {
            $allowedStatus = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
            if (!is_string($_GET['status']) || !in_array($_GET['status'], $allowedStatus, true)) {
                jsonResponse(['error' => 'Invalid order status filter.'], 422);
            }
            $sql .= ' AND order_status = ?';
            $params[] = $_GET['status'];
        }
        if (!empty($_GET['payment_status'])) {
            $allowedPaymentStatus = ['Pending', 'Pending Verification', 'Paid', 'Failed', 'Refunded'];
            if (!is_string($_GET['payment_status']) || !in_array($_GET['payment_status'], $allowedPaymentStatus, true)) {
                jsonResponse(['error' => 'Invalid payment status filter.'], 422);
            }
            $sql .= ' AND payment_status = ?';
            $params[] = $_GET['payment_status'];
        }
        if (!empty($_GET['q'])) {
            if (!is_string($_GET['q']) || strlen($_GET['q']) > 100) {
                jsonResponse(['error' => 'Order search text must be 100 characters or fewer.'], 422);
            }
            $q = '%' . trim($_GET['q']) . '%';
            $sql .= ' AND (order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ? OR tracking_code LIKE ?)';
            array_push($params, $q, $q, $q, $q);
        }

        $page = max(1, (int)($_GET['page'] ?? 1));
        $perPage = min(100, max(1, (int)($_GET['per_page'] ?? 25)));
        $offset = ($page - 1) * $perPage;
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM ({$sql}) AS filtered_orders");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();
        $stmt = $pdo->prepare($sql . ' ORDER BY id DESC LIMIT ? OFFSET ?');
        foreach ($params as $index => $param) {
            $stmt->bindValue($index + 1, $param);
        }
        $stmt->bindValue(count($params) + 1, $perPage, PDO::PARAM_INT);
        $stmt->bindValue(count($params) + 2, $offset, PDO::PARAM_INT);
        $stmt->execute();
        $orders = $stmt->fetchAll();
        attachOrderItems($pdo, $orders);
        jsonResponse([
            'status' => 'success',
            'count' => count($orders),
            'data' => $orders,
            'pagination' => ['page' => $page, 'per_page' => $perPage, 'total' => $total]
        ]);
        break;

    case 'POST':
        $data = $checkoutData;
        enforceApiRateLimit($pdo, 'checkout', 10, 900);
        $customer = null;
        $customerId = null;
        if (getBearerTokenFromRequest() !== null) {
            $customer = requireCustomerToken($pdo);
            $customerId = (int)$customer['id'];
            if (emailVerificationRequiredForOrders() && !(bool)$customer['email_verified']) {
                jsonResponse([
                    'error' => 'Verify your email address before placing an order.',
                    'code' => 'EMAIL_VERIFICATION_REQUIRED'
                ], 403);
            }
        }
        foreach (['customer_name', 'customer_phone', 'delivery_address'] as $requiredField) {
            if (!isset($data[$requiredField]) || !is_string($data[$requiredField]) || trim($data[$requiredField]) === '') {
                jsonResponse(['error' => 'Please provide complete delivery details and at least one item.'], 422);
            }
        }
        $customerName = trim((string)$data['customer_name']);
        $customerPhone = trim((string)$data['customer_phone']);
        $deliveryAddress = trim((string)$data['delivery_address']);

        if (checkoutTextLength($customerName) < 2 || checkoutTextLength($customerName) > 150
            || checkoutTextLength($customerPhone) > 30
            || checkoutTextLength($deliveryAddress) < 12 || checkoutTextLength($deliveryAddress) > 4000) {
            jsonResponse(['error' => 'Please provide valid delivery details and phone number.'], 422);
        }

        if (preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $customerName . $customerPhone . $deliveryAddress)) {
            jsonResponse(['error' => 'Please provide valid customer and delivery details.'], 422);
        }

        $normalizedPhone = normalizeBangladeshMobile($customerPhone);
        if ($normalizedPhone === null) {
            jsonResponse(['error' => 'Please enter a valid Bangladesh mobile number starting with 013 to 019.'], 422);
        }
        $customerPhone = $normalizedPhone;
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

        $productIds = array_keys($quantities);
        if ($productIds !== []) {
            $productPlaceholders = implode(',', array_fill(0, count($productIds), '?'));
            $productStmt = $pdo->prepare("SELECT id, name, is_sellable, stock_quantity FROM products WHERE id IN ({$productPlaceholders})");
            $productStmt->execute($productIds);
            $productRows = $productStmt->fetchAll();
            $productMap = [];
            foreach ($productRows as $productRow) {
                $productMap[(int)$productRow['id']] = $productRow;
            }
            foreach ($productIds as $productId) {
                $productRow = $productMap[(int)$productId] ?? null;
                if (!$productRow || isPlaceholderPublicProductName((string)($productRow['name'] ?? '')) || (int)$productRow['is_sellable'] !== 1) {
                    jsonResponse(['error' => 'One or more selected products are unavailable for purchase.'], 422);
                }
            }
        }

        $addressText = strtolower(trim($data['delivery_address']));
        $deliveryZone = $data['delivery_zone'] ?? (
            isset($data['delivery_area'])
                ? (stripos((string)$data['delivery_area'], 'outside') !== false
                    ? 'outside_dhaka'
                    : 'dhaka')
                : inferCheckoutDeliveryZone($addressText)
        );
        if (!in_array($deliveryZone, ['local_dhaka', 'dhaka', 'outside_dhaka'], true)) {
            jsonResponse(['error' => 'Invalid delivery zone.'], 422);
        }
        if ($deliveryZone === 'local_dhaka') {
            $deliveryZone = 'dhaka';
        }
        if (isset($data['delivery_area']) && (!is_string($data['delivery_area']) || strlen($data['delivery_area']) > 80)) {
            jsonResponse(['error' => 'Invalid delivery area.'], 422);
        }
        if ($deliveryZone === 'dhaka' && hasOutsideDhakaAddressSignal($addressText)) {
            jsonResponse(['error' => 'Delivery area does not match the chosen shipping zone.'], 422);
        }
        $deliveryArea = [
            'dhaka' => 'Inside Dhaka',
            'outside_dhaka' => 'Outside Dhaka'
        ][$deliveryZone];
        $paymentMethod = $data['payment_method'] ?? 'Cash on Delivery';
        if (!in_array($paymentMethod, ['Cash on Delivery', 'bKash', 'Nagad', 'Rocket'], true)) {
            jsonResponse(['error' => 'Invalid payment method.'], 422);
        }
        if ($paymentMethod !== 'Cash on Delivery') {
            $paymentSetting = [
                'bKash' => 'bkash_number',
                'Nagad' => 'nagad_number',
                'Rocket' => 'rocket_number'
            ][$paymentMethod];
            $paymentAccountStmt = $pdo->prepare('SELECT value_data FROM settings WHERE key_name = ?');
            $paymentAccountStmt->execute([$paymentSetting]);
            if (trim((string)$paymentAccountStmt->fetchColumn()) === '') {
                jsonResponse(['error' => 'This mobile wallet payment method is not currently available.'], 422);
            }
        }
        $trxId = is_string($data['trx_id'] ?? null) ? trim($data['trx_id']) : '';
        if (in_array($paymentMethod, ['bKash', 'Nagad', 'Rocket'], true) && $trxId === '') {
            jsonResponse(['error' => 'Enter the transaction ID for your mobile payment.'], 422);
        }
        $customerEmail = $customer !== null ? (string)$customer['email'] : '';
        $notes = is_string($data['notes'] ?? null) ? trim($data['notes']) : '';
        $previewTotal = isset($data['preview_total']) && is_numeric($data['preview_total'])
            ? round((float)$data['preview_total'], 2)
            : null;
        $confirmedServerTotal = isset($data['confirmed_server_total']) && is_numeric($data['confirmed_server_total'])
            ? round((float)$data['confirmed_server_total'], 2)
            : null;
        if (strlen($trxId) > 100 || strlen($notes) > 2000) {
            jsonResponse(['error' => 'One or more order fields are too long.'], 422);
        }
        if ((array_key_exists('preview_total', $data) && $previewTotal === null)
            || (array_key_exists('confirmed_server_total', $data) && $confirmedServerTotal === null)) {
            jsonResponse(['error' => 'Invalid checkout total confirmation.'], 422);
        }
        if (preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $trxId . $notes)) {
            jsonResponse(['error' => 'One or more order fields contain invalid characters.'], 422);
        }
        $couponCode = is_string($data['coupon_code'] ?? null) ? strtoupper(trim($data['coupon_code'])) : '';
        ksort($quantities, SORT_NUMERIC);
        $requestFingerprint = checkoutRequestFingerprint(
            $customerId,
            $customerName,
            $customerPhone,
            $customerEmail,
            $deliveryAddress,
            $deliveryZone,
            $couponCode,
            $paymentMethod,
            $trxId,
            $notes,
            $quantities
        );
        $idempotencyKey = is_string($data['idempotency_key'] ?? null) ? trim($data['idempotency_key']) : '';
        if ($idempotencyKey === '' || strlen($idempotencyKey) > 128
            || !preg_match('/\A[A-Za-z0-9._:-]+\z/', $idempotencyKey)) {
            jsonResponse(['error' => 'A valid checkout request key is required. Please reload checkout and try again.'], 422);
        }
        $duplicateOrder = findIdempotentOrder($pdo, $idempotencyKey);
        if ($duplicateOrder !== null) {
            respondWithIdempotentOrder($pdo, $duplicateOrder, $requestFingerprint);
        }

        $deliverySetting = [
            'dhaka' => 'delivery_fee_dhaka',
            'outside_dhaka' => 'delivery_fee_outside_dhaka'
        ][$deliveryZone];
        $feeStmt = $pdo->prepare('SELECT value_data FROM settings WHERE key_name = ?');
        $feeStmt->execute([$deliverySetting]);
        $deliveryFeeValue = $feeStmt->fetchColumn();
        $deliveryFee = $deliveryFeeValue === false
            ? ['dhaka' => 80.00, 'outside_dhaka' => 130.00][$deliveryZone]
            : max(0, (float)$deliveryFeeValue);
        $freeDeliveryStmt = $pdo->prepare('SELECT value_data FROM settings WHERE key_name = ?');
        $freeDeliveryStmt->execute(['free_delivery_min_amount']);
        $freeDeliveryThreshold = $freeDeliveryStmt->fetchColumn();

        $pdo->beginTransaction();
        try {
            $subtotal = 0.0;
            $lineItems = [];
            $lockClause = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
            $productStmt = $pdo->prepare('SELECT id, name, regular_price, sale_price, stock_quantity FROM products WHERE id = ? AND is_archived = 0 AND is_sellable = 1' . $lockClause);
            foreach ($quantities as $productId => $quantity) {
                $productStmt->execute([(int)$productId]);
                $product = $productStmt->fetch();
                if (!$product) {
                    throw new DomainException('An item in your cart is no longer available.');
                }
                if ((int)$product['stock_quantity'] < $quantity) {
                    $duplicateOrder = findIdempotentOrder($pdo, $idempotencyKey, $lockClause);
                    if ($duplicateOrder !== null) {
                        $pdo->rollBack();
                        respondWithIdempotentOrder($pdo, $duplicateOrder, $requestFingerprint);
                    }
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
            if ($couponCode !== '') {
                $couponStmt = $pdo->prepare('SELECT * FROM coupons WHERE UPPER(code) = ? AND is_active = 1' . $lockClause);
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
            if ($confirmedServerTotal !== null && abs($confirmedServerTotal - $total) > 0.01) {
                $pdo->rollBack();
                jsonResponse([
                    'error' => 'The order total changed again. Please review and confirm the updated total.',
                    'requires_confirmation' => true,
                    'server_subtotal' => $subtotal,
                    'server_discount' => $discount,
                    'server_delivery_fee' => $deliveryFee,
                    'server_total' => $total
                ], 409);
            }
            if ($previewTotal !== null
                && abs($previewTotal - $total) > 0.01
                && ($confirmedServerTotal === null || abs($confirmedServerTotal - $total) > 0.01)) {
                $pdo->rollBack();
                jsonResponse([
                    'error' => 'Prices, discount, or delivery fees changed. Please confirm the updated total.',
                    'requires_confirmation' => true,
                    'preview_total' => $previewTotal,
                    'server_subtotal' => $subtotal,
                    'server_discount' => $discount,
                    'server_delivery_fee' => $deliveryFee,
                    'server_total' => $total
                ], 409);
            }

            if ($trxId !== '') {
                $duplicateTrxStmt = $pdo->prepare(
                    'SELECT id FROM orders WHERE payment_method = ? AND trx_id = ? LIMIT 1' . $lockClause
                );
                $duplicateTrxStmt->execute([$paymentMethod, $trxId]);
                if ($duplicateTrxStmt->fetch()) {
                    throw new DomainException('This transaction ID has already been used for this payment method.');
                }
            }
            $orderNumber = 'WC-' . strtoupper(bin2hex(random_bytes(16)));
            $trackingCode = 'TRK-WC-' . strtoupper(bin2hex(random_bytes(16)));
            $paymentStatus = $trxId !== '' || in_array($paymentMethod, ['bKash', 'Nagad', 'Rocket'], true)
                ? 'Pending Verification'
                : 'Pending';

            $orderStmt = $pdo->prepare("
                INSERT INTO orders (
                    order_number, customer_id, customer_name, customer_phone, customer_email,
                    delivery_address, delivery_area, delivery_fee, subtotal, discount, coupon_id, total,
                    delivery_zone, payment_method, payment_status, trx_id, order_status, tracking_code,
                    idempotency_key, idempotency_fingerprint, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?)
            ");
            try {
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
                    $coupon ? (int)$coupon['id'] : null,
                    $total,
                    $deliveryZone,
                    $paymentMethod,
                    $paymentStatus,
                    $trxId !== '' ? $trxId : null,
                    $trackingCode,
                    $idempotencyKey !== '' ? $idempotencyKey : null,
                    $requestFingerprint,
                    $notes
                ]);
            } catch (PDOException $e) {
                $databaseError = is_array($e->errorInfo ?? null) ? (string)($e->errorInfo[2] ?? '') : '';
                $existingOrder = findIdempotentOrder($pdo, $idempotencyKey, $lockClause);
                if ($existingOrder !== null) {
                    if ($pdo->inTransaction()) {
                        $pdo->rollBack();
                    }
                    respondWithIdempotentOrder($pdo, $existingOrder, $requestFingerprint);
                }
                if ($trxId !== '' && stripos($databaseError, 'uq_orders_payment_trx_id') !== false) {
                    throw new DomainException('This transaction ID has already been used for this payment method.');
                }
                throw $e;
            }
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
                recordStockMovement(
                    $pdo,
                    (int)$item['product_id'],
                    'Sale',
                    (int)$item['quantity'],
                    (int)$orderId,
                    'Website order ' . $orderNumber
                );
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

            logAuditRequired(
                $pdo,
                null,
                'create',
                'order',
                (int)$orderId,
                null,
                ['order_number' => $orderNumber, 'total' => $total, 'item_count' => count($lineItems)]
            );
            $pdo->commit();
            $mailRecipient = getMailToAddress();
            $mailSender = getMailFromAddress();
            if (filter_var($mailRecipient, FILTER_VALIDATE_EMAIL)
                && filter_var($mailSender, FILTER_VALIDATE_EMAIL)) {
                $requiresPaymentReview = orderRequiresPaymentReview($paymentMethod, $paymentStatus);
                $mailLines = [
                    'New order ' . $orderNumber,
                    ...($requiresPaymentReview
                        ? ['ALERT: Verify the mobile wallet payment before processing or shipping this order.', '']
                        : []),
                    'Customer: ' . trim($data['customer_name']),
                    'Phone: ' . trim($data['customer_phone']),
                    'Address: ' . trim($data['delivery_address']),
                    'Delivery area: ' . $deliveryArea,
                    'Payment: ' . $paymentMethod . ' (' . $paymentStatus . ')',
                    '',
                    'Items:'
                ];
                foreach ($lineItems as $item) {
                    $mailLines[] = sprintf(
                        '%s x %d — %s',
                        $item['product_name'],
                        $item['quantity'],
                        number_format($item['total'], 2, '.', '')
                    );
                }
                $mailLines[] = '';
                $mailLines[] = 'Subtotal: ' . number_format($subtotal, 2, '.', '');
                $mailLines[] = 'Discount: ' . number_format($discount, 2, '.', '');
                $mailLines[] = 'Delivery: ' . number_format($deliveryFee, 2, '.', '');
                $mailLines[] = 'Total: ' . number_format($total, 2, '.', '');
                $ownerSubject = $requiresPaymentReview
                    ? 'ACTION REQUIRED: verify payment before shipping ' . $orderNumber
                    : 'New Shopademia order ' . $orderNumber;
                if (!sendStoreMail($mailRecipient, $ownerSubject, implode("\n", $mailLines))) {
                    error_log('Shopademia owner order notification failed.');
                }

                if ($customerEmail !== '') {
                    $customerBody = implode("\n", [
                        'Thank you for your order from Shopademia.',
                        'Order: ' . $orderNumber,
                        'Tracking code: ' . $trackingCode,
                        'Total: ' . number_format($total, 2, '.', ''),
                        'Payment status: ' . $paymentStatus,
                        'Please keep your order number and tracking code.'
                    ]);
                    if (!sendStoreMail($customerEmail, 'Shopademia order ' . $orderNumber, $customerBody)) {
                        error_log('Shopademia customer order notification failed.');
                    }
                }
            }
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
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Shopademia order transaction failed: ' . $e->getMessage());
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
            $orderStmt = $pdo->prepare(
                'SELECT o.order_status, o.coupon_id, o.payment_method, o.payment_status,
                        o.customer_id, o.order_number
                 FROM orders o WHERE o.id = ?' . $lockClause
            );
            $orderStmt->execute([$orderId]);
            $order = $orderStmt->fetch();
            if (!$order) {
                $pdo->rollBack();
                jsonResponse(['error' => 'Order not found'], 404);
            }

            $currentStatus = $order['order_status'];
            if (isset($data['order_status'])
                && $data['order_status'] !== $currentStatus
                && !isAllowedOrderStatusTransition((string)$currentStatus, (string)$data['order_status'])) {
                throw new DomainException('This order status transition is not allowed.');
            }
            if (count($fields) === 1
                && isset($data['order_status'])
                && $data['order_status'] === $currentStatus) {
                $pdo->commit();
                jsonResponse(['status' => 'success', 'message' => 'Order already has this status.']);
            }
            if (($data['order_status'] ?? null) === 'Shipped') {
                assertOrderPaymentAllowsShipping(
                    (string)$order['payment_method'],
                    (string)$order['payment_status']
                );
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
                    recordStockMovement(
                        $pdo,
                        (int)$item['product_id'],
                        'Return',
                        (int)$item['quantity'],
                        (int)$orderId,
                        'Order cancellation stock return.'
                    );
                }

                if ($order['coupon_id'] !== null) {
                    $releaseCouponUse = $pdo->prepare('
                        UPDATE coupons
                        SET times_used = CASE WHEN times_used > 0 THEN times_used - 1 ELSE 0 END
                        WHERE id = ?
                    ');
                    $releaseCouponUse->execute([(int)$order['coupon_id']]);
                }
            }

            $params[] = $orderId;
            $updateStmt = $pdo->prepare('UPDATE orders SET ' . implode(', ', $fields) . ' WHERE id = ?');
            $updateStmt->execute($params);
            if (($data['order_status'] ?? null) === 'Delivered' && $currentStatus !== 'Delivered') {
                enqueueDeliveredFeedbackNotifications($pdo, (int)$orderId);
            }
            logAuditRequired(
                $pdo,
                (int)$admin['id'],
                'update',
                'order',
                (int)$orderId,
                [
                    'order_status' => $currentStatus,
                    'payment_status' => $order['payment_status']
                ],
                [
                    'order_status' => $data['order_status'] ?? $currentStatus,
                    'payment_status' => $data['payment_status'] ?? $order['payment_status']
                ]
            );
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
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Shopademia order update transaction failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Failed to update order. Please try again.'], 500);
        }
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
