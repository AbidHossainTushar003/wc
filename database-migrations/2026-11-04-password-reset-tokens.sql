-- Additive migration. Verify a database backup before applying.
CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `customer_id` INT NOT NULL,
  `token_hash` CHAR(64) UNIQUE NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_password_reset_customer_id` (`customer_id`),
  CONSTRAINT `fk_password_reset_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_email_verifications` (
  `customer_id` INT PRIMARY KEY,
  `token_hash` CHAR(64) DEFAULT NULL UNIQUE,
  `expires_at` DATETIME DEFAULT NULL,
  `verified_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_customer_email_verification_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Preserve existing account access; new registrations require email verification.
INSERT IGNORE INTO `customer_email_verifications` (`customer_id`, `verified_at`)
SELECT `id`, UTC_TIMESTAMP() FROM `customers`;
