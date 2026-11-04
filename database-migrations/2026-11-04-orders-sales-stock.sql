-- Orders, Sales, and Blacklist Migration (Sprint 4)
CREATE TABLE IF NOT EXISTS `order_timeline` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `admin_id` INT DEFAULT NULL,
  `action` VARCHAR(100) NOT NULL,
  `notes` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_blacklist` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `phone` VARCHAR(30) UNIQUE NOT NULL,
  `reason` TEXT NOT NULL,
  `added_by` INT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `office_sales` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `invoice_number` VARCHAR(50) UNIQUE NOT NULL,
  `customer_name` VARCHAR(150) NOT NULL,
  `customer_phone` VARCHAR(30) NOT NULL,
  `subtotal` DECIMAL(10,2) NOT NULL,
  `discount` DECIMAL(10,2) DEFAULT 0.00,
  `total` DECIMAL(10,2) NOT NULL,
  `paid` DECIMAL(10,2) NOT NULL,
  `due` DECIMAL(10,2) DEFAULT 0.00,
  `payment_method` VARCHAR(50) DEFAULT 'Cash',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
