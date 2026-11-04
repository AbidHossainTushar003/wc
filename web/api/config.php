<?php
/**
 * Wonderful Collection - API Configuration
 */

header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

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

function getMailFromAddress(): string {
    $mailFrom = defined('MAIL_FROM') ? MAIL_FROM : getenv('MAIL_FROM');
    return is_string($mailFrom) ? trim($mailFrom) : '';
}

if (!defined('DB_HOST') && !defined('DB_NAME') && !defined('DB_USER') && !defined('DB_PASS')) {
    $envConfig = [
        'DB_HOST' => getenv('DB_HOST'),
        'DB_NAME' => getenv('DB_NAME'),
        'DB_USER' => getenv('DB_USER'),
        'DB_PASS' => getenv('DB_PASS')
    ];
    $hasEnvironmentConfig = !in_array(false, $envConfig, true)
        && !in_array('', $envConfig, true);

    if ($hasEnvironmentConfig) {
        foreach ($envConfig as $key => $value) {
            define($key, $value);
        }
        define('DEV_MODE', filter_var(getenv('DEV_MODE') ?: 'false', FILTER_VALIDATE_BOOLEAN));
    } else {
        $localConfig = __DIR__ . '/config.local.php';
        if (is_file($localConfig)) {
            require_once $localConfig;
        }
    }
}

$requiredConfig = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS', 'DEV_MODE'];
$missingConfig = array_filter($requiredConfig, static function ($key) {
    return !defined($key) || (is_string(constant($key)) && trim(constant($key)) === '');
});
if ($missingConfig) {
    error_log('Wonderful Collection API configuration is incomplete');
    jsonResponse(['error' => 'Application configuration is unavailable'], 500);
}
