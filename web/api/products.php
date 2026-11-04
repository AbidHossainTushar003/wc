<?php
/**
 * Products API Endpoint
 * Handles CRUD operations, filtering, category search, and product details with reviews
 */

require_once __DIR__ . '/db.php';

$pdo = Database::getConnection();
$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'GET') {
    requireAdminToken($pdo);
}

switch ($method) {
    case 'GET':
        // Single product detail
        if (isset($_GET['id'])) {
            $stmt = $pdo->prepare("
                SELECT p.*, c.name AS category_name, c.slug AS category_slug 
                FROM products p 
                LEFT JOIN categories c ON p.category_id = c.id 
                WHERE p.id = ?
            ");
            $stmt->execute([(int)$_GET['id']]);
            $product = $stmt->fetch();

            if (!$product) {
                jsonResponse(['error' => 'Product not found'], 404);
            }

            $product['images'] = json_decode($product['images'] ?: '[]', true);

            // Fetch reviews
            $revStmt = $pdo->prepare("SELECT * FROM reviews WHERE product_id = ? ORDER BY id DESC");
            $revStmt->execute([(int)$_GET['id']]);
            $product['reviews'] = $revStmt->fetchAll();

            jsonResponse(['status' => 'success', 'data' => $product]);
        }

        // List products with optional filters
        $sql = "
            SELECT p.*, c.name AS category_name, c.slug AS category_slug 
            FROM products p 
            LEFT JOIN categories c ON p.category_id = c.id 
            WHERE 1=1
        ";
        $params = [];

        if (!empty($_GET['category'])) {
            $sql .= " AND (c.slug = ? OR c.id = ?)";
            $params[] = $_GET['category'];
            $params[] = $_GET['category'];
        }

        if (!empty($_GET['featured'])) {
            $sql .= " AND p.is_featured = 1";
        }

        if (!empty($_GET['trending'])) {
            $sql .= " AND p.is_trending = 1";
        }

        if (!empty($_GET['q'])) {
            $q = '%' . trim($_GET['q']) . '%';
            $sql .= " AND (p.name LIKE ? OR p.short_desc LIKE ? OR p.sku LIKE ?)";
            $params[] = $q;
            $params[] = $q;
            $params[] = $q;
        }

        $sort = $_GET['sort'] ?? 'newest';
        if ($sort === 'price_asc') {
            $sql .= " ORDER BY COALESCE(p.sale_price, p.regular_price) ASC";
        } elseif ($sort === 'price_desc') {
            $sql .= " ORDER BY COALESCE(p.sale_price, p.regular_price) DESC";
        } else {
            $sql .= " ORDER BY p.id DESC";
        }

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $products = $stmt->fetchAll();

        foreach ($products as &$p) {
            $p['images'] = json_decode($p['images'] ?: '[]', true);
        }

        jsonResponse(['status' => 'success', 'count' => count($products), 'data' => $products]);
        break;

    case 'POST':
        // Create Product (Admin)
        $data = getRequestBody();
        if (empty($data['name']) || empty($data['category_id']) || empty($data['regular_price'])) {
            jsonResponse(['error' => 'Missing required fields: name, category_id, regular_price'], 422);
        }

        $slug = !empty($data['slug']) ? $data['slug'] : strtolower(trim(preg_replace('/[^A-Za-z0-9-]+/', '-', $data['name']), '-')) . '-' . rand(100, 999);
        $images = isset($data['images']) && is_array($data['images'])
            ? json_encode($data['images'])
            : '["assets/product-placeholder.svg"]';

        $stmt = $pdo->prepare("
            INSERT INTO products (name, slug, category_id, regular_price, sale_price, stock_quantity, sku, short_desc, description, images, is_featured, is_trending) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $data['name'],
            $slug,
            (int)$data['category_id'],
            (float)$data['regular_price'],
            !empty($data['sale_price']) ? (float)$data['sale_price'] : null,
            isset($data['stock_quantity']) ? (int)$data['stock_quantity'] : 10,
            $data['sku'] ?? ('WC-' . strtoupper(substr(md5(uniqid()), 0, 6))),
            $data['short_desc'] ?? '',
            $data['description'] ?? '',
            $images,
            !empty($data['is_featured']) ? 1 : 0,
            !empty($data['is_trending']) ? 1 : 0
        ]);

        $newId = $pdo->lastInsertId();
        jsonResponse(['status' => 'success', 'message' => 'Product created successfully', 'id' => $newId], 201);
        break;

    case 'PUT':
        // Update Product (Admin)
        $data = getRequestBody();
        if (empty($data['id'])) {
            jsonResponse(['error' => 'Missing product ID'], 422);
        }

        $fields = [];
        $params = [];

        $allowed = ['name', 'category_id', 'regular_price', 'sale_price', 'stock_quantity', 'sku', 'short_desc', 'description', 'is_featured', 'is_trending'];
        foreach ($allowed as $f) {
            if (isset($data[$f])) {
                $fields[] = "$f = ?";
                $params[] = $data[$f];
            }
        }

        if (isset($data['images'])) {
            $fields[] = "images = ?";
            $params[] = is_array($data['images']) ? json_encode($data['images']) : $data['images'];
        }

        if (empty($fields)) {
            jsonResponse(['error' => 'No fields to update'], 400);
        }

        $params[] = (int)$data['id'];
        $sql = "UPDATE products SET " . implode(', ', $fields) . " WHERE id = ?";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        jsonResponse(['status' => 'success', 'message' => 'Product updated successfully']);
        break;

    case 'DELETE':
        // Delete Product (Admin)
        $id = $_GET['id'] ?? null;
        if (!$id) {
            $body = getRequestBody();
            $id = $body['id'] ?? null;
        }

        if (!$id) {
            jsonResponse(['error' => 'Missing product ID'], 400);
        }

        $stmt = $pdo->prepare("DELETE FROM products WHERE id = ?");
        $stmt->execute([(int)$id]);

        jsonResponse(['status' => 'success', 'message' => 'Product deleted successfully']);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
