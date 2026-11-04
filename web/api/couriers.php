<?php
/**
 * Courier Integration API Endpoint (Pathao, Steadfast, RedX) (Sprint 5)
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/audit.php';
require_once __DIR__ . '/webhook_verify.php';

$pdo = Database::getConnection();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST' && isset($_GET['webhook'])) {
    $rawBody = file_get_contents('php://input');
    $signature = $_SERVER['HTTP_X_COURIER_SIGNATURE'] ?? '';
    $secret = defined('COURIER_WEBHOOK_SECRET') && COURIER_WEBHOOK_SECRET !== ''
        ? COURIER_WEBHOOK_SECRET
        : (getenv('COURIER_WEBHOOK_SECRET') ?: '');
    if ($secret === '') {
        logSecurityEvent('courier_webhook_unconfigured');
        jsonResponse(['error' => 'Courier webhook is not configured'], 503);
    }
    if (!is_string($rawBody) || !verifyWebhookSignature($rawBody, $signature, $secret)) {
        logSecurityEvent('courier_webhook_signature_invalid');
        jsonResponse(['error' => 'Webhook authorization failed'], 401);
    }

    $data = json_decode($rawBody, true);
    $trackingCode = is_array($data) && is_string($data['tracking_code'] ?? null)
        ? trim($data['tracking_code'])
        : '';
    $status = is_array($data) && is_string($data['status'] ?? null)
        ? trim($data['status'])
        : '';
    if ($trackingCode === '' || strlen($trackingCode) > 100 || $status === '' || strlen($status) > 100) {
        jsonResponse(['error' => 'Invalid webhook payload'], 400);
    }

    $stmt = $pdo->prepare("UPDATE courier_parcels SET status = ? WHERE tracking_code = ?");
    $stmt->execute([$status, $trackingCode]);
    jsonResponse(['status' => 'success']);
}

$admin = requireAdminToken($pdo);
switch ($method) {
    case 'GET':
        $stmt = $pdo->query("SELECT cp.*, o.order_number, o.customer_name FROM courier_parcels cp LEFT JOIN orders o ON cp.order_id = o.id ORDER BY cp.id DESC");
        jsonResponse(['status' => 'success', 'data' => $stmt->fetchAll()]);
        break;

    case 'POST':
        $data = getRequestBody();
        $orderId = (int)($data['order_id'] ?? 0);
        $courierName = trim($data['courier_name'] ?? 'Steadfast');
        $codAmount = (float)($data['cod_amount'] ?? 0);

        if ($orderId < 1) {
            jsonResponse(['error' => 'Valid order ID required for courier parcel creation.'], 422);
        }

        $trackingCode = 'TRK-' . strtoupper($courierName) . '-' . rand(100000, 999999);
        $stmt = $pdo->prepare("INSERT INTO courier_parcels (order_id, courier_name, tracking_code, cod_amount, status) VALUES (?, ?, ?, ?, 'Pending')");
        $stmt->execute([$orderId, $courierName, $trackingCode, $codAmount]);

        logAudit($pdo, (int)$admin['id'], 'create', 'courier_parcel', (int)$pdo->lastInsertId(), null, $data);
        jsonResponse(['status' => 'success', 'message' => 'Parcel created with courier successfully.', 'data' => ['tracking_code' => $trackingCode]]);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
