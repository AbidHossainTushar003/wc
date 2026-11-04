# Checkout price-change confirmation test

Run on staging with a disposable product/order only.

1. Note the product's current price and stock, add it to the cart, and proceed to
   checkout so the page displays its preview total.
2. In a separate staging admin session, change that product's price (or change a
   staging delivery fee) before submitting checkout.
3. Submit the checkout form. It must ask you to confirm the newly calculated
   server total and must not create an order before your confirmation.
4. Choose **Cancel**. Confirm that no order was created and stock is unchanged.
5. Submit again and accept the displayed updated total. Confirm the new order's
   stored subtotal, delivery fee, discount, and total match the server
   calculation, and that stock decreases only once.
6. Repeat after changing the price a second time between confirmation and
   submission. The API must request confirmation again and must not place the
   order at the previously confirmed amount.
7. Cancel the staging order and verify stock is restored once using
   `tests/stock-test.md`.
