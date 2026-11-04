-- Accounts, Expenses, Salaries, and Payment Tracking Migration (Sprint 3)
CREATE TABLE IF NOT EXISTS `accounts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `type` VARCHAR(50) NOT NULL DEFAULT 'Bank/Cash',
  `balance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `transactions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `account_id` INT NOT NULL,
  `type` ENUM('Income', 'Expense', 'Transfer') NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `reference` VARCHAR(150) DEFAULT NULL,
  `notes` TEXT,
  `created_by` INT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `employee_salaries` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `employee_name` VARCHAR(150) NOT NULL,
  `designation` VARCHAR(100) NOT NULL,
  `base_salary` DECIMAL(10,2) NOT NULL,
  `advance_paid` DECIMAL(10,2) DEFAULT 0.00,
  `deductions` DECIMAL(10,2) DEFAULT 0.00,
  `net_paid` DECIMAL(10,2) NOT NULL,
  `month` VARCHAR(20) NOT NULL,
  `paid_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `refunds` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `reason` TEXT NOT NULL,
  `approved_by` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `products` ADD COLUMN IF NOT EXISTS `cost_price` DECIMAL(10,2) DEFAULT 0.00;
