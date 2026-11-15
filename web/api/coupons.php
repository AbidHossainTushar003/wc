<?php
/**
 * Coupons API Endpoint
 * Handles coupon validation for checkout and full CRUD for Admin
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/audit.php';

function validateCouponInput(array $data): array {
    $code = strtoupper(trim((string)($data['code'] ?? '')));
    $type = $data['type'] ?? 'percentage';
    $value = $data['value'] ?? null;
    $minOrder = $data['min_order'] ?? 0;
    $maxDiscount = $data['max_discount'] ?? null;
    $expiryDate = $data['expiry_date'] ?? null;
    $usageLimit = $data['usage_limit'] ?? 0;
    $isActive = $data['is_active'] ?? 1;
    $tagInput = $data['tag'] ?? '';
    if (!is_string($tagInput)) {
        jsonResponse(['error' => 'Coupon tag must be text.'], 422);
    }
    $tag = trim($tagInput);

    if (!preg_match('/^[A-Z0-9_-]{2,50}$/', $code)) {
        jsonResponse(['error' => 'Coupon code must be 2-50 letters, numbers, hyphens, or underscores.'], 422);
    }
    if (strlen($tag) > 40 || ($tag !== '' && !preg_match('/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/', $tag))) {
        jsonResponse(['error' => 'Coupon tag must be 1-40 letters, numbers, spaces, dots, hyphens, or underscores.'], 422);
    }
    if (!in_array($type, ['percentage', 'fixed'], true)) {
        jsonResponse(['error' => 'Coupon type must be percentage or fixed.'], 422);
    }
    if (!is_numeric($value) || (float)$value <= 0 || ($type === 'percentage' && (float)$value > 100)) {
        jsonResponse(['error' => 'Enter a valid discount value.'], 422);
    }
    if (!is_numeric($minOrder) || (float)$minOrder < 0) {
        jsonResponse(['error' => 'Minimum order must be zero or more.'], 422);
    }
    if ($maxDiscount !== null && $maxDiscount !== '' && (!is_numeric($maxDiscount) || (float)$maxDiscount <= 0)) {
        jsonResponse(['error' => 'Maximum discount must be a positive amount.'], 422);
    }
    if ($expiryDate !== null && $expiryDate !== '') {
        $date = DateTime::createFromFormat('!Y-m-d', (string)$expiryDate);
        if (!$date || $date->format('Y-m-d') !== $expiryDate) {
            jsonResponse(['error' => 'Enter a valid coupon expiry date.'], 422);
        }
    } else {
        $expiryDate = null;
    }
    if (filter_var($usageLimit, FILTER_VALIDATE_INT) === false || (int)$usageLimit < 0) {
        jsonResponse(['error' => 'Usage limit must be zero or a positive whole number.'], 422);
    }
    if (!in_array((string)$isActive, ['0', '1'], true) && !is_bool($isActive) && !in_array($isActive, [0, 1], true)) {
        jsonResponse(['error' => 'Coupon active state is invalid.'], 422);
    }

    return [
        $code,
        $type,
        (float)$value,
        (float)$minOrder,
        $maxDiscount === null || $maxDiscount === '' ? null : (float)$maxDiscount,
        $expiryDate,
        (int)$usageLimit,
        (int)(bool)$isActive,
        $tag === '' ? null : $tag
    ];
}

$pdo = Database::getConnection();
$method = $_SERVER['REQUEST_METHOD'];
$admin = null;
if ($method === 'GET' || $method !== 'POST') {
    $admin = requireAdminToken($pdo);
    $action = ['GET' => 'read', 'PUT' => 'update', 'DELETE' => 'archive'][$method] ?? null;
    if ($action === null) {
        jsonResponse(['error' => 'Method not allowed'], 405);
    }
    requireAdminPermission($admin, 'coupons', $action);
}

switch ($method) {
    case 'GET':
        $stmt = $pdo->query("
            SELECT c.*,
                COALESCE(s.paid_sales_amount, 0) AS paid_sales_amount,
                COALESCE(s.paid_order_count, 0) AS paid_order_count,
                CASE WHEN t.total_paid_sales > 0
                    THEN ROUND(COALESCE(s.paid_sales_amount, 0) * 100.0 / t.total_paid_sales, 2)
                    ELSE 0
                END AS paid_sales_share_percent
            FROM coupons c
            LEFT JOIN (
                SELECT coupon_id, SUM(total) AS paid_sales_amount, COUNT(*) AS paid_order_count
                FROM orders
                WHERE coupon_id IS NOT NULL AND payment_status = 'Paid' AND order_status <> 'Cancelled'
                GROUP BY coupon_id
            ) s ON s.coupon_id = c.id
            CROSS JOIN (
                SELECT COALESCE(SUM(total), 0) AS total_paid_sales
                FROM orders
                WHERE payment_status = 'Paid' AND order_status <> 'Cancelled'
            ) t
            ORDER BY c.id DESC
        ");
        $coupons = $stmt->fetchAll();
        jsonResponse(['status' => 'success', 'data' => $coupons]);
        break;

    case 'POST':
        $data = getRequestBody();

        // 1. Coupon validation for customer checkout
        if (isset($data['action']) && $data['action'] === 'validate') {
            enforceApiRateLimit($pdo, 'coupon_validation', 20, 900);
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
        $admin = requireAdminToken($pdo);
        requireAdminPermission($admin, 'coupons', 'create');
        enforceApiRateLimit($pdo, 'coupon_mutation', 60, 900);
        [$code, $type, $value, $minOrder, $maxDiscount, $expiryDate, $usageLimit, $isActive, $tag] = validateCouponInput($data);
        $duplicateStmt = $pdo->prepare('SELECT id FROM coupons WHERE UPPER(code) = ?');
        $duplicateStmt->execute([$code]);
        if ($duplicateStmt->fetchColumn()) {
            jsonResponse(['error' => 'A coupon with this code already exists.'], 409);
        }
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare("
                INSERT INTO coupons (code, tag, type, value, min_order, max_discount, expiry_date, usage_limit, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$code, $tag, $type, $value, $minOrder, $maxDiscount, $expiryDate, $usageLimit, $isActive]);
            $couponId = (int)$pdo->lastInsertId();
            logAuditRequired($pdo, (int)$admin['id'], 'create', 'coupon', $couponId, null, ['code' => $code, 'tag' => $tag, 'type' => $type, 'value' => $value, 'is_active' => $isActive]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Shopademia coupon creation failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not create coupon. Please try again.'], 500);
        }

        jsonResponse(['status' => 'success', 'message' => 'Coupon created successfully', 'id' => $couponId], 201);
        break;

    case 'PUT':
        $data = getRequestBody();
        $id = filter_var($data['id'] ?? null, FILTER_VALIDATE_INT);
        if ($id === false || $id < 1) {
            jsonResponse(['error' => 'A valid coupon ID is required.'], 422);
        }

        [$code, $type, $value, $minOrder, $maxDiscount, $expiryDate, $usageLimit, $isActive, $tag] = validateCouponInput($data);
        enforceApiRateLimit($pdo, 'coupon_mutation', 60, 900);
        try {
            $pdo->beginTransaction();
            $lock = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
            $lookup = $pdo->prepare('SELECT code, tag, type, value, min_order, max_discount, expiry_date, usage_limit, is_active FROM coupons WHERE id = ?' . $lock);
            $lookup->execute([$id]);
            $oldCoupon = $lookup->fetch();
            if (!$oldCoupon) {
                $pdo->rollBack();
                jsonResponse(['error' => 'Coupon not found.'], 404);
            }

            $duplicateStmt = $pdo->prepare('SELECT id FROM coupons WHERE UPPER(code) = ? AND id != ?');
            $duplicateStmt->execute([$code, $id]);
            if ($duplicateStmt->fetchColumn()) {
                $pdo->rollBack();
                jsonResponse(['error' => 'A coupon with this code already exists.'], 409);
            }
            $stmt = $pdo->prepare("
                UPDATE coupons
                SET code = ?, tag = ?, type = ?, value = ?, min_order = ?, max_discount = ?,
                    expiry_date = ?, usage_limit = ?, is_active = ?
                WHERE id = ?
            ");
            $stmt->execute([$code, $tag, $type, $value, $minOrder, $maxDiscount, $expiryDate, $usageLimit, $isActive, $id]);
            logAuditRequired(
                $pdo,
                (int)$admin['id'],
                'update',
                'coupon',
                (int)$id,
                ['code' => $oldCoupon['code'], 'tag' => $oldCoupon['tag'], 'type' => $oldCoupon['type'], 'value' => $oldCoupon['value'], 'is_active' => $oldCoupon['is_active']],
                ['code' => $code, 'tag' => $tag, 'type' => $type, 'value' => $value, 'is_active' => $isActive]
            );
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Shopademia coupon update failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not update coupon. Please try again.'], 500);
        }

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

        $couponId = filter_var($id, FILTER_VALIDATE_INT);
        if ($couponId === false || $couponId < 1) {
            jsonResponse(['error' => 'A valid coupon ID is required.'], 422);
        }
        enforceApiRateLimit($pdo, 'coupon_mutation', 60, 900);
        try {
            $pdo->beginTransaction();
            $lock = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
            $lookup = $pdo->prepare('SELECT code, type, value, is_active FROM coupons WHERE id = ?' . $lock);
            $lookup->execute([$couponId]);
            $coupon = $lookup->fetch();
            if (!$coupon) {
                $pdo->rollBack();
                jsonResponse(['error' => 'Coupon not found.'], 404);
            }
            $stmt = $pdo->prepare('DELETE FROM coupons WHERE id = ?');
            $stmt->execute([$couponId]);
            logAuditRequired($pdo, (int)$admin['id'], 'delete', 'coupon', $couponId, $coupon, null);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Shopademia coupon deletion failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not remove coupon. Please try again.'], 500);
        }

        jsonResponse(['status' => 'success', 'message' => 'Coupon removed']);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
