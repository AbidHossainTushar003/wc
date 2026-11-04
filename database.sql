-- Wonderful Collection E-Commerce Database Schema
-- Ready for MySQL / MariaDB on cPanel (wonderfulcollection.store)
-- Created for cPanel user: wonderfu

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `order_items`;
DROP TABLE IF EXISTS `orders`;
DROP TABLE IF EXISTS `admin_tokens`;
DROP TABLE IF EXISTS `login_attempts`;
DROP TABLE IF EXISTS `reviews`;
DROP TABLE IF EXISTS `coupons`;
DROP TABLE IF EXISTS `products`;
DROP TABLE IF EXISTS `categories`;
DROP TABLE IF EXISTS `customers`;
DROP TABLE IF EXISTS `admins`;
DROP TABLE IF EXISTS `settings`;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. Store Settings Table
CREATE TABLE `settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `key_name` VARCHAR(100) UNIQUE NOT NULL,
  `value_data` TEXT,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `settings` (`key_name`, `value_data`) VALUES
('store_name', 'Wonderful Collection'),
('store_moto', '🛍️ Wonderful Collection: Your top online shopping service in Dhanmondi, Dhaka. Quality delivered. 🇧🇩'),
('store_email', 'contact@wonderfulcollection.store'),
('store_phone', '+880 1712-345678'),
('store_address', 'House 42, Road 7/A, Dhanmondi, Dhaka-1209, Bangladesh'),
('currency_symbol', '৳'),
('currency_code', 'BDT'),
('delivery_fee_dhanmondi', '60'),
('delivery_fee_dhaka', '80'),
('delivery_fee_outside_dhaka', '130'),
('free_delivery_min_amount', '2000'),
('bkash_number', '01712345678 (Personal / Merchant)'),
('nagad_number', '01812345678 (Merchant)'),
('rocket_number', '01912345678 (Personal)');

-- 2. Categories Table
CREATE TABLE `categories` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `slug` VARCHAR(150) UNIQUE NOT NULL,
  `description` TEXT,
  `image` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `categories` (`id`, `name`, `slug`, `description`, `image`) VALUES
(1, 'Men\'s Fashion', 'mens-fashion', 'Premium Panjabis, shirts, and traditional attire.', 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&q=80'),
(2, 'Women\'s Fashion', 'womens-fashion', 'Exquisite designer salwar kameez, sarees and kurtis.', 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=500&q=80'),
(3, 'Perfumes & Attar', 'perfumes-attar', 'Long-lasting Arabian oud, concentrated attars, and luxury fragrances.', 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=500&q=80'),
(4, 'Gadgets & Electronics', 'gadgets-electronics', 'Smartwatches, wireless earbuds, and lifestyle tech accessories.', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80'),
(5, 'Leather & Accessories', 'leather-accessories', '100% Genuine Bangladeshi leather wallets, belts, and luxury bags.', 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=500&q=80'),
(6, 'Home Decor & Living', 'home-decor', 'Aesthetic scented candles, art pieces, and modern home essentials.', 'https://images.unsplash.com/photo-1602874801007-bd458bb1b8b8?w=500&q=80');

-- 3. Products Table
CREATE TABLE `products` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) UNIQUE NOT NULL,
  `category_id` INT NOT NULL,
  `regular_price` DECIMAL(10,2) NOT NULL,
  `sale_price` DECIMAL(10,2) DEFAULT NULL,
  `stock_quantity` INT NOT NULL DEFAULT 10,
  `sku` VARCHAR(100) UNIQUE,
  `short_desc` TEXT,
  `description` LONGTEXT,
  `images` TEXT NOT NULL,
  `is_featured` TINYINT(1) DEFAULT 0,
  `is_trending` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `products` (`id`, `name`, `slug`, `category_id`, `regular_price`, `sale_price`, `stock_quantity`, `sku`, `short_desc`, `description`, `images`, `is_featured`, `is_trending`) VALUES
(1, 'Royal Nawab Premium Cotton Panjabi - Navy Blue', 'royal-nawab-panjabi-navy', 1, 2800.00, 2350.00, 18, 'WC-PANJ-001', 'Handcrafted semi-fitted 100% organic Egyptian cotton Panjabi with intricate threadwork on collar and placket.', 'Experience exceptional elegance with our flagship Royal Nawab Panjabi. Tailored from 100% breathable organic Egyptian cotton, designed specifically for Dhaka\'s climate. Hand-embroidered mandarin collar, contrast buttons, and side pockets. Delivered right to your doorstep in Dhanmondi within 2-4 hours.', '["https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&q=80","https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?w=800&q=80"]', 1, 1),

(2, 'Imperial Golden Oud & Amber Perfume (50ml)', 'imperial-golden-oud-amber', 3, 3500.00, 2990.00, 24, 'WC-PERF-002', 'Luxurious oriental fragrance featuring aged Cambodian agarwood, Madagascar vanilla, and warm amber.', 'Our signature bestseller. Imperial Golden Oud opens with sparkling bergamot and saffron, blending seamlessly into rich agarwood, Bulgarian rose, and base notes of warm amber. Unmatched projection that lasts 14+ hours. 100% pure imported fragrance oil formulation.', '["https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=800&q=80","https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=800&q=80"]', 1, 1),

(3, 'Handcrafted Full-Grain Leather Bi-Fold Wallet', 'full-grain-leather-wallet-brown', 5, 1650.00, 1350.00, 35, 'WC-LEATH-003', 'Crafted from authentic Hazaribagh full-grain cowhide leather with RFID blocking technology.', 'Sleek, minimalist, and built for durability. Handcrafted from vegetable-tanned authentic Bangladeshi leather that patinas beautifully over time. Features 8 card slots, 2 cash compartments, and RFID blocking lining for security.', '["https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&q=80","https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=800&q=80"]', 1, 0),

(4, 'Dhanmondi Blossom Designer Georgette 3-Piece', 'dhanmondi-blossom-georgette-3piece', 2, 4200.00, 3650.00, 12, 'WC-WOM-004', 'Heavy sequin and zari embroidered semi-stitched georgette kameez with digital printed silk dupatta.', 'Turn heads at any festive gathering in Dhaka. Crafted on premium weightless georgette fabric adorned with delicate floral thread embroidery and shimmering sequins. Comes with matching santoon bottom and an ethereal organza dupatta.', '["https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800&q=80","https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=800&q=80"]', 1, 1),

(5, 'Pro ANC Wireless Earbuds - Matte Obsidian', 'pro-anc-wireless-earbuds-black', 4, 2900.00, 2450.00, 40, 'WC-TECH-005', 'Active Noise Cancelling up to 35dB, Quad-Mic ENC for clear calls on Dhaka streets, 32-hour battery.', 'Drown out the bustling city noise with active hybrid noise cancellation. Equipped with 13mm dynamic drivers for deep punchy bass, Bluetooth 5.3 low-latency connection, IPX5 water resistance, and fast Type-C charging.', '["https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&q=80","https://images.unsplash.com/photo-1572536147248-ac59a8abfa4b?w=800&q=80"]', 1, 1),

(6, 'Artisanal Soy Wax Scented Candle - Dhaka Rain', 'artisanal-candle-dhaka-rain', 6, 950.00, 790.00, 22, 'WC-HOME-006', 'Hand-poured 100% natural soy wax candle scented with petrichor, jasmine, and wet earthen sandalwood.', 'Relive the nostalgic beauty of sudden monsoon rain in Dhanmondi lake. Poured by hand into reusable amber glass jars using unbleached cotton wicks. Burn time up to 45 hours.', '["https://images.unsplash.com/photo-1602874801007-bd458bb1b8b8?w=800&q=80","https://images.unsplash.com/photo-1508746829417-e6f548d8d6ed?w=800&q=80"]', 0, 1),

(7, 'Executive Chronograph Quartz Watch - Rose Gold', 'executive-chronograph-watch-rosegold', 5, 3800.00, 3190.00, 15, 'WC-ACC-007', 'Precision Japanese quartz movement with genuine leather strap and sapphire-coated mineral glass.', 'A statement of refined taste. Clean architectural dial with date window, tachymeter bezel, 30m water resistance, and supple genuine leather strap.', '["https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=800&q=80"]', 0, 1),

(8, 'Ultra-Fine Kashmiri Pashmina Shawl - Ruby Wine', 'kashmiri-pashmina-shawl-ruby', 2, 3200.00, 2750.00, 8, 'WC-WOM-008', 'Featherlight softness with traditional Sozni needlework border, perfect for Dhaka winter evenings.', 'Woven from finest grade Himalayan wool, exquisitely soft and warm yet effortlessly lightweight. Accented with timeless antique floral borders.', '["https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800&q=80"]', 0, 0);

-- 4. Customers Table
CREATE TABLE `customers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `email` VARCHAR(150) UNIQUE NOT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `address` TEXT,
  `area` VARCHAR(100) DEFAULT 'Dhanmondi',
  `city` VARCHAR(100) DEFAULT 'Dhaka',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Orders Table
