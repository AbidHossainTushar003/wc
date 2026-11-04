-- Products, Suppliers, and Couriers Migration (Sprint 5)
CREATE TABLE IF NOT EXISTS `suppliers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `contact_person` VARCHAR(100) DEFAULT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `email` VARCHAR(150) DEFAULT NULL,
  `address` TEXT,
  `payable_balance` DECIMAL(12,2) DEFAULT 0.00,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stock_movements` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `type` ENUM('Purchase', 'Sale', 'Return', 'Adjustment') NOT NULL,
  `quantity` INT NOT NULL,
  `reference_id` INT DEFAULT NULL,
  `notes` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `product_variants` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `size` VARCHAR(50) DEFAULT NULL,
  `color` VARCHAR(50) DEFAULT NULL,
  `sku` VARCHAR(100) UNIQUE NOT NULL,
  `price` DECIMAL(10,2) DEFAULT NULL,
  `stock_quantity` INT NOT NULL DEFAULT 10,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `courier_parcels` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `courier_name` VARCHAR(50) NOT NULL,
  `consignment_id` VARCHAR(100) DEFAULT NULL,
  `tracking_code` VARCHAR(100) DEFAULT NULL,
  `status` VARCHAR(50) DEFAULT 'Pending',
  `cod_amount` DECIMAL(10,2) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
