-- Wonderful Collection additive MySQL/MariaDB migration.
-- Back up first. Run tests/schema-check.sql and resolve duplicate payment references before this migration.
-- Run each ALTER statement separately in phpMyAdmin. "Duplicate column" means it is already applied; continue.
-- "Duplicate key name" means that index name already exists; confirm it covers the same columns before continuing.
-- A duplicate-entry error on uq_orders_payment_trx_id means existing orders reuse a TrxID; resolve those records first.
-- Rollback: restore the complete pre-migration database backup. Do not guess at DROP/column rollback SQL.

CREATE TABLE IF NOT EXISTS `admin_tokens` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `token_hash` CHAR(64) NOT NULL,
  `admin_id` INT NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_tokens_token_hash` (`token_hash`),
  KEY `idx_admin_tokens_admin_id` (`admin_id`),
  CONSTRAINT `fk_admin_tokens_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_tokens` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `token_hash` CHAR(64) NOT NULL,
  `customer_id` INT NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_tokens_token_hash` (`token_hash`),
  KEY `idx_customer_tokens_customer_id` (`customer_id`),
  CONSTRAINT `fk_customer_tokens_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `login_attempts` (
  `username_hash` CHAR(64) NOT NULL,
  `ip_hash` CHAR(64) NOT NULL,
  `attempt_count` INT NOT NULL,
  `window_started_at` DATETIME NOT NULL,
  `locked_until` DATETIME DEFAULT NULL,
  PRIMARY KEY (`username_hash`, `ip_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `customer_id` INT NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_password_reset_tokens_token_hash` (`token_hash`),
  KEY `idx_password_reset_customer_id` (`customer_id`),
  CONSTRAINT `fk_password_reset_tokens_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_email_verifications` (
  `customer_id` INT NOT NULL,
  `token_hash` CHAR(64) DEFAULT NULL,
  `expires_at` DATETIME DEFAULT NULL,
  `verified_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`customer_id`),
  UNIQUE KEY `uq_customer_email_verifications_token_hash` (`token_hash`),
  CONSTRAINT `fk_customer_email_verifications_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `accounts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `type` VARCHAR(50) NOT NULL DEFAULT 'Cash',
  `balance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `transactions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `account_id` INT NOT NULL,
  `type` ENUM('Income', 'Expense') NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `category` VARCHAR(150) NOT NULL DEFAULT 'General',
  `notes` TEXT,
  `created_by` INT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_transactions_account_id` (`account_id`),
  KEY `idx_transactions_created_by` (`created_by`),
  CONSTRAINT `fk_transactions_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_transactions_admin` FOREIGN KEY (`created_by`) REFERENCES `admins` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `employee_salaries` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `employee_name` VARCHAR(150) NOT NULL,
  `designation` VARCHAR(150) NOT NULL DEFAULT '',
  `base_salary` DECIMAL(12,2) NOT NULL,
  `advance_paid` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `deductions` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `net_paid` DECIMAL(12,2) NOT NULL,
  `month` CHAR(7) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_employee_salaries_month` (`month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `office_sales` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `invoice_number` VARCHAR(50) NOT NULL,
  `customer_name` VARCHAR(150) NOT NULL,
  `customer_phone` VARCHAR(30) NOT NULL DEFAULT '',
  `subtotal` DECIMAL(12,2) NOT NULL,
  `discount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `total` DECIMAL(12,2) NOT NULL,
  `paid` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `due` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `payment_method` VARCHAR(50) NOT NULL DEFAULT 'Cash',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_office_sales_invoice_number` (`invoice_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `suppliers` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `contact_person` VARCHAR(150) DEFAULT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `email` VARCHAR(150) DEFAULT NULL,
  `address` TEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_suppliers_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cms_pages` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `slug` VARCHAR(150) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `content` LONGTEXT NOT NULL,
  `meta_title` VARCHAR(255) NOT NULL DEFAULT '',
  `meta_description` VARCHAR(500) NOT NULL DEFAULT '',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cms_pages_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `error_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `type` VARCHAR(50) NOT NULL DEFAULT 'application',
  `message` TEXT NOT NULL,
  `file` VARCHAR(500) DEFAULT NULL,
  `line` INT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_error_logs_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `admin_id` INT DEFAULT NULL,
  `action` VARCHAR(100) NOT NULL,
  `entity_type` VARCHAR(100) NOT NULL,
  `entity_id` INT DEFAULT NULL,
  `old_values` LONGTEXT,
  `new_values` LONGTEXT,
  `ip_address` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_logs_admin_id` (`admin_id`),
  KEY `idx_audit_logs_entity` (`entity_type`, `entity_id`),
  KEY `idx_audit_logs_created_at` (`created_at`),
  CONSTRAINT `fk_audit_logs_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `courier_parcels` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT DEFAULT NULL,
  `courier_name` VARCHAR(100) NOT NULL,
  `tracking_code` VARCHAR(100) NOT NULL,
  `cod_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(100) NOT NULL DEFAULT 'Pending',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_courier_parcels_tracking_code` (`tracking_code`),
  KEY `idx_courier_parcels_order_id` (`order_id`),
  CONSTRAINT `fk_courier_parcels_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Each ALTER is standalone. Duplicate column error = already applied, safe to continue.
ALTER TABLE `products` ADD COLUMN `is_archived` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `categories` ADD COLUMN `is_archived` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `admins` ADD COLUMN `password_change_required` TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE `admins` ADD COLUMN `last_totp_counter` BIGINT UNSIGNED DEFAULT NULL;
ALTER TABLE `orders` ADD COLUMN `delivery_zone` VARCHAR(32) DEFAULT NULL;
ALTER TABLE `orders` ADD COLUMN `idempotency_key` VARCHAR(128) DEFAULT NULL;

-- Run only when schema-check shows no equivalent unique idempotency_key index.
-- Duplicate key name error = already applied; verify the existing index columns before continuing.
ALTER TABLE `orders` ADD UNIQUE KEY `uq_orders_idempotency_key` (`idempotency_key`);
-- Resolve duplicate TrxIDs reported by schema-check before running this statement.
ALTER TABLE `orders` ADD UNIQUE KEY `uq_orders_payment_trx_id` (`payment_method`, `trx_id`);

-- Existing database.sql uses ON DELETE SET NULL for order_items.product_id.
-- If schema-check reports another delete rule, inspect it and change the named FK manually
-- in staging first; do not guess the existing constraint name in phpMyAdmin.
ALTER TABLE `order_items` MODIFY COLUMN `product_id` INT DEFAULT NULL;
