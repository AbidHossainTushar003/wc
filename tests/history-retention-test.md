# Historical order retention test

Run after taking a verified database backup and applying
`migrations/2026-11-04-fixes.sql` in a test database first.

1. Place an owner-approved COD test order and record its order number and product
   ID privately.
2. Archive the product from the admin UI. Confirm it no longer appears in the
   public catalog.
3. Query the order and item snapshot:

   ```sql
   SELECT o.order_number, o.order_status, oi.product_id, oi.product_name,
          oi.price, oi.quantity, oi.total
   FROM orders o
   JOIN order_items oi ON oi.order_id = o.id
   WHERE o.order_number = 'ORDER_NUMBER';
   ```

4. Confirm the item name, price, quantity, and total remain. For the API archive
   path, `product_id` remains linked to the archived row. If an owner later
   deletes the product directly in MySQL, the product reference becomes NULL
   while the historical item snapshot remains.
5. Cancel the still-pending test order once and confirm stock is restored; do
   not fulfill the order.
6. Archive the category and confirm it disappears from the public category
   list without removing product or order history.
