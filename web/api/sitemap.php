<?php
require_once __DIR__ . '/db.php';

$pdo = Database::getConnection();
header('Content-Type: application/xml; charset=UTF-8');
header('Cache-Control: public, max-age=300');

$baseUrl = 'https://wonderfulcollection.store';
$paths = [
    '/',
    '/about.html',
    '/shop.html',
    '/shipping-policy.html',
    '/refund-policy.html',
    '/privacy.html',
    '/terms.html',
    '/faq.html',
    '/contact.html'
];

try {
    $productStmt = $pdo->query('SELECT id FROM products ORDER BY id');
    foreach ($productStmt->fetchAll(PDO::FETCH_COLUMN) as $productId) {
        $paths[] = '/product.html?id=' . rawurlencode((string)(int)$productId);
    }

    $categoryStmt = $pdo->query('SELECT slug FROM categories ORDER BY id');
    foreach ($categoryStmt->fetchAll(PDO::FETCH_COLUMN) as $slug) {
        $paths[] = '/category.html?cat=' . rawurlencode((string)$slug);
    }
} catch (PDOException $e) {
    error_log('Wonderful Collection sitemap query failed.');
    http_response_code(500);
    header('Content-Type: text/plain; charset=UTF-8');
    echo 'Sitemap is temporarily unavailable.';
    exit;
}

echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
foreach ($paths as $path) {
    $location = htmlspecialchars($baseUrl . $path, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    echo "  <url><loc>{$location}</loc></url>\n";
}
echo "</urlset>\n";
