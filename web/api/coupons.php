<?php
/**
 * Coupons API Endpoint
 * Handles coupon validation for checkout and full CRUD for Admin
 */

require_once __DIR__ . '/db.php';

$pdo = Database::getConnection();
$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'GET' || $method !== 'POST') {
    requireAdminToken($pdo);
}

switch ($method) {
    case 'GET':
        $stmt = $pdo->query("SELECT * FROM coupons ORDER BY id DESC");
        $coupons = $stmt->fetchAll();
        jsonResponse(['status' => 'success', 'data' => $coupons]);
        break;

    case 'POST':
        $data = getRequestBody();

        // 1. Coupon validation for customer checkout
        if (isset($data['action']) && $data['action'] === 'validate') {
            $code = is_string($data['code'] ?? null) ? strtoupper(trim($data['code'])) : '';
            $subtotalInput = $data['subtotal'] ?? 0;
            if (!is_numeric($subtotalInput) || (float)$subtotalInput < 0) {
                jsonResponse(['error' => 'A valid order subtotal is required'], 400);
            }
            $subtotal = (float)$subtotalInput;

            if (empty($code)) {
                jsonResponse(['error' => 'Please enter a coupon code'], 400);
            }

            $stmt = $pdo->prepare("SELECT * FROM coupons WHERE UPPER(code) = ? AND is_active = 1");
            $stmt->execute([$code]);
            $coupon = $stmt->fetch();

            if (!$coupon
                || ($coupon['expiry_date'] && $coupon['expiry_date'] < gmdate('Y-m-d'))
                || ((int)$coupon['usage_limit'] > 0 && (int)$coupon['times_used'] >= (int)$coupon['usage_limit'])
                || $subtotal < (float)$coupon['min_order']) {
                jsonResponse(['error' => 'Invalid or expired coupon code'], 404);
            }

            if ($subtotal < (float)$coupon['min_order']) {
                jsonResponse(['error' => 'Minimum order amount for this coupon is ৳' . number_format($coupon['min_order'])], 400);
            }

            $discount = 0;
            if ($coupon['type'] === 'percentage') {
                $discount = ($subtotal * (float)$coupon['value']) / 100.0;
                if (!empty($coupon['max_discount']) && $discount > (float)$coupon['max_discount']) {
                    $discount = (float)$coupon['max_discount'];
                }
            } else {
                $discount = (float)$coupon['value'];
            }

            if ($discount > $subtotal) {
                $discount = $subtotal;
            }

            jsonResponse([
                'status' => 'success',
                'message' => 'Coupon applied successfully!',
                'data' => [
                    'code' => $coupon['code'],
                    'discount' => round($discount, 2),
                    'type' => $coupon['type'],
                    'value' => (float)$coupon['value']
                ]
            ]);
        }

        // 2. Add new coupon (Admin)
        requireAdminToken($pdo);
        if (empty($data['code']) || empty($data['value'])) {
            jsonResponse(['error' => 'Coupon code and discount value are required'], 422);
        }

        $code = strtoupper(trim($data['code']));
        $stmt = $pdo->prepare("
            INSERT INTO coupons (code, type, value, min_order, max_discount, expiry_date, usage_limit, is_active) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $code,
            $data['type'] ?? 'percentage',
            (float)$data['value'],
            (float)($data['min_order'] ?? 0),
            !empty($data['max_discount']) ? (float)$data['max_discount'] : null,
            !empty($data['expiry_date']) ? $data['expiry_date'] : '2028-12-31',
            (int)($data['usage_limit'] ?? 100),
            isset($data['is_active']) ? (int)$data['is_active'] : 1
        ]);

        jsonResponse(['status' => 'success', 'message' => 'Coupon created successfully', 'id' => $pdo->lastInsertId()], 201);
        break;

    case 'PUT':
        $data = getRequestBody();
        if (empty($data['id'])) {
            jsonResponse(['error' => 'Coupon ID is required'], 422);
        }

        $stmt = $pdo->prepare("UPDATE coupons SET is_active = ? WHERE id = ?");
        $stmt->execute([(int)$data['is_active'], (int)$data['id']]);

        jsonResponse(['status' => 'success', 'message' => 'Coupon updated successfully']);
        break;

    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if (!$id) {
            $data = getRequestBody();
            $id = $data['id'] ?? null;
        }

        if (!$id) {
            jsonResponse(['error' => 'Coupon ID is required'], 400);
        }

        $stmt = $pdo->prepare("DELETE FROM coupons WHERE id = ?");
        $stmt->execute([(int)$id]);

        jsonResponse(['status' => 'success', 'message' => 'Coupon removed']);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
