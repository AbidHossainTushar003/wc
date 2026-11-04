<?php
/**
 * Wonderful Collection - API Configuration
 */

header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');

$allowedOrigin = 'https://wonderfulcollection.store';
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($requestOrigin === $allowedOrigin) {
    header('Access-Control-Allow-Origin: ' . $allowedOrigin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
}

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    if ($requestOrigin !== '' && $requestOrigin !== $allowedOrigin) {
        jsonResponse(['error' => 'Origin not allowed'], 403);
    }
    http_response_code(204);
    exit;
}

function getRequestBody() {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return $_POST;
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function cleanInput($data) {
    if (is_array($data)) {
        return array_map('cleanInput', $data);
    }
    return htmlspecialchars(strip_tags(trim((string)$data)), ENT_QUOTES, 'UTF-8');
}

$localConfig = __DIR__ . '/config.local.php';
if (!is_file($localConfig)) {
    error_log('Wonderful Collection API is missing api/config.local.php');
    jsonResponse(['error' => 'Application configuration is unavailable'], 500);
}
require_once $localConfig;

if (!defined('DB_HOST') || !defined('DB_NAME') || !defined('DB_USER') || !defined('DB_PASS') || !defined('DEV_MODE')) {
    error_log('Wonderful Collection API configuration is incomplete');
    jsonResponse(['error' => 'Application configuration is unavailable'], 500);
}
