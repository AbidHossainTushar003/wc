-- Content, Customers, and Compliance Migration (Sprint 6)
CREATE TABLE IF NOT EXISTS `cms_pages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `slug` VARCHAR(150) UNIQUE NOT NULL,
  `title` VARCHAR(250) NOT NULL,
  `content` LONGTEXT NOT NULL,
  `meta_title` VARCHAR(250) DEFAULT NULL,
  `meta_description` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_messages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `customer_id` INT DEFAULT NULL,
  `subject` VARCHAR(200) NOT NULL,
  `message` TEXT NOT NULL,
  `channel` VARCHAR(50) DEFAULT 'SMS',
  `status` VARCHAR(50) DEFAULT 'Sent',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `error_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `level` VARCHAR(50) DEFAULT 'ERROR',
  `message` TEXT NOT NULL,
  `context` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
