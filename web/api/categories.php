<?php
/**
 * Categories API Endpoint
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/audit.php';

function categoryImageIsAllowed(string $image): bool {
    if ($image === 'assets/category-placeholder.svg') {
        return true;
    }
    return preg_match('/\Aassets\/categories\/[a-f0-9]{32}\.jpg\z/i', $image) === 1
        && is_file(__DIR__ . '/../' . $image);
}

$pdo = Database::getConnection();
$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'GET') {
    $admin = requireAdminToken($pdo);
    $action = ['POST' => 'create', 'PUT' => 'update', 'DELETE' => 'archive'][$method] ?? null;
    if ($action === null) {
        jsonResponse(['error' => 'Method not allowed'], 405);
    }
    requireAdminPermission($admin, 'categories', $action);
}

switch ($method) {
    case 'GET':
        $stmt = $pdo->query("
            SELECT c.*, COUNT(p.id) AS product_count 
            FROM categories c 
            LEFT JOIN products p ON c.id = p.category_id AND p.is_archived = 0 AND p.is_sellable = 1
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
        $categoryImage = $data['image'] ?? 'assets/category-placeholder.svg';
        if (!is_string($categoryImage) || !categoryImageIsAllowed($categoryImage)) {
            jsonResponse(['error' => 'Upload the category image through the image processor.'], 422);
        }

        enforceApiRateLimit($pdo, 'category_mutation', 60, 900);
        $slug = !empty($data['slug']) ? $data['slug'] : strtolower(trim(preg_replace('/[^A-Za-z0-9-]+/', '-', $data['name']), '-'));
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare("INSERT INTO categories (name, slug, description, image) VALUES (?, ?, ?, ?)");
            $stmt->execute([
                $data['name'],
                $slug,
                $data['description'] ?? '',
                $categoryImage
            ]);
            $categoryId = (int)$pdo->lastInsertId();
            logAuditRequired($pdo, (int)$admin['id'], 'create', 'category', $categoryId, null, ['name' => $data['name'], 'slug' => $slug]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Shopademia category creation failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not create category. Please try again.'], 500);
        }

        jsonResponse(['status' => 'success', 'message' => 'Category created', 'id' => $categoryId], 201);
        break;

    case 'PUT':
        $data = getRequestBody();
        if (empty($data['id']) || empty($data['name'])) {
            jsonResponse(['error' => 'Category ID and name are required'], 422);
        }

        $categoryId = filter_var($data['id'], FILTER_VALIDATE_INT);
        if ($categoryId === false || $categoryId < 1) {
            jsonResponse(['error' => 'A valid category ID is required.'], 422);
        }
        if (array_key_exists('image', $data)
            && (!is_string($data['image']) || !categoryImageIsAllowed($data['image']))) {
            jsonResponse(['error' => 'Upload the category image through the image processor.'], 422);
        }
        enforceApiRateLimit($pdo, 'category_mutation', 60, 900);
        try {
            $pdo->beginTransaction();
            $lock = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
            $lookup = $pdo->prepare('SELECT name, slug, description, image FROM categories WHERE id = ?' . $lock);
            $lookup->execute([$categoryId]);
            $oldCategory = $lookup->fetch();
            if (!$oldCategory) {
                $pdo->rollBack();
                jsonResponse(['error' => 'Category not found.'], 404);
            }
            $newCategory = [
                'name' => $data['name'],
                'slug' => !empty($data['slug'])
                    ? $data['slug']
                    : strtolower(trim(preg_replace('/[^A-Za-z0-9-]+/', '-', $data['name']), '-')),
                'description' => $data['description'] ?? '',
                'image' => $data['image'] ?? ''
            ];
            $stmt = $pdo->prepare("UPDATE categories SET name = ?, slug = ?, description = ?, image = ? WHERE id = ?");
            $stmt->execute([
                $newCategory['name'],
                $newCategory['slug'],
                $newCategory['description'],
                $newCategory['image'],
                $categoryId
            ]);
            logAuditRequired($pdo, (int)$admin['id'], 'update', 'category', $categoryId, $oldCategory, $newCategory);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Shopademia category update failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not update category. Please try again.'], 500);
        }

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

        $categoryId = filter_var($id, FILTER_VALIDATE_INT);
        if ($categoryId === false || $categoryId < 1) {
            jsonResponse(['error' => 'A valid category ID is required.'], 422);
        }
        enforceApiRateLimit($pdo, 'category_mutation', 60, 900);
        try {
            $pdo->beginTransaction();
            $lock = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
            $lookup = $pdo->prepare('SELECT name, is_archived FROM categories WHERE id = ?' . $lock);
            $lookup->execute([$categoryId]);
            $category = $lookup->fetch();
            if ($category && (int)$category['is_archived'] === 0) {
                $stmt = $pdo->prepare("UPDATE categories SET is_archived = 1 WHERE id = ? AND is_archived = 0");
                $stmt->execute([$categoryId]);
                logAuditRequired(
                    $pdo,
                    (int)$admin['id'],
                    'archive',
                    'category',
                    $categoryId,
                    ['name' => $category['name'], 'is_archived' => 0],
                    ['is_archived' => 1]
                );
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Shopademia category archive failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not archive category. Please try again.'], 500);
        }

        jsonResponse(['status' => 'success', 'message' => 'Category archived']);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
