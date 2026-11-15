<?php
/**
 * Settings API Endpoint
 * Dedicated backend for Screen 9 (Settings) and public store configuration
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/audit.php';
require_once __DIR__ . '/tracking-snippets.php';

function settingsArrayIsList(array $value): bool {
    return $value === [] || array_keys($value) === range(0, count($value) - 1);
}

function settingsTextLength(string $value): int {
    $length = preg_match_all('/./us', $value);
    return $length === false ? PHP_INT_MAX : $length;
}

function settingsIsSafeHomepageUrl(string $value): bool {
    $url = trim($value);
    if ($url === '' || strlen($url) > 500 || preg_match('/[\x00-\x20\x7f\\\\]/', $url) === 1) {
        return false;
    }
    if (preg_match('/\Ahttps?:\/\/\S+\z/i', $url) === 1) {
        return filter_var($url, FILTER_VALIDATE_URL) !== false
            && in_array(strtolower((string)parse_url($url, PHP_URL_SCHEME)), ['http', 'https'], true);
    }
    return preg_match('/\A[a-z][a-z0-9+.-]*:/i', $url) !== 1 && strncmp($url, '//', 2) !== 0;
}

$pdo = Database::getConnection();
$method = $_SERVER['REQUEST_METHOD'];
if (!($method === 'GET' && ($_GET['public'] ?? '') === '1')) {
    $admin = requireAdminToken($pdo);
    requireAdminPermission($admin, 'settings', $method === 'GET' ? 'read' : 'update');
}

switch ($method) {
    case 'GET':
        if (($_GET['public'] ?? '') === '1') {
            $stmt = $pdo->prepare("
                SELECT key_name, value_data
                FROM settings
                WHERE key_name IN (
                    'announcement_text',
                    'delivery_fee_dhaka',
                    'delivery_fee_outside_dhaka',
                    'free_delivery_min_amount',
                    'bkash_number',
                    'nagad_number',
                    'rocket_number',
                    'homepage_hero_slides',
                    'primary_nav_links',
                    'social_heading',
                    'social_instagram_label',
                    'social_instagram_url',
                    'social_x_label',
                    'social_x_url',
                    'social_facebook_label',
                    'social_facebook_url',
                    'homepage_promo_eyebrow',
                    'homepage_promo_title',
                    'homepage_promo_description',
                    'homepage_promo_button_text',
                    'homepage_promo_link',
                    'homepage_promo_image'
                )
            ");
            $stmt->execute();
            $settings = [];
            foreach ($stmt->fetchAll() as $row) {
                $settings[$row['key_name']] = $row['value_data'];
            }
            jsonResponse([
                'status' => 'success',
                'data' => [
                    'announcement_text' => $settings['announcement_text'] ?? 'Delivery availability and estimates are shown at checkout.',
                    'delivery_fee_dhaka' => $settings['delivery_fee_dhaka'] ?? '80',
                    'delivery_fee_outside_dhaka' => $settings['delivery_fee_outside_dhaka'] ?? '130',
                    'free_delivery_min_amount' => $settings['free_delivery_min_amount'] ?? '2000',
                    'bkash_number' => trim((string)($settings['bkash_number'] ?? '')),
                    'nagad_number' => trim((string)($settings['nagad_number'] ?? '')),
                    'rocket_number' => trim((string)($settings['rocket_number'] ?? '')),
                    'homepage_hero_slides' => $settings['homepage_hero_slides'] ?? '',
                    'primary_nav_links' => $settings['primary_nav_links'] ?? '["home","shop","category:mens-fashion","category:womens-fashion","contact"]',
                    'social_heading' => $settings['social_heading'] ?? 'Follow us',
                    'social_instagram_label' => $settings['social_instagram_label'] ?? 'Instagram · ShopademiaBD',
                    'social_instagram_url' => $settings['social_instagram_url'] ?? 'https://www.instagram.com/ShopademiaBD',
                    'social_x_label' => $settings['social_x_label'] ?? 'X · SHOPADEMIA',
                    'social_x_url' => $settings['social_x_url'] ?? 'https://x.com/SHOPADEMIA',
                    'social_facebook_label' => $settings['social_facebook_label'] ?? 'Facebook · SHOPADEMIA',
                    'social_facebook_url' => $settings['social_facebook_url'] ?? 'https://www.facebook.com/SHOPADEMIA',
                    'homepage_promo_eyebrow' => $settings['homepage_promo_eyebrow'] ?? 'Explore the collection',
                    'homepage_promo_title' => $settings['homepage_promo_title'] ?? 'Discover Our Latest Collection',
                    'homepage_promo_description' => $settings['homepage_promo_description'] ?? 'Explore quality products selected for everyday living.',
                    'homepage_promo_button_text' => $settings['homepage_promo_button_text'] ?? 'Shop Collection →',
                    'homepage_promo_link' => $settings['homepage_promo_link'] ?? 'shop.html',
                    'homepage_promo_image' => $settings['homepage_promo_image'] ?? ''
                ]
            ]);
        }

        $stmt = $pdo->query("SELECT key_name, value_data FROM settings");
        $rows = $stmt->fetchAll();
        $settings = [];
        foreach ($rows as $r) {
            if (trackingIsReservedSettingKey((string)$r['key_name'])) {
                continue;
            }
            $settings[$r['key_name']] = $r['value_data'];
        }

        jsonResponse(['status' => 'success', 'data' => $settings]);
        break;

    case 'POST':
    case 'PUT':
        $data = getRequestBody();
        if (empty($data)) {
            jsonResponse(['error' => 'No settings provided to update'], 400);
        }
        foreach (array_keys($data) as $settingKey) {
            if (is_string($settingKey) && trackingIsReservedSettingKey($settingKey)) {
                jsonResponse(['error' => 'Tracking settings must be changed through the restricted tracking settings endpoint.'], 403);
            }
        }
        $homepagePromoKeys = [
            'homepage_promo_eyebrow', 'homepage_promo_title', 'homepage_promo_description',
            'homepage_promo_button_text', 'homepage_promo_link', 'homepage_promo_image'
        ];
        if (array_intersect($homepagePromoKeys, array_keys($data)) !== []
            && ($admin['role'] ?? '') !== 'Super Admin') {
            jsonResponse(['error' => 'Only a Super Admin can edit the homepage banner.'], 403);
        }
        if (array_key_exists('primary_nav_links', $data)) {
            if (($admin['role'] ?? '') !== 'Super Admin') {
                jsonResponse(['error' => 'Only a Super Admin can edit the primary navigation.'], 403);
            }
            $links = $data['primary_nav_links'];
            $pageIds = [
                'home', 'shop', 'search', 'offers', 'track-order', 'orders', 'contact', 'about',
                'faq', 'shipping-policy', 'refund-policy', 'privacy', 'terms', 'login', 'profile',
                'cookie-policy', 'forgot-password', 'reset-password', 'verify-email',
                'resend-verification', 'wishlist', 'cart', 'checkout', 'order-success'
            ];
            if (!is_array($links) || !settingsArrayIsList($links) || count($links) > 5) {
                jsonResponse(['error' => 'Choose up to five unique primary navigation links.'], 422);
            }
            foreach ($links as $link) {
                if (!is_string($link)) {
                    jsonResponse(['error' => 'Primary navigation links must be valid page or category IDs.'], 422);
                }
            }
            if (count(array_unique($links)) !== count($links)) {
                jsonResponse(['error' => 'Choose up to five unique primary navigation links.'], 422);
            }
            $categorySlugs = [];
            foreach ($links as $link) {
                if (in_array($link, $pageIds, true)) continue;
                if (preg_match('/\Acategory:([a-z0-9-]{1,150})\z/', $link, $matches) === 1) {
                    $categorySlugs[] = $matches[1];
                    continue;
                }
                jsonResponse(['error' => 'A selected primary navigation link is invalid.'], 422);
            }
            if ($categorySlugs !== []) {
                $placeholders = implode(',', array_fill(0, count($categorySlugs), '?'));
                $lookup = $pdo->prepare('SELECT COUNT(*) FROM categories WHERE slug IN (' . $placeholders . ') AND is_archived = 0');
                $lookup->execute(array_values(array_unique($categorySlugs)));
                if ((int)$lookup->fetchColumn() !== count(array_unique($categorySlugs))) {
                    jsonResponse(['error' => 'A selected navigation category is unavailable.'], 422);
                }
            }
            $data['primary_nav_links'] = json_encode($links, JSON_THROW_ON_ERROR);
        }
        if (array_key_exists('homepage_hero_slides', $data)) {
            if (($admin['role'] ?? '') !== 'Super Admin') {
                jsonResponse(['error' => 'Only a Super Admin can edit the homepage carousel.'], 403);
            }
            $slides = $data['homepage_hero_slides'];
            if (!is_array($slides) || !settingsArrayIsList($slides) || count($slides) < 1 || count($slides) > 10) {
                jsonResponse(['error' => 'The homepage carousel must contain between 1 and 10 slides.'], 422);
            }

            $productIds = [];
            $categoryIds = [];
            foreach ($slides as $index => $slide) {
                if (!is_array($slide) || !is_string($slide['eyebrow'] ?? null)
                    || settingsTextLength($slide['eyebrow']) > 80
                    || !is_string($slide['title'] ?? null) || trim($slide['title']) === ''
                    || settingsTextLength($slide['title']) > 120
                    || !is_string($slide['description'] ?? null) || settingsTextLength($slide['description']) > 240
                    || !in_array($slide['mode'] ?? null, ['products', 'categories', 'both'], true)
                    || !is_string($slide['button_text'] ?? null) || trim($slide['button_text']) === ''
                    || settingsTextLength($slide['button_text']) > 40
                    || !in_array($slide['button_target'] ?? null, ['shop', 'product', 'category', 'url', 'track'], true)
                    || !is_string($slide['button_url'] ?? '')
                    || settingsTextLength($slide['button_url'] ?? '') > 500
                    || !is_bool($slide['enabled'] ?? null)
                    || !is_array($slide['product_ids'] ?? null) || !settingsArrayIsList($slide['product_ids'])
                    || !is_array($slide['category_ids'] ?? null) || !settingsArrayIsList($slide['category_ids'])) {
                    jsonResponse(['error' => 'Homepage slide ' . ($index + 1) . ' has invalid fields.'], 422);
                }
                foreach (['product_ids', 'category_ids'] as $field) {
                    $ids = $slide[$field];
                    if (count($ids) > 3) {
                        jsonResponse(['error' => 'Each homepage slide can show at most 3 products and 3 categories.'], 422);
                    }
                    foreach ($ids as $id) {
                        if (!is_int($id) || $id < 1) {
                            jsonResponse(['error' => 'Homepage slide item IDs must be positive integers.'], 422);
                        }
                        if ($field === 'product_ids') {
                            $productIds[] = $id;
                        } else {
                            $categoryIds[] = $id;
                        }
                    }
                    if (count(array_unique($ids)) !== count($ids)) {
                        jsonResponse(['error' => 'Homepage slide item selections must not contain duplicates.'], 422);
                    }
                }
                $mode = $slide['mode'];
                if (($mode !== 'categories' && count($slide['product_ids']) < 1)
                    || ($mode !== 'products' && count($slide['category_ids']) < 1)
                    || ($slide['button_target'] === 'product'
                        && ($mode === 'categories' || count($slide['product_ids']) < 1))
                    || ($slide['button_target'] === 'category'
                        && ($mode === 'products' || count($slide['category_ids']) < 1))
                    || ($slide['button_target'] === 'url'
                        && !settingsIsSafeHomepageUrl($slide['button_url']))) {
                    jsonResponse(['error' => 'Homepage slide ' . ($index + 1) . ' is missing its required products or categories.'], 422);
                }
            }

            foreach ([
                ['ids' => array_values(array_unique($productIds)), 'table' => 'products', 'filter' => 'is_archived = 0 AND is_sellable = 1'],
                ['ids' => array_values(array_unique($categoryIds)), 'table' => 'categories', 'filter' => 'is_archived = 0']
            ] as $selection) {
                if ($selection['ids'] === []) {
                    continue;
                }
                $placeholders = implode(',', array_fill(0, count($selection['ids']), '?'));
                $lookup = $pdo->prepare(
                    'SELECT COUNT(*) FROM ' . $selection['table']
                    . ' WHERE id IN (' . $placeholders . ') AND ' . $selection['filter']
                );
                $lookup->execute($selection['ids']);
                if ((int)$lookup->fetchColumn() !== count($selection['ids'])) {
                    jsonResponse(['error' => 'A selected homepage product or category is no longer available.'], 422);
                }
            }
            $data['homepage_hero_slides'] = json_encode($slides, JSON_THROW_ON_ERROR);
        }
        enforceApiRateLimit($pdo, 'settings_mutation', 30, 900);
        if (array_key_exists('delivery_fee_local_dhaka', $data)) {
            jsonResponse(['error' => 'The separate Local Dhaka delivery fee has been retired. Update the Inside Dhaka fee instead.'], 422);
        }
        $feeKeys = ['delivery_fee_dhaka', 'delivery_fee_outside_dhaka'];
        foreach ($feeKeys as $feeKey) {
            if (array_key_exists($feeKey, $data)) {
                $val = filter_var($data[$feeKey], FILTER_VALIDATE_FLOAT);
                if ($val === false || $val < 0 || $val > 50000) {
                    jsonResponse(['error' => "$feeKey must be a valid non-negative number up to 50,000."], 422);
                }
            }
        }
        if (array_key_exists('announcement_text', $data)) {
            $announcement = $data['announcement_text'];
            if (!is_string($announcement) || preg_match('/\A.{0,240}\z/usD', $announcement) !== 1) {
                jsonResponse(['error' => 'Announcement text must be valid text no longer than 240 characters.'], 422);
            }
            $data['announcement_text'] = trim($announcement);
        }
        $textLimits = [
            'social_heading' => 40,
            'social_instagram_label' => 80,
            'social_x_label' => 80,
            'social_facebook_label' => 80,
            'homepage_promo_eyebrow' => 80,
            'homepage_promo_title' => 120,
            'homepage_promo_description' => 240,
            'homepage_promo_button_text' => 40
        ];
        foreach ($textLimits as $field => $limit) {
            if (!array_key_exists($field, $data)) continue;
            if (!is_string($data[$field]) || settingsTextLength($data[$field]) > $limit
                || preg_match('/[\x00-\x1F\x7F]/', $data[$field])) {
                jsonResponse(['error' => $field . ' must be valid text up to ' . $limit . ' characters.'], 422);
            }
            $data[$field] = trim($data[$field]);
        }
        foreach (['social_instagram_url', 'social_x_url', 'social_facebook_url'] as $field) {
            if (!array_key_exists($field, $data)) continue;
            $url = trim(is_string($data[$field]) ? $data[$field] : '');
            if (strlen($url) > 500 || ($url !== '' && (
                filter_var($url, FILTER_VALIDATE_URL) === false
                || strtolower((string)parse_url($url, PHP_URL_SCHEME)) !== 'https'
            ))) {
                jsonResponse(['error' => $field . ' must be a valid HTTPS social profile URL.'], 422);
            }
            $data[$field] = $url;
        }
        if (array_key_exists('homepage_promo_link', $data)) {
            $link = is_string($data['homepage_promo_link']) ? trim($data['homepage_promo_link']) : '';
            if ($link !== '' && !settingsIsSafeHomepageUrl($link)) {
                jsonResponse(['error' => 'Homepage banner link must be a safe HTTP(S) or store-relative URL.'], 422);
            }
            $data['homepage_promo_link'] = $link;
        }
        if (array_key_exists('homepage_promo_image', $data)) {
            $image = is_string($data['homepage_promo_image']) ? trim($data['homepage_promo_image']) : '';
            if ($image !== '' && (
                preg_match('/\Aassets\/hero\/[a-f0-9]{32}\.jpg\z/i', $image) !== 1
                || !is_file(__DIR__ . '/../' . $image)
            )) {
                jsonResponse(['error' => 'Homepage banner image must be uploaded through the image processor.'], 422);
            }
            $data['homepage_promo_image'] = $image;
        }
        foreach (['bkash_number', 'nagad_number', 'rocket_number'] as $paymentSetting) {
            if (array_key_exists($paymentSetting, $data)) {
                $number = $data[$paymentSetting];
                if (!is_string($number) || strlen($number) > 40
                    || preg_match('/[\x00-\x1F\x7F]/', $number)) {
                    jsonResponse(['error' => 'Payment account values must be valid text no longer than 40 characters.'], 422);
                }
                $data[$paymentSetting] = trim($number);
            }
        }

        $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        $sql = $driver === 'sqlite'
            ? 'INSERT OR REPLACE INTO settings (key_name, value_data) VALUES (?, ?)'
            : 'INSERT INTO settings (key_name, value_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE value_data = VALUES(value_data)';
        $keys = array_map('strval', array_keys($data));
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare($sql);
            foreach ($data as $key => $val) {
                $encodedValue = is_scalar($val) ? (string)$val : json_encode($val);
                if ($encodedValue === false) {
                    throw new RuntimeException('Setting value could not be encoded.');
                }
                $stmt->execute([$key, $encodedValue]);
            }
            logAuditRequired($pdo, (int)$admin['id'], 'update', 'settings', null, null, ['keys' => $keys]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Shopademia settings update failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not update settings. Please try again.'], 500);
        }

        jsonResponse(['status' => 'success', 'message' => 'Settings updated successfully']);
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
