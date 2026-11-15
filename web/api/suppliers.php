<?php
/**
 * Product Supplier API Endpoint (Sprint 5)
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/audit.php';

$pdo = Database::getConnection();
$admin = requireAdminToken($pdo);
$method = $_SERVER['REQUEST_METHOD'];
requireAdminPermission($admin, 'suppliers', $method === 'GET' ? 'read' : 'create');

switch ($method) {
    case 'GET':
        $stmt = $pdo->query("SELECT * FROM suppliers ORDER BY id DESC");
        jsonResponse(['status' => 'success', 'data' => $stmt->fetchAll()]);
        break;

    case 'POST':
        $data = getRequestBody();
        $name = trim($data['name'] ?? '');
        $phone = trim($data['phone'] ?? '');
        $email = trim($data['email'] ?? null);
        $address = trim($data['address'] ?? null);
        $contactPerson = trim($data['contact_person'] ?? null);

        if ($name === '' || $phone === '') {
            jsonResponse(['error' => 'Supplier name and phone are required.'], 422);
        }

        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare("INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([$name, $contactPerson, $phone, $email, $address]);
            logAuditRequired($pdo, (int)$admin['id'], 'create', 'supplier', (int)$pdo->lastInsertId(), null, $data);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Shopademia supplier creation failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not create supplier. Please try again.'], 500);
        }

        jsonResponse(['status' => 'success', 'message' => 'Supplier added successfully.']);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
