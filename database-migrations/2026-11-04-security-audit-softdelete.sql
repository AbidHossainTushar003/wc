-- Security, Audit Log, and Soft Delete Migration (Sprint 2)
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `admin_id` INT DEFAULT NULL,
  `action` VARCHAR(100) NOT NULL,
  `entity_type` VARCHAR(100) NOT NULL,
  `entity_id` INT DEFAULT NULL,
  `old_values` TEXT,
  `new_values` TEXT,
  `ip_address` VARCHAR(45) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_audit_logs_admin_id` (`admin_id`),
  INDEX `idx_audit_logs_entity` (`entity_type`, `entity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `products` ADD COLUMN IF NOT EXISTS `deleted_at` DATETIME DEFAULT NULL;
ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `deleted_at` DATETIME DEFAULT NULL;
ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `deleted_at` DATETIME DEFAULT NULL;
