<?php
/**
 * Shopademia - API Configuration
 */

$_SERVER['REQUEST_METHOD'] ??= 'GET';
$_SERVER['HTTP_ORIGIN'] ??= '';
$_SERVER['REMOTE_ADDR'] ??= '127.0.0.1';

header('Content-Type: application/json; charset=UTF-8');
header("Content-Security-Policy: default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'none'; style-src 'none'; img-src 'none'; connect-src 'none'");
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=(self)');
if (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== '' && strtolower((string)$_SERVER['HTTPS']) !== 'off') {
    header('Strict-Transport-Security: max-age=31536000');
}
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$allowedOrigin = 'https://shopademia.store';
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($requestOrigin === $allowedOrigin) {
    header('Access-Control-Allow-Origin: ' . $allowedOrigin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Idempotency-Key');
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

$localConfig = __DIR__ . '/config.local.php';
$isolatedTestModeValue = getenv('WC_ISOLATED_TEST_MODE');
$isolatedTestMode = $isolatedTestModeValue === false
    ? false
    : filter_var($isolatedTestModeValue, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
if ($isolatedTestMode === null) {
    error_log('Shopademia API isolated test configuration is invalid');
    jsonResponse(['error' => 'Application configuration is unavailable'], 500);
}

$databaseEnvironmentKeys = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS'];
$environmentConfig = [];
$hasAnyDatabaseEnvironment = false;
foreach ($databaseEnvironmentKeys as $key) {
    $value = getenv($key);
    $environmentConfig[$key] = $value;
    $hasAnyDatabaseEnvironment = $hasAnyDatabaseEnvironment || $value !== false;
}

if (is_file($localConfig) && !$isolatedTestMode && !$hasAnyDatabaseEnvironment) {
    require_once $localConfig;
    if (!defined('DB_PORT') && getenv('DB_PORT') === false) {
        define('DB_PORT', 3306);
    }
}

$hasDatabaseConstants = defined('DB_HOST')
    || defined('DB_PORT')
    || defined('DB_NAME')
    || defined('DB_USER')
    || defined('DB_PASS');

$developmentModeValue = getenv('DEV_MODE');
$developmentMode = $developmentModeValue === false || $developmentModeValue === ''
    ? false
    : filter_var($developmentModeValue, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
if ($developmentMode === null) {
    error_log('Shopademia API development mode configuration is invalid');
    jsonResponse(['error' => 'Application configuration is unavailable'], 500);
}

if (!$hasDatabaseConstants && $hasAnyDatabaseEnvironment) {
    foreach ($environmentConfig as $key => $value) {
        if (!is_string($value) || trim($value) === '') {
            error_log('Shopademia API environment configuration is incomplete');
            jsonResponse(['error' => 'Application configuration is unavailable'], 500);
        }
        define($key, $value);
    }
    define('DEV_MODE', $developmentMode);
} elseif (!$hasDatabaseConstants && $developmentMode) {
    $localConfig = __DIR__ . '/config.local.php';
    if (is_file($localConfig)) {
        require_once $localConfig;
    }
    if (!defined('DEV_MODE')) {
        define('DEV_MODE', true);
    }
} elseif (!defined('DEV_MODE')) {
    define('DEV_MODE', false);
}

if (!defined('ADMIN_TOTP_SECRET')) {
    $totpSecret = getenv('ADMIN_TOTP_SECRET');
    if (is_string($totpSecret) && $totpSecret !== '') {
        define('ADMIN_TOTP_SECRET', $totpSecret);
    }
}

$databasePort = defined('DB_PORT') ? DB_PORT : getenv('DB_PORT');
$databasePortString = is_int($databasePort)
    ? (string)$databasePort
    : (is_string($databasePort) ? $databasePort : '');
$validatedDatabasePort = preg_match('/\A[0-9]+\z/', $databasePortString)
    ? filter_var($databasePortString, FILTER_VALIDATE_INT, [
        'options' => ['min_range' => 1, 'max_range' => 65535]
    ])
    : false;
if ($validatedDatabasePort === false) {
    error_log('Shopademia API database port configuration is invalid');
    jsonResponse(['error' => 'Application configuration is unavailable'], 500);
}
if (!defined('DB_PORT')) {
    define('DB_PORT', $validatedDatabasePort);
}

$requiredConfig = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS'];
$missingConfig = array_filter($requiredConfig, static function ($key) {
    if ($key === 'DB_PASS') {
        return !defined($key) || !is_string(constant($key));
    }
    return !defined($key)
        || !is_string(constant($key))
        || trim(constant($key)) === '';
});

if ($missingConfig || !defined('DEV_MODE') || !is_bool(DEV_MODE)) {
    error_log('Shopademia API configuration is incomplete');
    jsonResponse(['error' => 'Application configuration is unavailable'], 500);
}

define('WC_ISOLATED_TEST_MODE', $isolatedTestMode);

if (WC_ISOLATED_TEST_MODE) {
    $expectedTestPort = getenv('WC_TEST_DB_PORT');
    $testDatabaseName = getenv('WC_TEST_DB_NAME');
    $testDataDirectoryMarker = getenv('WC_TEST_DATADIR_MARKER');
    $validatedExpectedTestPort = is_string($expectedTestPort)
        ? filter_var($expectedTestPort, FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1, 'max_range' => 65535]
        ])
        : false;

    if (DB_HOST !== '127.0.0.1'
        || $validatedExpectedTestPort === false
        || $validatedExpectedTestPort !== (int)DB_PORT
        || in_array((int)DB_PORT, [3306, 3307, 33060], true)
        || !is_string($testDatabaseName)
        || $testDatabaseName !== DB_NAME
        || !preg_match('/\Awc_test_[a-f0-9]{16,32}(?:_test)?\z/', DB_NAME)
        || !is_string($testDataDirectoryMarker)
        || !preg_match('/\A[A-Za-z0-9_-]{12,64}\z/', $testDataDirectoryMarker)) {
        error_log('Shopademia API isolated test target is invalid');
        jsonResponse(['error' => 'Application configuration is unavailable'], 500);
    }

    define('WC_TEST_DATADIR_MARKER', $testDataDirectoryMarker);
}