CREATE TABLE `orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_number` VARCHAR(50) UNIQUE NOT NULL,
  `customer_id` INT DEFAULT NULL,
  `customer_name` VARCHAR(150) NOT NULL,
  `customer_phone` VARCHAR(30) NOT NULL,
  `customer_email` VARCHAR(150),
  `delivery_address` TEXT NOT NULL,
  `delivery_area` VARCHAR(100) NOT NULL,
  `delivery_fee` DECIMAL(10,2) NOT NULL DEFAULT 60.00,
  `subtotal` DECIMAL(10,2) NOT NULL,
  `discount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `total` DECIMAL(10,2) NOT NULL,
  `payment_method` VARCHAR(50) NOT NULL DEFAULT 'Cash on Delivery',
  `payment_status` VARCHAR(50) NOT NULL DEFAULT 'Pending',
  `trx_id` VARCHAR(100) DEFAULT NULL,
  `order_status` ENUM('Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled') DEFAULT 'Pending',
  `tracking_code` VARCHAR(50) UNIQUE NOT NULL,
  `notes` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Order Items Table
CREATE TABLE `order_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `product_id` INT NOT NULL,
  `product_name` VARCHAR(255) NOT NULL,
  `price` DECIMAL(10,2) NOT NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `total` DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Coupons Table
