-- Wonderful Collection audit fixes.
-- Safe to re-run: tables are created only when absent; this migration does not drop data.
-- Back up the live database before running. See CPANEL-DEPLOY-RUNBOOK.md.

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

-- Archive catalog records instead of deleting historical sales references.
-- The guarded DDL calls allow the migration to be re-run without destructive changes.
DROP PROCEDURE IF EXISTS `wc_20261104_add_column_if_missing`;
DELIMITER //
CREATE PROCEDURE `wc_20261104_add_column_if_missing`(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_definition VARCHAR(255)
)
BEGIN
  DECLARE column_count INT DEFAULT 0;
  SELECT COUNT(*) INTO column_count
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = p_table
    AND COLUMN_NAME = p_column;
  IF column_count = 0 THEN
    SET @wc_ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE wc_stmt FROM @wc_ddl;
    EXECUTE wc_stmt;
    DEALLOCATE PREPARE wc_stmt;
  END IF;
END//
DELIMITER ;

CALL `wc_20261104_add_column_if_missing`('products', 'is_archived', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL `wc_20261104_add_column_if_missing`('categories', 'is_archived', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL `wc_20261104_add_column_if_missing`('admins', 'password_change_required', 'TINYINT(1) NOT NULL DEFAULT 1');
CALL `wc_20261104_add_column_if_missing`('admins', 'last_totp_counter', 'BIGINT UNSIGNED DEFAULT NULL');
DROP PROCEDURE IF EXISTS `wc_20261104_add_column_if_missing`;

DROP PROCEDURE IF EXISTS `wc_20261104_preserve_order_items`;
DELIMITER //
CREATE PROCEDURE `wc_20261104_preserve_order_items`()
BEGIN
  DECLARE fk_name VARCHAR(64) DEFAULT NULL;
  DECLARE fk_delete_rule VARCHAR(30) DEFAULT NULL;
  DECLARE fk_count INT DEFAULT 0;
  SELECT kcu.CONSTRAINT_NAME, rc.DELETE_RULE INTO fk_name, fk_delete_rule
  FROM information_schema.KEY_COLUMN_USAGE kcu
  JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
    ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
    AND rc.TABLE_NAME = kcu.TABLE_NAME
    AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
  WHERE kcu.TABLE_SCHEMA = DATABASE()
    AND kcu.TABLE_NAME = 'order_items'
    AND kcu.COLUMN_NAME = 'product_id'
    AND kcu.REFERENCED_TABLE_NAME = 'products'
  LIMIT 1;
  IF fk_name IS NOT NULL AND fk_delete_rule <> 'SET NULL' THEN
    SET @wc_ddl = CONCAT('ALTER TABLE `order_items` DROP FOREIGN KEY `', fk_name, '`');
    PREPARE wc_stmt FROM @wc_ddl;
    EXECUTE wc_stmt;
    DEALLOCATE PREPARE wc_stmt;
    SET fk_name = NULL;
  END IF;
  ALTER TABLE `order_items` MODIFY COLUMN `product_id` INT DEFAULT NULL;
  SELECT COUNT(*) INTO fk_count
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'order_items'
    AND CONSTRAINT_NAME = 'fk_order_items_product'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY';
  IF fk_count = 0 THEN
    ALTER TABLE `order_items`
      ADD CONSTRAINT `fk_order_items_product`
      FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL;
  END IF;
END//
DELIMITER ;

CALL `wc_20261104_preserve_order_items`();
DROP PROCEDURE IF EXISTS `wc_20261104_preserve_order_items`;
