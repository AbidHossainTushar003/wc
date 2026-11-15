<?php
/**
 * Products API Endpoint
 * Handles CRUD operations, filtering, category search, and product details with reviews
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/audit.php';
require_once __DIR__ . '/inventory-domain.php';
require_once __DIR__ . '/idempotency.php';
require_once __DIR__ . '/catalog-domain.php';

$pdo = Database::getConnection();
$method = $_SERVER['REQUEST_METHOD'];

function filterPublicProducts(array $products): array {
    return array_values(array_filter($products, static function ($product) {
        $name = $product['name'] ?? $product['product_name'] ?? '';
        return !isPlaceholderPublicProductName((string)$name);
    }));
}

function validateProductSeoFields(array $data): array {
    $limits = [
        'seo_title' => 70,
        'meta_description' => 160,
        'focus_keyword' => 100,
        'h1' => 150,
        'alt_text' => 200,
        'canonical_url' => 500
    ];
    $fields = [];
    foreach ($limits as $field => $limit) {
        $value = $data[$field] ?? '';
        if (!is_string($value) && $value !== null) {
            jsonResponse(['error' => 'SEO fields must be text values.'], 422);
        }
        $value = trim(strip_tags((string)$value));
        if (strlen($value) > $limit || preg_match('/[\x00-\x1F\x7F]/', $value)) {
            jsonResponse(['error' => 'One or more SEO fields exceed their allowed length or contain invalid characters.'], 422);
        }
        if ($field === 'canonical_url' && $value !== '') {
            $parts = parse_url($value);
            if (!filter_var($value, FILTER_VALIDATE_URL)
                || !is_array($parts)
                || strtolower((string)($parts['scheme'] ?? '')) !== 'https'
                || !in_array(strtolower((string)($parts['host'] ?? '')), ['shopademia.store', 'www.shopademia.store'], true)) {
                jsonResponse(['error' => 'Canonical URL must be a valid HTTPS URL on shopademia.store.'], 422);
            }
        }
        $fields[$field] = $value === '' ? null : $value;
    }
    return $fields;
}

function validateProductImagePaths(array $data, bool $isCreate = false): array {
    if (!array_key_exists('images', $data)) {
        return $isCreate ? ['assets/product-placeholder.svg'] : [];
    }
    $images = $data['images'];
    if (!is_array($images) || !array_is_list($images) || count($images) > 10
        || array_filter($images, static fn($image): bool => !is_string($image) || strlen($image) > 500) !== []) {
        jsonResponse(['error' => 'A product can have up to ten valid image paths.'], 422);
    }
    return $images;
}

function requireActiveProductCategory(PDO $pdo, int $categoryId): void {
    $stmt = $pdo->prepare('SELECT id FROM categories WHERE id = ? AND is_archived = 0 LIMIT 1');
    $stmt->execute([$categoryId]);
    if ($stmt->fetchColumn() === false) {
        jsonResponse(['error' => 'Category not found.'], 404);
    }
}

if ($method !== 'GET') {
    $admin = requireAdminToken($pdo);
    $action = ['POST' => 'create', 'PUT' => 'update', 'DELETE' => 'archive'][$method] ?? null;
    if ($action === null) {
        jsonResponse(['error' => 'Method not allowed'], 405);
    }
    requireAdminPermission($admin, 'products', $action);
}

switch ($method) {
    case 'GET':
        $includeUnavailable = ($_GET['include_unavailable'] ?? '') === '1';
        if (isset($_GET['include_unavailable']) && !in_array($_GET['include_unavailable'], ['0', '1'], true)) {
            jsonResponse(['error' => 'Invalid include_unavailable value'], 422);
        }
        if ($includeUnavailable) {
            $admin = requireAdminToken($pdo);
            requireAdminPermission($admin, 'products', 'read');
        }

        // Single product detail
        if (isset($_GET['id'])) {
            $availabilityFilter = $includeUnavailable ? '' : ' AND p.is_sellable = 1';
            $stmt = $pdo->prepare("
                SELECT p.*, c.name AS category_name, c.slug AS category_slug 
                FROM products p 
                LEFT JOIN categories c ON p.category_id = c.id 
                WHERE p.id = ? AND p.is_archived = 0{$availabilityFilter}
            ");
            $stmt->execute([(int)$_GET['id']]);
            $product = $stmt->fetch();

            if (!$product) {
                jsonResponse(['error' => 'Product not found'], 404);
            }
            if (!$includeUnavailable && isPlaceholderPublicProductName((string)($product['name'] ?? ''))) {
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
        $availabilityFilter = $includeUnavailable ? '' : ' AND p.is_sellable = 1';
        $sql = "
            SELECT p.*, c.name AS category_name, c.slug AS category_slug 
            FROM products p 
            LEFT JOIN categories c ON p.category_id = c.id 
            WHERE p.is_archived = 0{$availabilityFilter}
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
        if ($sort === 'sale') {
            $sql .= ' AND p.sale_price IS NOT NULL AND p.sale_price > 0 AND p.sale_price < p.regular_price';
            $sql .= ' ORDER BY (p.regular_price - p.sale_price) DESC, p.id DESC';
        } elseif ($sort === 'price_asc') {
            $sql .= " ORDER BY COALESCE(p.sale_price, p.regular_price) ASC";
        } elseif ($sort === 'price_desc') {
            $sql .= " ORDER BY COALESCE(p.sale_price, p.regular_price) DESC";
        } else {
            $sql .= " ORDER BY p.id DESC";
        }

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $products = $stmt->fetchAll();

        if (!$includeUnavailable) {
            $products = filterPublicProducts($products);
        }

        foreach ($products as &$p) {
            $p['images'] = json_decode($p['images'] ?: '[]', true);
        }

        jsonResponse(['status' => 'success', 'count' => count($products), 'data' => $products]);
        break;

    case 'POST':
        // Create Product (Admin)
        $data = getRequestBody();
        $seo = validateProductSeoFields($data);
        $categoryId = filter_var($data['category_id'] ?? null, FILTER_VALIDATE_INT);
        $regularPrice = isset($data['regular_price']) ? (float)$data['regular_price'] : null;
        $salePriceRaw = $data['sale_price'] ?? null;
        $salePrice = $salePriceRaw === null || $salePriceRaw === '' ? null : (float)$salePriceRaw;
        if (empty($data['name']) || $categoryId === false || $categoryId < 1 || !is_numeric($regularPrice) || $regularPrice <= 0) {
            jsonResponse(['error' => 'Missing required fields: valid name, category_id, and positive regular_price'], 422);
        }
        if ($salePrice !== null && (!is_numeric($salePrice) || $salePrice <= 0 || $salePrice >= $regularPrice)) {
            jsonResponse(['error' => 'Sale price must be positive and lower than the regular price.'], 422);
        }
        requireActiveProductCategory($pdo, (int)$categoryId);
        $isSellable = $data['is_sellable'] ?? true;
        if (!in_array($isSellable, [true, false, 0, 1, '0', '1'], true)) {
            jsonResponse(['error' => 'is_sellable must be a boolean value.'], 422);
        }
        $isSellable = in_array($isSellable, [true, 1, '1'], true) ? 1 : 0;
        if ($isSellable === 1 && isPlaceholderPublicProductName((string)$data['name'])) {
            jsonResponse(['error' => 'Replace placeholder product text before publishing this product.'], 422);
        }

        $slug = !empty($data['slug']) ? $data['slug'] : strtolower(trim(preg_replace('/[^A-Za-z0-9-]+/', '-', $data['name']), '-')) . '-' . rand(100, 999);
        $images = validateProductImagePaths($data, true);
        $images = json_encode($images, JSON_THROW_ON_ERROR);

        $stockQuantity = parseInventoryInteger($data['stock_quantity'] ?? 10);
        if ($stockQuantity === null || $stockQuantity < 0) {
            jsonResponse(['error' => 'Initial stock must be a non-negative whole number.'], 422);
        }

        enforceApiRateLimit($pdo, 'product_mutation', 60, 900);
        $idempotencyKey = requireIdempotencyKey();
        try {
            $pdo->beginTransaction();
            reserveIdempotency($pdo, (int)$admin['id'], 'products.create', $idempotencyKey, $data);
            $stmt = $pdo->prepare("
                INSERT INTO products (name, slug, category_id, regular_price, sale_price, stock_quantity, sku, short_desc, description, images, is_featured, is_trending, is_sellable, seo_title, meta_description, focus_keyword, h1, alt_text, canonical_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $data['name'],
                $slug,
                (int)$data['category_id'],
                (float)$data['regular_price'],
                !empty($data['sale_price']) ? (float)$data['sale_price'] : null,
                $stockQuantity,
                $data['sku'] ?? ('WC-' . strtoupper(substr(md5(uniqid()), 0, 6))),
                $data['short_desc'] ?? '',
                $data['description'] ?? '',
                $images,
                !empty($data['is_featured']) ? 1 : 0,
                !empty($data['is_trending']) ? 1 : 0,
                $isSellable,
                $seo['seo_title'],
                $seo['meta_description'],
                $seo['focus_keyword'],
                $seo['h1'],
                $seo['alt_text'],
                $seo['canonical_url']
            ]);

            $newId = (int)$pdo->lastInsertId();
            if ($stockQuantity > 0) {
                recordStockMovement($pdo, $newId, 'Adjustment', $stockQuantity, null, 'Initial stock on product creation.');
            }
            logAuditRequired(
                $pdo,
                (int)$admin['id'],
                'create',
                'product',
                $newId,
                null,
                [
                    'name' => $data['name'],
                    'category_id' => (int)$data['category_id'],
                    'initial_stock' => $stockQuantity,
                    'is_sellable' => $isSellable
                ]
            );
            $response = ['status' => 'success', 'message' => 'Product created successfully', 'id' => $newId];
            completeIdempotency($pdo, (int)$admin['id'], 'products.create', $idempotencyKey, $response, 201);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Shopademia product creation failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not create product. Please try again.'], 500);
        }

        jsonResponse($response, 201);
        break;

    case 'PUT':
        // Update Product (Admin)
        $data = getRequestBody();
        $seo = validateProductSeoFields($data);
        $productId = parseInventoryInteger($data['id'] ?? null);
        if ($productId === null || $productId < 1) {
            jsonResponse(['error' => 'Missing product ID'], 422);
        }
        $oldStock = null;
        $newStock = null;
        $idempotencyKey = null;
        if (array_key_exists('stock_quantity', $data)) {
            $newStock = parseInventoryInteger($data['stock_quantity']);
            $expectedStock = parseInventoryInteger($data['expected_stock'] ?? null);
            if ($newStock === null || $newStock < 0 || $expectedStock === null || $expectedStock < 0) {
                jsonResponse(['error' => 'A non-negative stock quantity and expected_stock value are required.'], 422);
            }
            $data['expected_stock'] = $expectedStock;
            $idempotencyKey = requireIdempotencyKey();
        }

        if (array_key_exists('regular_price', $data) && (!is_numeric($data['regular_price']) || (float)$data['regular_price'] <= 0)) {
            jsonResponse(['error' => 'Regular price must be a positive number.'], 422);
        }
        if (isset($data['sale_price']) && ($data['sale_price'] === null || $data['sale_price'] === '') ) {
            $data['sale_price'] = null;
        }
        if (array_key_exists('sale_price', $data) && $data['sale_price'] !== null) {
            if (!is_numeric($data['sale_price']) || (float)$data['sale_price'] <= 0) {
                jsonResponse(['error' => 'Sale price must be positive and lower than the regular price.'], 422);
            }

            if (array_key_exists('regular_price', $data)) {
                $effectiveRegularPrice = (float)$data['regular_price'];
            } else {
                $regularPriceStmt = $pdo->prepare('SELECT regular_price FROM products WHERE id = ?');
                $regularPriceStmt->execute([$productId]);
                $effectiveRegularPrice = $regularPriceStmt->fetchColumn();
                if ($effectiveRegularPrice === false) {
                    jsonResponse(['error' => 'Product not found'], 404);
                }
            }

            if (!is_numeric($effectiveRegularPrice) || (float)$data['sale_price'] >= (float)$effectiveRegularPrice) {
                jsonResponse(['error' => 'Sale price must be lower than the regular price.'], 422);
            }
        }
        if (isset($data['category_id']) && (filter_var($data['category_id'], FILTER_VALIDATE_INT) === false || (int)$data['category_id'] < 1)) {
            jsonResponse(['error' => 'Category ID must be a valid positive integer.'], 422);
        }
        if (array_key_exists('category_id', $data)) {
            requireActiveProductCategory($pdo, (int)$data['category_id']);
        }
        if (array_key_exists('is_sellable', $data)) {
            if (!in_array($data['is_sellable'], [true, false, 0, 1, '0', '1'], true)) {
                jsonResponse(['error' => 'is_sellable must be a boolean value.'], 422);
            }
            $data['is_sellable'] = in_array($data['is_sellable'], [true, 1, '1'], true) ? 1 : 0;
        }
        $candidateName = $data['name'] ?? null;
        $willBeSellable = $data['is_sellable'] ?? null;
        if ($candidateName === null || $willBeSellable === null) {
            $currentProductStmt = $pdo->prepare('SELECT name, is_sellable FROM products WHERE id = ? AND is_archived = 0');
            $currentProductStmt->execute([$productId]);
            $currentProduct = $currentProductStmt->fetch();
            if ($candidateName === null && is_array($currentProduct)) {
                $candidateName = $currentProduct['name'];
            }
            if ($willBeSellable === null && is_array($currentProduct)) {
                $willBeSellable = (int)$currentProduct['is_sellable'];
            }
        }
        if ($willBeSellable === 1
            && isPlaceholderPublicProductName(is_string($candidateName) ? $candidateName : null)) {
            jsonResponse(['error' => 'Replace placeholder product text before publishing this product.'], 422);
        }

        $fields = [];
        $params = [];

        $allowed = ['name', 'category_id', 'regular_price', 'sale_price', 'stock_quantity', 'sku', 'short_desc', 'description', 'is_featured', 'is_trending', 'is_sellable'];
        foreach ($allowed as $f) {
            if (array_key_exists($f, $data)) {
                $fields[] = "$f = ?";
                if ($f === 'sale_price' && ($data[$f] === null || $data[$f] === '')) {
                    $params[] = null;
                } else {
                    $params[] = $data[$f];
                }
            }
        }

        foreach ($seo as $field => $value) {
            if (array_key_exists($field, $data)) {
                $fields[] = "$field = ?";
                $params[] = $value;
            }
        }

        if (array_key_exists('images', $data)) {
            $data['images'] = validateProductImagePaths($data);
            $fields[] = "images = ?";
            $params[] = json_encode($data['images'], JSON_THROW_ON_ERROR);
        }

        if (empty($fields)) {
            jsonResponse(['error' => 'No fields to update'], 400);
        }

        enforceApiRateLimit($pdo, 'product_mutation', 60, 900);
        $params[] = $productId;
        $sql = "UPDATE products SET " . implode(', ', $fields) . " WHERE id = ?";
        if ($newStock !== null) {
            try {
                $pdo->beginTransaction();
                reserveIdempotency($pdo, (int)$admin['id'], 'products.update', $idempotencyKey, ['id' => $productId, 'data' => $data]);
                $lock = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
                $stockStmt = $pdo->prepare('SELECT * FROM products WHERE id = ?' . $lock);
                $stockStmt->execute([$productId]);
                $oldProduct = $stockStmt->fetch();
                if (!$oldProduct) {
                    $pdo->rollBack();
                    jsonResponse(['error' => 'Product not found'], 404);
                }
                $oldStock = parseInventoryInteger((string)$oldProduct['stock_quantity']);
                if ($oldStock === null || $oldStock !== $data['expected_stock']) {
                    $pdo->rollBack();
                    jsonResponse(['error' => 'Stock changed since it was loaded. Refresh and try again.'], 409);
                }

                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                if ($oldStock !== $newStock) {
                    recordStockMovement($pdo, $productId, 'Adjustment', $newStock - $oldStock, null, 'Stock changed while editing product.');
                }
                $newValues = array_intersect_key($data, array_flip($allowed));
                logAuditRequired($pdo, (int)$admin['id'], 'update', 'product', $productId, $oldProduct, $newValues);
                $response = ['status' => 'success', 'message' => 'Product updated successfully'];
                completeIdempotency($pdo, (int)$admin['id'], 'products.update', $idempotencyKey, $response);
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                error_log('Shopademia product update failed: ' . $e->getMessage());
                jsonResponse(['error' => 'Could not update product. Please try again.'], 500);
            }
        } else {
            try {
                $pdo->beginTransaction();
                $lock = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
                $lookup = $pdo->prepare('SELECT * FROM products WHERE id = ?' . $lock);
                $lookup->execute([$productId]);
                $oldProduct = $lookup->fetch();
                if (!$oldProduct) {
                    $pdo->rollBack();
                    jsonResponse(['error' => 'Product not found'], 404);
                }
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                logAuditRequired(
                    $pdo,
                    (int)$admin['id'],
                    'update',
                    'product',
                    $productId,
                    $oldProduct,
                    array_intersect_key($data, array_flip($allowed))
                );
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                error_log('Shopademia product update failed: ' . $e->getMessage());
                jsonResponse(['error' => 'Could not update product. Please try again.'], 500);
            }
        }

        jsonResponse(['status' => 'success', 'message' => 'Product updated successfully']);
        break;

    case 'DELETE':
        enforceApiRateLimit($pdo, 'product_mutation', 60, 900);
        // Delete Product (Admin)
        $id = $_GET['id'] ?? null;
        if (!$id) {
            $body = getRequestBody();
            $id = $body['id'] ?? null;
        }

        if (!$id) {
            jsonResponse(['error' => 'Missing product ID'], 400);
        }

        $productId = parseInventoryInteger((string)$id);
        if ($productId === null || $productId < 1) {
            jsonResponse(['error' => 'A valid product ID is required.'], 422);
        }
        try {
            $pdo->beginTransaction();
            $lock = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
            $lookup = $pdo->prepare('SELECT name, is_archived FROM products WHERE id = ?' . $lock);
            $lookup->execute([$productId]);
            $product = $lookup->fetch();
            if ($product && (int)$product['is_archived'] === 0) {
                $stmt = $pdo->prepare("UPDATE products SET is_archived = 1 WHERE id = ? AND is_archived = 0");
                $stmt->execute([$productId]);
                logAuditRequired(
                    $pdo,
                    (int)$admin['id'],
                    'archive',
                    'product',
                    $productId,
                    ['name' => $product['name'], 'is_archived' => 0],
                    ['is_archived' => 1]
                );
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Shopademia product archive failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not archive product. Please try again.'], 500);
        }

        jsonResponse(['status' => 'success', 'message' => 'Product archived successfully']);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
