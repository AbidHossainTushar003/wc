-- Add coupon linkage so an eligible order cancellation can release one coupon use.
-- Run each ALTER statement separately in phpMyAdmin after backing up the database.
-- "Duplicate column" / "Duplicate key name" means that statement was already applied;
-- confirm it matches this definition and continue.
-- Rollback: restore the complete pre-migration database backup. Do not remove
-- coupon linkage from orders after the new code has been used.

ALTER TABLE `orders` ADD COLUMN `coupon_id` INT DEFAULT NULL;

ALTER TABLE `orders` ADD KEY `idx_orders_coupon_id` (`coupon_id`);

ALTER TABLE `orders` ADD CONSTRAINT `fk_orders_coupon` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE SET NULL;
