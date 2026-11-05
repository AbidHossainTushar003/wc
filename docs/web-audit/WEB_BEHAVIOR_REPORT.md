# Wonderful Collection web behavior report

## Test boundary

Checks were performed against the local source and an isolated local PHP/MySQL
test copy populated only with fake products, customers, and orders. A temporary
router simulated extensionless API rewrites and protected-path responses.
It did not run Apache/LiteSpeed rules and it did not access or modify
production. Browser evidence is emulator/browser-only; no physical phone or
mail provider was tested.

## Observed behavior

| Flow | Result |
|---|---|
| Homepage catalog | Featured and new-arrival sections show clear, linked empty states when the test catalog has no matching products. Loading states finish and clear `aria-busy`. |
| Responsive homepage | Earlier viewport checks at 320, 360, 390, and 430 CSS pixels found no horizontal overflow. The oversized placeholder hero image and unsupported promotion claim were removed. |
| Checkout form | Visible labels are associated with checkout fields. The checkout uses server-provided catalog pricing and stock; client totals are not authoritative. |
| Pricing and stock | In the isolated MySQL test, a tampered client price was rejected with HTTP 409 and the server-calculated total; an oversell attempt was rejected and stock remained unchanged. |
| Order and tracking | Two isolated test orders reduced fake stock by the ordered quantity. Tracking returned the expected local test order/status. No production order was placed. |
| Order success page | A valid test link displayed the supplied order details; a URL without verifiable details displayed a recovery state, hid order-specific actions, and did not invent an order/tracking number. |
| Admin sign-in | The web form includes the required six-digit authenticator field and sends it with the login request. A local MFA login and forced-password-change flow passed in the isolated test. |
| Customer sign-in | The isolated fake customer signed in through the web form and reached the profile page; the page showed the profile/order area and had no horizontal overflow at 390 CSS pixels. |
| Admin mobile layout | At 320, 360, 390, and 430 CSS pixels, the signed-out authenticator field stayed visible with no page overflow. The dashboard shell was shown by a DOM-only toggle (not an authenticated session); its recent-orders table scrolled within its wrapper, with no page overflow. |
| API access control | Public product/category reads worked locally. Protected admin reads/writes rejected requests without an admin token. These checks do not prove host-level rules. |
| Mail | Checkout succeeded in the isolated test when mail was disabled. PHP mail warnings are suppressed so they cannot corrupt JSON responses; actual sender configuration and delivery are unverified. |

## Static validation

- PHP syntax validation passed for the API files present in the checkout.
- `node --check` passed for `web/js/store.js` and `web/js/admin.js`.
- Executable inline scripts parsed successfully across the 26 root HTML pages;
  JSON-LD data blocks were excluded from JavaScript parsing.
- `git diff --check` passed. Git emitted line-ending normalization warnings for
  existing worktree files; no whitespace error was reported.

## Not validated here

- Real Apache/LiteSpeed rewrite, `.htaccess` denies, TLS redirect, cache rules,
  permissions, and security headers.
- Live catalog correctness, real image availability, payment receipt,
  production admin login, or a production checkout.
- Email delivery, SMS/WhatsApp notifications, or contact-form delivery.
- Physical-device behavior, assistive-technology testing, and production
  performance under real traffic.
