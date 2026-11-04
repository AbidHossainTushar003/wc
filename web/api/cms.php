<?php
/**
 * CMS Pages & Website Setup API Endpoint (Sprint 6)
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/audit.php';

$pdo = Database::getConnection();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET' && isset($_GET['slug'])) {
    $stmt = $pdo->prepare("SELECT * FROM cms_pages WHERE slug = ?");
    $stmt->execute([$_GET['slug']]);
    $page = $stmt->fetch();
    if (!$page) {
        jsonResponse(['error' => 'Page not found'], 404);
    }
    jsonResponse(['status' => 'success', 'data' => $page]);
}

$admin = requireAdminToken($pdo);
switch ($method) {
    case 'GET':
        $stmt = $pdo->query("SELECT * FROM cms_pages ORDER BY id DESC");
        jsonResponse(['status' => 'success', 'data' => $stmt->fetchAll()]);
        break;

    case 'POST':
        $data = getRequestBody();
        $slug = trim($data['slug'] ?? '');
        $title = trim($data['title'] ?? '');
        $content = $data['content'] ?? '';
        $metaTitle = trim($data['meta_title'] ?? '');
        $metaDesc = trim($data['meta_description'] ?? '');

        if ($slug === '' || $title === '') {
            jsonResponse(['error' => 'Slug and title are required.'], 422);
        }

        $stmt = $pdo->prepare("INSERT INTO cms_pages (slug, title, content, meta_title, meta_description) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE title = VALUES(title), content = VALUES(content), meta_title = VALUES(meta_title), meta_description = VALUES(meta_description)");
        $stmt->execute([$slug, $title, $content, $metaTitle, $metaDesc]);

        logAudit($pdo, (int)$admin['id'], 'upsert', 'cms_page', null, null, $data);
        jsonResponse(['status' => 'success', 'message' => 'CMS page saved successfully.']);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
