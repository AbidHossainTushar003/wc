<?php
/**
 * Categories API Endpoint
 */

require_once __DIR__ . '/db.php';

$pdo = Database::getConnection();
$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'GET') {
    requireAdminToken($pdo);
}

switch ($method) {
    case 'GET':
        $stmt = $pdo->query("
            SELECT c.*, COUNT(p.id) AS product_count 
            FROM categories c 
            LEFT JOIN products p ON c.id = p.category_id AND p.is_archived = 0
            WHERE c.is_archived = 0
            GROUP BY c.id 
            ORDER BY c.name ASC
        ");
        $categories = $stmt->fetchAll();
        jsonResponse(['status' => 'success', 'data' => $categories]);
        break;

    case 'POST':
        $data = getRequestBody();
        if (empty($data['name'])) {
            jsonResponse(['error' => 'Category name is required'], 422);
        }

        $slug = !empty($data['slug']) ? $data['slug'] : strtolower(trim(preg_replace('/[^A-Za-z0-9-]+/', '-', $data['name']), '-'));
        $stmt = $pdo->prepare("INSERT INTO categories (name, slug, description, image) VALUES (?, ?, ?, ?)");
        $stmt->execute([
            $data['name'],
            $slug,
            $data['description'] ?? '',
            $data['image'] ?? 'assets/category-placeholder.svg'
        ]);

        jsonResponse(['status' => 'success', 'message' => 'Category created', 'id' => $pdo->lastInsertId()], 201);
        break;

    case 'PUT':
        $data = getRequestBody();
        if (empty($data['id']) || empty($data['name'])) {
            jsonResponse(['error' => 'Category ID and name are required'], 422);
        }

        $stmt = $pdo->prepare("UPDATE categories SET name = ?, description = ?, image = ? WHERE id = ?");
        $stmt->execute([$data['name'], $data['description'] ?? '', $data['image'] ?? '', (int)$data['id']]);

        jsonResponse(['status' => 'success', 'message' => 'Category updated']);
        break;

    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if (!$id) {
            $body = getRequestBody();
            $id = $body['id'] ?? null;
        }

        if (!$id) {
            jsonResponse(['error' => 'Missing category ID'], 400);
        }

        $stmt = $pdo->prepare("UPDATE categories SET is_archived = 1 WHERE id = ? AND is_archived = 0");
        $stmt->execute([(int)$id]);

        jsonResponse(['status' => 'success', 'message' => 'Category archived']);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
