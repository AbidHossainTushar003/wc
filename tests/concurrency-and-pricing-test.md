# Checkout concurrency, pricing, and tracking checks

These are production-impacting tests. Take a verified backup, use an owner-approved
test product/contact, choose Cash on Delivery, and cancel every test order without
fulfilling it. Never put customer information or tokens in this repository.

## Final-stock concurrency

1. Select a test product with exactly one unit in stock.
2. From two separate browser sessions, submit an order for that same product at
   nearly the same time.
3. Expect exactly one order to succeed and the other to receive an unavailable
   or insufficient-stock response. Confirm stock is zero, never negative, and
   only one order contains the final unit.
4. Cancel the successful test order once and confirm stock returns to one.

The checkout transaction locks product rows in ascending product-ID order with
`SELECT ... FOR UPDATE` on MySQL/MariaDB and retains the conditional stock update.

## Server-side price and fee authority

1. Record a test product's database regular/sale price, the configured delivery
   fee, free-delivery threshold, and an eligible coupon.
2. Submit checkout with deliberately incorrect client `price`, `subtotal`,
   `delivery_fee`, and `discount` values, but valid product IDs, quantities,
   selected delivery zone, and coupon code.
3. Confirm the order's item price and subtotal equal the current database
   catalog values; delivery and discount match server settings and coupon rules;
   the final total is their server calculation.
4. Confirm attempts to alter a product price after reading the storefront do
   not change the order calculation.
5. If testing coupon usage caps, submit concurrent orders using the last coupon
   use and confirm no more than the configured limit succeeds.

## Tracking privacy

1. Track a real test order using both its order/tracking identifier and the
   matching phone number.
2. Confirm the response includes order status, item summary, and total, but
   does not include customer name, phone, street address, or email.
3. Retry using a wrong phone and confirm the API returns 404 without order data.
