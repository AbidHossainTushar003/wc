# Production order stock and cancellation test

This test changes a production order and stock. Take a verified database export
first, use an owner-approved test contact, and use **Cash on Delivery** only.
Do not fulfill or ship the test order. Do not put customer details, order
numbers, or bearer tokens in this repository.

Use the storefront and admin UI for all writes. Run only the SQL below in
phpMyAdmin to inspect state; do not edit stock or order status directly in SQL.

## Before placing the order

1. In the admin product list, select one in-stock test product and note its
   numeric product ID (`PRODUCT_ID`) and current stock quantity.
2. In **cPanel → Databases → phpMyAdmin**, select the production database and
   run this read-only query, replacing `PRODUCT_ID` with that ID:

   ```sql
   SELECT id, name, stock_quantity
   FROM products
   WHERE id = PRODUCT_ID;
   ```

3. Keep the returned quantity privately as `STOCK_BEFORE`. Do not select a
   product with insufficient stock or add placeholder inventory.

## Place the test order and verify the decrement

1. Place an order for exactly one unit of the selected product through the
   storefront checkout, using the approved test contact/address and Cash on
   Delivery. Record the order number privately as `ORDER_NUMBER`; do not
   fulfill it.
2. Run this read-only query, replacing both placeholders:

   ```sql
   SELECT
       o.id AS order_id,
       o.order_number,
       o.order_status,
       oi.product_id,
       SUM(oi.quantity) AS ordered_quantity,
       p.stock_quantity
   FROM orders o
   JOIN order_items oi ON oi.order_id = o.id
   JOIN products p ON p.id = oi.product_id
   WHERE o.order_number = 'ORDER_NUMBER'
     AND p.id = PRODUCT_ID
   GROUP BY o.id, o.order_number, o.order_status, oi.product_id, p.stock_quantity;
   ```

3. Confirm the order is `Pending`, `ordered_quantity` is `1`, and
   `stock_quantity` is `STOCK_BEFORE - 1`. Also confirm the order total in the
   storefront/admin is based on server-side catalog prices.

## Cancel once and verify stock restoration

1. In the admin orders screen, cancel this test order. Confirm it is not
   shipped or fulfilled.
2. Re-run the query above. Confirm `order_status` is `Cancelled` and stock is
   back to exactly `STOCK_BEFORE`.

## Cancel a second time and check idempotence

1. Submit the same cancellation again from the admin UI if that action is
   available. Otherwise, make the same admin-authorized order status request
   with `order_status` set to `Cancelled`; do not use phpMyAdmin to change it.
2. Re-run the query above. Confirm the order remains `Cancelled` and stock is
   still exactly `STOCK_BEFORE` (it must not increase again).

## Confirm a cancelled order cannot be reopened

1. Attempt to change this cancelled order back to `Processing` in the admin
   UI.
2. Confirm the UI reports that a cancelled order cannot be reopened. If you
   use the API, expect HTTP 409.
3. Re-run the query above. Confirm `order_status` is still `Cancelled` and
   stock is unchanged at `STOCK_BEFORE`.
