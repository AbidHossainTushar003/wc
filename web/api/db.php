<?php
/**
 * Wonderful Collection - Database Connection Provider
 * MySQL connection provider with an explicit development-only SQLite fallback.
 */

require_once __DIR__ . '/config.php';

class Database {
    private static ?PDO $instance = null;

    public static function getConnection(): PDO {
        if (self::$instance !== null) {
            return self::$instance;
        }

        try {
            $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4";
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_TIMEOUT => 2
            ];
            self::$instance = new PDO($dsn, DB_USER, DB_PASS, $options);
            return self::$instance;
        } catch (PDOException $e) {
            if (!DEV_MODE) {
                error_log('Wonderful Collection MySQL connection failed: ' . $e->getMessage());
                jsonResponse(['error' => 'Database connection failed'], 500);
            }

            try {
                $sqlitePath = __DIR__ . '/../data.sqlite';
                $isNew = !file_exists($sqlitePath);
                self::$instance = new PDO("sqlite:" . $sqlitePath);
                self::$instance->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                self::$instance->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

                if ($isNew) {
                    self::initSQLiteDatabase(self::$instance);
                }
                self::ensureSQLiteColumn(self::$instance, 'categories', 'is_archived', 'INTEGER NOT NULL DEFAULT 0');
                self::ensureSQLiteColumn(self::$instance, 'products', 'is_archived', 'INTEGER NOT NULL DEFAULT 0');
                self::ensureSQLiteColumn(self::$instance, 'admins', 'password_change_required', 'INTEGER NOT NULL DEFAULT 1');
                self::ensureSQLiteColumn(self::$instance, 'admins', 'last_totp_counter', 'INTEGER DEFAULT NULL');
                self::$instance->exec("
                    CREATE TABLE IF NOT EXISTS admin_tokens (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        token_hash TEXT UNIQUE NOT NULL,
                        admin_id INTEGER NOT NULL,
                        expires_at DATETIME NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE INDEX IF NOT EXISTS idx_admin_tokens_admin_id ON admin_tokens (admin_id);
                    CREATE TABLE IF NOT EXISTS customer_tokens (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        token_hash TEXT UNIQUE NOT NULL,
                        customer_id INTEGER NOT NULL,
                        expires_at DATETIME NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE INDEX IF NOT EXISTS idx_customer_tokens_customer_id ON customer_tokens (customer_id);
                    CREATE TABLE IF NOT EXISTS login_attempts (
                        username_hash TEXT NOT NULL,
                        ip_hash TEXT NOT NULL,
                        attempt_count INTEGER NOT NULL,
                        window_started_at DATETIME NOT NULL,
                        locked_until DATETIME,
                        PRIMARY KEY (username_hash, ip_hash)
                    );
                    CREATE TABLE IF NOT EXISTS password_reset_tokens (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        customer_id INTEGER NOT NULL,
                        token_hash TEXT UNIQUE NOT NULL,
                        expires_at DATETIME NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE INDEX IF NOT EXISTS idx_password_reset_customer_id ON password_reset_tokens (customer_id);
                    CREATE TABLE IF NOT EXISTS customer_email_verifications (
                        customer_id INTEGER PRIMARY KEY,
                        token_hash TEXT UNIQUE,
                        expires_at DATETIME,
                        verified_at DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );
                    INSERT OR IGNORE INTO customer_email_verifications (customer_id, verified_at)
                    SELECT id, CURRENT_TIMESTAMP FROM customers;
                ");
            } catch (PDOException $sqliteError) {
                error_log('Wonderful Collection development SQLite connection failed: ' . $sqliteError->getMessage());
                jsonResponse(['error' => 'Database connection failed'], 500);
            }
            return self::$instance;
        }
    }

    private static function initSQLiteDatabase(PDO $pdo): void {
        // Create tables in SQLite
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key_name TEXT UNIQUE NOT NULL,
                value_data TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                slug TEXT UNIQUE NOT NULL,
                description TEXT,
                image TEXT,
                is_archived INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                slug TEXT UNIQUE NOT NULL,
                category_id INTEGER NOT NULL,
                regular_price REAL NOT NULL,
                sale_price REAL,
                stock_quantity INTEGER NOT NULL DEFAULT 10,
                sku TEXT UNIQUE,
                short_desc TEXT,
                description TEXT,
                images TEXT NOT NULL,
                is_featured INTEGER DEFAULT 0,
                is_trending INTEGER DEFAULT 0,
                is_archived INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                phone TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                address TEXT,
                area TEXT DEFAULT 'Dhaka',
                city TEXT DEFAULT 'Dhaka',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS customer_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token_hash TEXT UNIQUE NOT NULL,
                customer_id INTEGER NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_customer_tokens_customer_id ON customer_tokens (customer_id);
            CREATE TABLE IF NOT EXISTS customer_email_verifications (
                customer_id INTEGER PRIMARY KEY,
                token_hash TEXT UNIQUE,
                expires_at DATETIME,
                verified_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_number TEXT UNIQUE NOT NULL,
                customer_id INTEGER,
                customer_name TEXT NOT NULL,
                customer_phone TEXT NOT NULL,
                customer_email TEXT,
                delivery_address TEXT NOT NULL,
                delivery_area TEXT NOT NULL,
                delivery_fee REAL NOT NULL DEFAULT 60.00,
                subtotal REAL NOT NULL,
                discount REAL NOT NULL DEFAULT 0.00,
                total REAL NOT NULL,
                payment_method TEXT NOT NULL DEFAULT 'Cash on Delivery',
                payment_status TEXT NOT NULL DEFAULT 'Pending',
                trx_id TEXT,
                order_status TEXT DEFAULT 'Pending',
                tracking_code TEXT UNIQUE NOT NULL,
                idempotency_key TEXT UNIQUE,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                product_name TEXT NOT NULL,
                price REAL NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                total REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS coupons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                type TEXT NOT NULL DEFAULT 'percentage',
                value REAL NOT NULL,
                min_order REAL DEFAULT 0.00,
                max_discount REAL,
                expiry_date TEXT,
                usage_limit INTEGER DEFAULT 100,
                times_used INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                customer_name TEXT NOT NULL,
                rating INTEGER NOT NULL,
                comment TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name TEXT NOT NULL,
                role TEXT DEFAULT 'Super Admin',
                password_change_required INTEGER NOT NULL DEFAULT 1,
                last_totp_counter INTEGER DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS admin_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token_hash TEXT UNIQUE NOT NULL,
                admin_id INTEGER NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_admin_tokens_admin_id ON admin_tokens (admin_id);
            CREATE TABLE IF NOT EXISTS login_attempts (
                username_hash TEXT NOT NULL,
                ip_hash TEXT NOT NULL,
                attempt_count INTEGER NOT NULL,
                window_started_at DATETIME NOT NULL,
                locked_until DATETIME,
                PRIMARY KEY (username_hash, ip_hash)
            );
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL,
                token_hash TEXT UNIQUE NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_password_reset_customer_id ON password_reset_tokens (customer_id);
        ");

        // Seed data
        $pdo->exec("
            INSERT OR IGNORE INTO settings (key_name, value_data) VALUES
            ('store_name', 'Wonderful Collection'),
            ('store_moto', '🛍️ Wonderful Collection: Quality products, delivered across Bangladesh. 🇧🇩'),
            ('announcement_text', '🚚 Delivery availability and estimates are shown at checkout. Cash on delivery & bKash available.'),
            ('store_email', 'contact@wonderfulcollection.store'),
            ('store_phone', '+880 1560-024777'),
            ('store_address', 'DHAKA, BANGLADESH'),
            ('currency_symbol', '৳'),
            ('currency_code', 'BDT'),
            ('delivery_fee_dhanmondi', '60'),
            ('delivery_fee_dhaka', '80'),
            ('delivery_fee_outside_dhaka', '130'),
            ('free_delivery_min_amount', '2000'),
            ('bkash_number', '01560024777 (Personal)'),
            ('nagad_number', '01560024777 (Personal)'),
            ('rocket_number', '01560024777 (Personal)');

            INSERT OR IGNORE INTO categories (id, name, slug, description, image) VALUES
            (1, 'Men\'s Fashion', 'mens-fashion', 'Premium Panjabis, shirts, and traditional attire.', 'assets/category-placeholder.svg'),
            (2, 'Women\'s Fashion', 'womens-fashion', 'Exquisite designer salwar kameez, sarees and kurtis.', 'assets/category-placeholder.svg'),
            (3, 'Perfumes & Attar', 'perfumes-attar', 'Long-lasting Arabian oud, concentrated attars, and luxury fragrances.', 'assets/category-placeholder.svg'),
            (4, 'Gadgets & Electronics', 'gadgets-electronics', 'Smartwatches, wireless earbuds, and lifestyle tech accessories.', 'assets/category-placeholder.svg'),
            (5, 'Leather & Accessories', 'leather-accessories', '100% Genuine Bangladeshi leather wallets, belts, and luxury bags.', 'assets/category-placeholder.svg'),
            (6, 'Home Decor & Living', 'home-decor', 'Aesthetic scented candles, art pieces, and modern home essentials.', 'assets/category-placeholder.svg');

            INSERT OR IGNORE INTO products (id, name, slug, category_id, regular_price, sale_price, stock_quantity, sku, short_desc, description, images, is_featured, is_trending) VALUES
            (1, 'Royal Nawab Premium Cotton Panjabi - Navy Blue', 'royal-nawab-panjabi-navy', 1, 2800.00, 2350.00, 18, 'WC-PANJ-001', 'Handcrafted semi-fitted 100% organic Egyptian cotton Panjabi with intricate threadwork on collar and placket.', 'Experience exceptional elegance with our flagship Royal Nawab Panjabi. Tailored from 100% breathable organic Egyptian cotton, designed specifically for Dhaka\'s climate. Hand-embroidered mandarin collar, contrast buttons, and side pockets. Delivery options and estimated times are shown at checkout.', '[\"assets/product-placeholder.svg\"]', 1, 1),
            (2, 'Imperial Golden Oud & Amber Perfume (50ml)', 'imperial-golden-oud-amber', 3, 3500.00, 2990.00, 24, 'WC-PERF-002', 'Luxurious oriental fragrance featuring aged Cambodian agarwood, Madagascar vanilla, and warm amber.', 'Our signature bestseller. Imperial Golden Oud opens with sparkling bergamot and saffron, blending seamlessly into rich agarwood, Bulgarian rose, and base notes of warm amber. Unmatched projection that lasts 14+ hours.', '[\"assets/product-placeholder.svg\"]', 1, 1),
            (3, 'Handcrafted Full-Grain Leather Bi-Fold Wallet', 'full-grain-leather-wallet-brown', 5, 1650.00, 1350.00, 35, 'WC-LEATH-003', 'Crafted from authentic Hazaribagh full-grain cowhide leather with RFID blocking technology.', 'Sleek, minimalist, and built for durability. Handcrafted from vegetable-tanned authentic Bangladeshi leather that patinas beautifully over time.', '[\"assets/product-placeholder.svg\"]', 1, 0),
            (4, 'Blossom Designer Georgette 3-Piece', 'blossom-georgette-3piece', 2, 4200.00, 3650.00, 12, 'WC-WOM-004', 'Heavy sequin and zari embroidered semi-stitched georgette kameez with digital printed silk dupatta.', 'Turn heads at any festive gathering. Crafted on premium weightless georgette fabric adorned with delicate floral thread embroidery and shimmering sequins.', '[\"assets/product-placeholder.svg\"]', 1, 1),
            (5, 'Pro ANC Wireless Earbuds - Matte Obsidian', 'pro-anc-wireless-earbuds-black', 4, 2900.00, 2450.00, 40, 'WC-TECH-005', 'Active Noise Cancelling up to 35dB, Quad-Mic ENC for clear calls on Dhaka streets, 32-hour battery.', 'Equipped with 13mm dynamic drivers for deep punchy bass, Bluetooth 5.3 low-latency connection, IPX5 water resistance, and fast Type-C charging.', '[\"assets/product-placeholder.svg\"]', 1, 1),
            (6, 'Artisanal Soy Wax Scented Candle - Dhaka Rain', 'artisanal-candle-dhaka-rain', 6, 950.00, 790.00, 22, 'WC-HOME-006', 'Hand-poured 100% natural soy wax candle scented with petrichor, jasmine, and wet earthen sandalwood.', 'Relive the nostalgic beauty of sudden monsoon rain. Poured by hand into reusable amber glass jars using unbleached cotton wicks.', '[\"assets/product-placeholder.svg\"]', 0, 1),
            (7, 'Executive Chronograph Quartz Watch - Rose Gold', 'executive-chronograph-watch-rosegold', 5, 3800.00, 3190.00, 15, 'WC-ACC-007', 'Precision Japanese quartz movement with genuine leather strap and sapphire-coated mineral glass.', 'A statement of refined taste. Clean architectural dial with date window, tachymeter bezel, 30m water resistance, and supple genuine leather strap.', '[\"assets/product-placeholder.svg\"]', 0, 1),
            (8, 'Ultra-Fine Kashmiri Pashmina Shawl - Ruby Wine', 'kashmiri-pashmina-shawl-ruby', 2, 3200.00, 2750.00, 8, 'WC-WOM-008', 'Featherlight softness with traditional Sozni needlework border, perfect for Dhaka winter evenings.', 'Woven from finest grade Himalayan wool, exquisitely soft and warm yet effortlessly lightweight.', '[\"assets/product-placeholder.svg\"]', 0, 0);

            INSERT OR IGNORE INTO customers (id, name, email, phone, password_hash, address, area, city) VALUES
            (1, 'Tanvir Ahmed', 'tanvir.dhk@example.com', '01711223344', '$2y$12$DgMggvzrteoM9JD80oF61eeZHbVNeMESrHj2h.1DqtAv5Nvt6jcD2', 'Dhaka', 'Dhaka', 'Dhaka'),
            (2, 'Nusrat Jahan', 'nusrat.j@example.com', '01822334455', '$2y$12$DgMggvzrteoM9JD80oF61eeZHbVNeMESrHj2h.1DqtAv5Nvt6jcD2', 'Dhaka', 'Dhaka', 'Dhaka'),
            (3, 'Rahim Chowdhury', 'rahim.chowdhury@example.com', '01933445566', '$2y$12$DgMggvzrteoM9JD80oF61eeZHbVNeMESrHj2h.1DqtAv5Nvt6jcD2', 'Flat 6C, Gulshan-2, Dhaka', 'Gulshan', 'Dhaka');

            INSERT OR IGNORE INTO orders (id, order_number, customer_id, customer_name, customer_phone, customer_email, delivery_address, delivery_area, delivery_fee, subtotal, discount, total, payment_method, payment_status, trx_id, order_status, tracking_code, notes) VALUES
            (1, 'WC-10021', 1, 'Tanvir Ahmed', '01711223344', 'tanvir.dhk@example.com', 'Dhaka', 'Dhaka', 60.00, 2350.00, 0.00, 2410.00, 'bKash', 'Paid', 'BKASH9823471', 'Processing', 'TRK-WC-7721', 'Call before delivery.'),
            (2, 'WC-10022', 2, 'Nusrat Jahan', '01822334455', 'nusrat.j@example.com', 'Dhaka', 'Dhaka', 60.00, 3650.00, 365.00, 3345.00, 'Cash on Delivery', 'Pending', NULL, 'Pending', 'TRK-WC-8842', 'Call before delivery.'),
            (3, 'WC-10020', 3, 'Rahim Chowdhury', '01933445566', 'rahim.chowdhury@example.com', 'Flat 6C, Gulshan-2, Dhaka', 'Gulshan', 80.00, 5440.00, 200.00, 5320.00, 'Nagad', 'Paid', 'NGD7716298', 'Delivered', 'TRK-WC-6619', 'Delivered with receipt.');

            INSERT OR IGNORE INTO order_items (order_id, product_id, product_name, price, quantity, total) VALUES
            (1, 1, 'Royal Nawab Premium Cotton Panjabi - Navy Blue', 2350.00, 1, 2350.00),
            (2, 4, 'Blossom Designer Georgette 3-Piece', 3650.00, 1, 3650.00),
            (3, 2, 'Imperial Golden Oud & Amber Perfume (50ml)', 2990.00, 1, 2990.00),
            (3, 5, 'Pro ANC Wireless Earbuds - Matte Obsidian', 2450.00, 1, 2450.00);

            INSERT OR IGNORE INTO coupons (code, type, value, min_order, max_discount, expiry_date, usage_limit, times_used, is_active) VALUES
            ('DHANMONDI10', 'percentage', 10.00, 1000.00, 500.00, '2028-12-31', 500, 42, 0),
            ('WONDERFUL100', 'fixed', 100.00, 1500.00, 100.00, '2028-12-31', 200, 19, 1),
            ('EIDSPECIAL', 'percentage', 15.00, 2500.00, 750.00, '2028-12-31', 300, 8, 1);

            INSERT OR IGNORE INTO reviews (product_id, customer_name, rating, comment) VALUES
            (1, 'Fahim Morshed', 5, 'Fast delivery. The fabric is 10/10 quality! Definitely ordering again.'),
            (1, 'Sabbir Hossain', 5, 'Fitting is very comfortable for Dhaka weather. Color is exact navy blue as shown in pictures.'),
            (2, 'Dr. Ariful Islam', 5, 'The oud projection is unbelievable. Lasts over 12 hours easily. Authentic fragrance!'),
            (4, 'Sadia Rahman', 5, 'Wore this to a family dawat and got so many compliments. Beautiful embroidery work.');

            INSERT OR IGNORE INTO admins (username, password_hash, full_name, role) VALUES
            ('admin', '$2y$12$l0nUHojhz2R6lYhkYzvOwejLKmJc.tCQbXMm7NmbWqewMxLUmZuiy', 'Wonderful Store Manager', 'Super Admin');
        ");
    }

    private static function ensureSQLiteColumn(PDO $pdo, string $table, string $column, string $definition): void {
        $columns = $pdo->query('PRAGMA table_info(' . $table . ')')->fetchAll();
        foreach ($columns as $existingColumn) {
            if ($existingColumn['name'] === $column) {
                return;
            }
        }
        $pdo->exec('ALTER TABLE ' . $table . ' ADD COLUMN ' . $column . ' ' . $definition);
    }
}

function getBearerTokenFromRequest(): ?string {
    $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if ($authorization === '' && function_exists('getallheaders')) {
        $headers = getallheaders();
        $authorization = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }

    if (!preg_match('/^Bearer\s+([A-Za-z0-9_-]+)$/i', trim($authorization), $matches)) {
        return null;
    }
    return $matches[1];
}

function requireCustomerToken(PDO $pdo): array {
    $token = getBearerTokenFromRequest();
    if ($token === null) {
        logSecurityEvent('customer_auth_denied');
        jsonResponse(['error' => 'Customer authorization required'], 401);
    }

    $stmt = $pdo->prepare("
        SELECT c.id, c.name, c.email
        FROM customer_tokens t
        INNER JOIN customers c ON c.id = t.customer_id
        WHERE t.token_hash = ? AND t.expires_at > ?
    ");
    $stmt->execute([hash('sha256', $token), gmdate('Y-m-d H:i:s')]);
    $customer = $stmt->fetch();
    if (!$customer) {
        logSecurityEvent('customer_auth_denied');
        jsonResponse(['error' => 'Customer authorization required'], 401);
    }
    return $customer;
}

function getAdminTokenFromRequest(): ?string {
    return getBearerTokenFromRequest();
}

function requireAdminToken(PDO $pdo, bool $allowPasswordChange = false): array {
    $token = getAdminTokenFromRequest();
    if ($token === null) {
        logSecurityEvent('admin_auth_denied');
        jsonResponse(['error' => 'Admin authorization required'], 401);
    }

    $stmt = $pdo->prepare("
        SELECT a.id, a.username, a.full_name, a.role, a.password_change_required
        FROM admin_tokens t
        INNER JOIN admins a ON a.id = t.admin_id
        WHERE t.token_hash = ? AND t.expires_at > ?
    ");
    $stmt->execute([hash('sha256', $token), gmdate('Y-m-d H:i:s')]);
    $admin = $stmt->fetch();
    if (!$admin) {
        logSecurityEvent('admin_auth_denied');
        jsonResponse(['error' => 'Admin authorization required'], 401);
    }
    if ((int)$admin['password_change_required'] === 1 && !$allowPasswordChange) {
        jsonResponse(['error' => 'Change the initial admin password before using the admin panel.'], 403);
    }
    return $admin;
}

function loginAttemptKeys(string $username): array {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    return [
        'account' => [
            'username_hash' => hash('sha256', 'login:account:' . strtolower(trim($username))),
            'ip_hash' => hash('sha256', 'login:account-global')
        ],
        'ip' => [
            'username_hash' => hash('sha256', 'login:ip'),
            'ip_hash' => hash('sha256', $ip)
        ]
    ];
}

function logSecurityEvent(string $event): void {
    if (!preg_match('/^[a-z0-9_]{1,64}$/', $event)) {
        return;
    }
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    error_log('security_event=' . $event . ' client_ip_hash=' . hash('sha256', $ip));
}

function enforceApiRateLimit(PDO $pdo, string $scope, int $limit, int $windowSeconds): void {
    if (!preg_match('/^[a-z0-9_-]{1,40}$/', $scope) || $limit < 1 || $windowSeconds < 1) {
        throw new InvalidArgumentException('Invalid API rate-limit configuration.');
    }

    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $usernameHash = hash('sha256', 'api:' . $scope);
    $ipHash = hash('sha256', $ip);
    $now = time();
    $nowText = gmdate('Y-m-d H:i:s', $now);
    $cutoff = gmdate('Y-m-d H:i:s', $now - max(3600, $windowSeconds * 4));

    try {
        $pdo->beginTransaction();
        $cleanup = $pdo->prepare("
            DELETE FROM login_attempts
            WHERE window_started_at < ? AND (locked_until IS NULL OR locked_until < ?)
        ");
        $cleanup->execute([$cutoff, $nowText]);

        $selectSql = 'SELECT attempt_count, window_started_at, locked_until FROM login_attempts WHERE username_hash = ? AND ip_hash = ?';
        if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
            $selectSql .= ' FOR UPDATE';
        }
        $stmt = $pdo->prepare($selectSql);
        $stmt->execute([$usernameHash, $ipHash]);
        $record = $stmt->fetch();

        if ($record && !empty($record['locked_until']) && strtotime($record['locked_until'] . ' UTC') > $now) {
            $retryAfter = max(1, strtotime($record['locked_until'] . ' UTC') - $now);
            $pdo->commit();
            logSecurityEvent('api_rate_limited_' . $scope);
            header('Retry-After: ' . $retryAfter);
            jsonResponse(['error' => 'Too many requests. Please wait and try again.'], 429);
        }

        $windowExpired = !$record || ($now - strtotime($record['window_started_at'] . ' UTC')) >= $windowSeconds;
        $attemptCount = $windowExpired ? 1 : (int)$record['attempt_count'] + 1;
        $windowStartedAt = $windowExpired ? $nowText : $record['window_started_at'];
        $lockedUntil = $attemptCount > $limit ? gmdate('Y-m-d H:i:s', $now + $windowSeconds) : null;

        if ($record) {
            $update = $pdo->prepare('UPDATE login_attempts SET attempt_count = ?, window_started_at = ?, locked_until = ? WHERE username_hash = ? AND ip_hash = ?');
            $update->execute([$attemptCount, $windowStartedAt, $lockedUntil, $usernameHash, $ipHash]);
        } else {
            $insert = $pdo->prepare('INSERT INTO login_attempts (username_hash, ip_hash, attempt_count, window_started_at, locked_until) VALUES (?, ?, ?, ?, ?)');
            $insert->execute([$usernameHash, $ipHash, $attemptCount, $windowStartedAt, $lockedUntil]);
        }
        $pdo->commit();

        if ($lockedUntil !== null) {
            logSecurityEvent('api_rate_limited_' . $scope);
            header('Retry-After: ' . $windowSeconds);
            jsonResponse(['error' => 'Too many requests. Please wait and try again.'], 429);
        }
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('Wonderful Collection API rate-limit storage failed.');
        jsonResponse(['error' => 'Request could not be processed. Please try again.'], 500);
    }
}

function isLoginRateLimited(PDO $pdo, string $username): bool {
    $keys = loginAttemptKeys($username);
    $now = time();
    $nowText = gmdate('Y-m-d H:i:s', $now);
    $windowStart = gmdate('Y-m-d H:i:s', $now - 900);

    try {
        $cleanup = $pdo->prepare('DELETE FROM login_attempts WHERE window_started_at < ? AND (locked_until IS NULL OR locked_until < ?)');
        $cleanup->execute([gmdate('Y-m-d H:i:s', $now - 3600), $nowText]);

        $ipStmt = $pdo->prepare('SELECT locked_until FROM login_attempts WHERE username_hash = ? AND ip_hash = ?');
        $ipStmt->execute([$keys['ip']['username_hash'], $keys['ip']['ip_hash']]);
        $lockedUntil = $ipStmt->fetchColumn();
        if ($lockedUntil !== false && $lockedUntil !== null && strtotime($lockedUntil . ' UTC') > $now) {
            return true;
        }

        $accountStmt = $pdo->prepare('SELECT attempt_count, window_started_at FROM login_attempts WHERE username_hash = ? AND ip_hash = ?');
        $accountStmt->execute([$keys['account']['username_hash'], $keys['account']['ip_hash']]);
        $accountAttempt = $accountStmt->fetch();
        if ($accountAttempt && strtotime($accountAttempt['window_started_at'] . ' UTC') >= $now - 900) {
            $delayMicroseconds = min(2000000, max(0, (int)$accountAttempt['attempt_count'] - 1) * 250000);
            if ($delayMicroseconds > 0) {
                usleep($delayMicroseconds);
            }
        }
        return false;
    } catch (PDOException $e) {
        error_log('Wonderful Collection login rate-limit lookup failed.');
        jsonResponse(['error' => 'Login could not be processed. Please try again.'], 500);
    }
}

function recordLoginFailure(PDO $pdo, string $username): bool {
    $keys = loginAttemptKeys($username);
    $now = time();
    $nowText = gmdate('Y-m-d H:i:s', $now);
    $windowStart = gmdate('Y-m-d H:i:s', $now - 900);
    $lockedUntil = gmdate('Y-m-d H:i:s', $now + 900);
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);

    try {
        foreach (['account', 'ip'] as $bucket) {
            $key = $keys[$bucket];
            $isIpBucket = $bucket === 'ip' ? 1 : 0;
            if ($driver === 'mysql') {
                $sql = '
                INSERT INTO login_attempts (username_hash, ip_hash, attempt_count, window_started_at, locked_until)
                VALUES (?, ?, 1, ?, NULL)
                ON DUPLICATE KEY UPDATE
                    attempt_count = IF(window_started_at < ?, 1, attempt_count + 1),
                    locked_until = IF(window_started_at < ?, NULL, IF(? = 1 AND attempt_count >= 5, ?, locked_until)),
                    window_started_at = IF(window_started_at < ?, ?, window_started_at)
                ';
            } elseif ($driver === 'sqlite') {
                $sql = '
                INSERT INTO login_attempts (username_hash, ip_hash, attempt_count, window_started_at, locked_until)
                VALUES (?, ?, 1, ?, NULL)
                ON CONFLICT(username_hash, ip_hash) DO UPDATE SET
                    attempt_count = CASE WHEN window_started_at < ? THEN 1 ELSE attempt_count + 1 END,
                    locked_until = CASE WHEN window_started_at < ? THEN NULL WHEN ? = 1 AND attempt_count >= 5 THEN ? ELSE locked_until END,
                    window_started_at = CASE WHEN window_started_at < ? THEN ? ELSE window_started_at END
                ';
            } else {
                jsonResponse(['error' => 'Login rate limiting is unsupported by this database driver.'], 500);
            }

            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $key['username_hash'],
                $key['ip_hash'],
                $nowText,
                $windowStart,
                $windowStart,
                $isIpBucket,
                $lockedUntil,
                $windowStart,
                $nowText
            ]);
        }

        $ipStmt = $pdo->prepare('SELECT locked_until FROM login_attempts WHERE username_hash = ? AND ip_hash = ?');
        $ipStmt->execute([$keys['ip']['username_hash'], $keys['ip']['ip_hash']]);
        $ipLockedUntil = $ipStmt->fetchColumn();
        return $ipLockedUntil !== false && $ipLockedUntil !== null && strtotime($ipLockedUntil . ' UTC') > $now;
    } catch (PDOException $e) {
        error_log('Wonderful Collection login rate-limit storage failed.');
        jsonResponse(['error' => 'Login could not be processed. Please try again.'], 500);
    }
}

function clearLoginAttempts(PDO $pdo, string $username): void {
    $keys = loginAttemptKeys($username);
    $stmt = $pdo->prepare('DELETE FROM login_attempts WHERE (username_hash = ? AND ip_hash = ?) OR (username_hash = ? AND ip_hash = ?)');
    try {
        $stmt->execute([
            $keys['account']['username_hash'],
            $keys['account']['ip_hash'],
            $keys['ip']['username_hash'],
            $keys['ip']['ip_hash']
        ]);
    } catch (PDOException $e) {
        error_log('Wonderful Collection login attempt cleanup failed.');
        jsonResponse(['error' => 'Login could not be completed. Please try again.'], 500);
    }
}