CREATE TABLE `coupons` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(50) UNIQUE NOT NULL,
  `type` ENUM('percentage', 'fixed') NOT NULL DEFAULT 'percentage',
  `value` DECIMAL(10,2) NOT NULL,
  `min_order` DECIMAL(10,2) DEFAULT 0.00,
  `max_discount` DECIMAL(10,2) DEFAULT NULL,
  `expiry_date` DATE DEFAULT NULL,
  `usage_limit` INT DEFAULT 100,
  `times_used` INT DEFAULT 0,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `coupons` (`code`, `type`, `value`, `min_order`, `max_discount`, `expiry_date`, `usage_limit`, `times_used`, `is_active`) VALUES
('DHANMONDI10', 'percentage', 10.00, 1000.00, 500.00, '2028-12-31', 500, 42, 1),
('WONDERFUL100', 'fixed', 100.00, 1500.00, 100.00, '2028-12-31', 200, 19, 1),
('EIDSPECIAL', 'percentage', 15.00, 2500.00, 750.00, '2028-12-31', 300, 8, 1);

-- 8. Customer Reviews Table
CREATE TABLE `reviews` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `customer_name` VARCHAR(150) NOT NULL,
  `rating` INT NOT NULL CHECK (`rating` BETWEEN 1 AND 5),
  `comment` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `reviews` (`product_id`, `customer_name`, `rating`, `comment`) VALUES
(1, 'Fahim Morshed', 5, 'Super fast delivery to Dhanmondi Road 4. The fabric is 10/10 quality! Definitely ordering again.'),
(1, 'Sabbir Hossain', 5, 'Fitting is very comfortable for Dhaka weather. Color is exact navy blue as shown in pictures.'),
(2, 'Dr. Ariful Islam', 5, 'The oud projection is unbelievable. Lasts over 12 hours easily. Authentic fragrance!'),
(4, 'Sadia Rahman', 5, 'Wore this to a family dawat in Dhanmondi, got so many compliments. Beautiful embroidery work.');

-- 9. Admin Accounts Table
CREATE TABLE `admins` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(100) UNIQUE NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `role` VARCHAR(50) DEFAULT 'Super Admin',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `admins` (`username`, `password_hash`, `full_name`, `role`) VALUES
('admin', '$2y$12$l0nUHojhz2R6lYhkYzvOwejLKmJc.tCQbXMm7NmbWqewMxLUmZuiy', 'Wonderful Store Manager', 'Super Admin');

-- Admin bearer tokens are stored as SHA-256 hashes and expire.
CREATE TABLE `admin_tokens` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `token_hash` CHAR(64) UNIQUE NOT NULL,
  `admin_id` INT NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_admin_tokens_admin_id` (`admin_id`),
  FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `login_attempts` (
  `username_hash` CHAR(64) NOT NULL,
  `ip_hash` CHAR(64) NOT NULL,
  `attempt_count` INT NOT NULL,
  `window_started_at` DATETIME NOT NULL,
  `locked_until` DATETIME DEFAULT NULL,
  PRIMARY KEY (`username_hash`, `ip_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
