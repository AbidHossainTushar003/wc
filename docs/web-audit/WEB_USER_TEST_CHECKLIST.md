# Wonderful Collection web user-test checklist

Use staging or a local test copy with fake records. Do not place a production
order, change live stock, repeatedly probe production login limits, or delete a
real account without explicit approval and a recovery plan.

## Storefront and mobile layout

- [ ] Check homepage, shop, product, cart, checkout, tracking, and account pages
  at 320, 360, 390, and 430 CSS-pixel widths.
- [ ] Confirm no horizontal page overflow, clipped controls, or overlapping
  content at browser zoom 200%.
- [ ] Navigate the site by keyboard; check focus visibility, labels, headings,
  image alternatives, and screen-reader announcements for loading/errors.
- [ ] With an empty catalog, verify featured/new-arrival empty states and the
  category recovery path.
- [ ] With a test product, verify sold-out controls, stock caps, cart totals,
  image fallback, and removal from the cart.

## Checkout, order, and tracking

- [ ] In staging, compare the checkout preview with server-calculated prices,
  delivery, and coupon result.
- [ ] Confirm invalid zones, insufficient stock, and manipulated client totals
  are rejected without creating an incorrect order or changing stock.
- [ ] Submit a staging test order once; retry the same submission and confirm
  it does not create a duplicate.
- [ ] Confirm stock decrements once, tracking finds the test order, and status
  transitions follow the allowed workflow.
- [ ] Cancel the staging order and verify stock and coupon usage are restored
  exactly once.
- [ ] Check valid and missing/invalid order-success URLs; the latter must not
  show fabricated order details.

## Customer account

- [ ] Register with a test inbox and verify the customer cannot sign in before
  email verification.
- [ ] Verify a confirmation link once; confirm reuse/expiry is rejected.
- [ ] Sign in, update profile, inspect order history, and sign out; confirm the
  protected API rejects the revoked token.
- [ ] Request a password reset, use the one-time link, and confirm old sessions
  are invalidated.
- [ ] Test account deletion only with a disposable staging customer and confirm
  order history is anonymized as intended.

## Web administration

- [ ] Sign in using the administrator's authenticator code and complete any
  required password change.
- [ ] Confirm protected reads/writes reject missing, expired, and revoked
  tokens; confirm public catalog/tracking routes remain usable.
- [ ] Exercise product/category/order/coupon/settings workflows using
  disposable staging records, then verify audit history and error messages.
- [ ] Test incorrect credentials only up to the documented rate-limit response;
  stop immediately when limited.
- [ ] At mobile widths, confirm the authenticator field, validation feedback,
  navigation, tables, and action controls remain usable.

## Host and communications

- [ ] Verify HTTPS redirect, API rewrite, security headers, cache behavior, and
  protected config/SQL/SQLite paths on the actual web server.
- [ ] Test registration, reset, and contact email delivery with a staging
  inbox; confirm failure is surfaced without a false success message.
- [ ] Review mobile-money details, delivery estimates, contact information,
  product photos, and policy wording with the owner before launch.
- [ ] Record real-device and assistive-technology results separately from
  emulator/browser-only checks.
