# Production smoke test

Run these checks after deployment. Use PowerShell from Windows; `curl.exe` avoids
PowerShell's `curl` alias.

## Public API and HTTPS

```powershell
curl.exe -i https://wonderfulcollection.store/api/products
curl.exe -i https://wonderfulcollection.store/api/categories
curl.exe -I http://wonderfulcollection.store/
```

The products and categories requests should return HTTP 200 with JSON. The HTTP
request should redirect to HTTPS.

**Deployment follow-up:** cPanel's **Domains → Force HTTPS Redirect** is now
enabled for the domain, but live HTTP probes still return HTTP 200 from an
upstream Nginx cache (including stale HTML on `/api/products`) instead of a
redirect. Do not send credentials or bearer tokens over HTTP. Repeat the HTTP
checks after the provider clears or corrects the proxy cache. This redirect is
not yet verified.

**Hosting support contacted:** ChepHost support ticket `FPB-032495` was
submitted requesting a purge/fix of the HTTP proxy cache, HTTPS redirects at
the proxy layer, and no caching for `/api/*`. The provider has replied, but
the latest checks still fail: requests with `curl.exe --noproxy "*"` return
HTTP 200 from Nginx for both `/` and `/api/products`, including with
cache-busting query strings. `/api/products` is stale HTML over HTTP, not JSON.
Follow up with the provider and do not treat this as fixed until the requests
redirect to HTTPS.

**Latest retest (2026-11-04 20:51 +06:00):** direct `curl.exe --noproxy "*"`
requests again returned HTTP 200 from Nginx for both `/` and
`/api/products?probe=20261104`, with `Content-Type: text/html`; both responses
had the same cached 34,996-byte body metadata. HTTPS `/` returned HTTP 200 from
LiteSpeed. This confirms the redirect must be corrected at the hosting proxy,
not by another storefront upload. No credentials or bearer tokens were sent
over HTTP.

## Admin API rejects requests without a token

Each request below should return HTTP 401. These calls intentionally contain
empty request bodies and must not change production data.

```powershell
curl.exe -i -X POST https://wonderfulcollection.store/api/products -H "Content-Type: application/json" --data "{}"
curl.exe -i -X PUT "https://wonderfulcollection.store/api/products?id=1" -H "Content-Type: application/json" --data "{}"
curl.exe -i -X DELETE "https://wonderfulcollection.store/api/products?id=1"
```

## Sensitive files are not publicly accessible

Each request should return HTTP 403 or 404, never file contents.

```powershell
curl.exe -i https://wonderfulcollection.store/data.sqlite
curl.exe -i https://wonderfulcollection.store/database.sql
curl.exe -i https://wonderfulcollection.store/api/config.local.php
```

## Customer account email and password flows

Before testing these flows on an existing production database, verify the
backup and apply the additive account-auth migration during an approved
maintenance window. Configure a verified `MAIL_FROM` address and confirm PHP
mail delivery first. Prefer a staging database and test inbox.

1. Register a test customer with a unique email address. The response should
   explain that email verification is required; the browser must not create an
   authenticated customer session yet.
2. Verify the email link once. It should succeed, and reusing the link should
   fail. Sign in after verification, then sign out and confirm the token is
   rejected by protected customer routes.
3. Use **Need a new email verification link?** and confirm the new link works;
   verify rate limiting returns HTTP 429 after the documented threshold.
4. Request a password reset, use the emailed one-time link, and confirm the
   old customer token is invalidated. Reuse/expired reset tokens must fail.
5. On the profile page, save profile details and delete the test account with
   password confirmation. Confirm the account is removed and historical order
   contact fields are anonymized while totals and items remain.

## Lighthouse accessibility and layout

The mobile Lighthouse baseline before the accessibility fixes was:

| Page tested | Performance | Accessibility | Best Practices | SEO | CLS |
|---|---:|---:|---:|---:|---:|
| Homepage | 85 | 94 | 100 | 100 | 0.002 |
| Shop | 75 | 86 | 100 | 100 | 0.247 |
| Product | 79 | 73 | 100 | 100 | 0.176 |
| Checkout URL | 88 | 85 | 100 | 58 | 0.003 |

After deploying the accessibility and layout fixes, mobile Lighthouse reported:

| Page tested | Performance | Accessibility | Best Practices | SEO | CLS | LCP |
|---|---:|---:|---:|---:|---:|---:|
| Homepage | 86 | 100 | 100 | 100 | 0.002 | 3.3 s |
| Shop | 86 | 100 | 100 | 100 | 0.046 | 3.2 s |
| Product | 96 | 100 | 100 | 100 | 0.001 | 2.2 s |
| Checkout URL | 89 | 100 | 100 | 58 | 0.003 | 3.0 s |

The checkout URL redirected to the empty-cart page; its score is for the cart,
not checkout. Color contrast, button names, heading order, form labels, and
console-error audits pass on the tested pages. The shop and product loading
skeletons reduced their CLS to 0.046 and 0.001. The hotfix is deployed; test
checkout with a populated cart and collect desktop/field INP data separately.

## SEO and static checks

```powershell
curl.exe -i https://wonderfulcollection.store/robots.txt
curl.exe -i https://wonderfulcollection.store/sitemap.xml
```

Confirm the sitemap is valid XML, contains only public pages/catalog entries,
and does not enumerate admin/account/order routes. Inspect public page source
for one H1, an accurate description, canonical URL, and social metadata. The
admin and account/checkout workflow pages should include `noindex`.

## Admin login and rate limiting

1. Open `https://wonderfulcollection.store/admin.html` and sign in with the
   initial admin credentials provided during setup.
2. Change the initial password immediately to a unique, strong password.
3. Sign out, then verify the new password works and the old password no longer
   works.
4. In a separate attempt, submit an incorrect password repeatedly until the
   login endpoint applies its rate limit. Stop after the rate-limit response;
   do not continue sending attempts.

Latest unauthenticated POST/PUT/DELETE checks against `/api/products` returned
401 without changing data. HTTPS GET requests to `/api/products` and
`/api/categories` returned JSON 200. The production lockout test also
passed: four invalid admin logins returned 401, and the fifth returned 429.
The test-created lockout row was cleared after verification. The seeded admin
password was reset with the owner's authorization, and a login using the new
credentials returned HTTP 200. A later sign-in attempt was rate-limited; do not
retry until the lockout expires. The owner should change the temporary password
immediately after signing in.

## Test order, stock, and tracking

**Production smoke-test result (2026-11-04):** One owner-authorized COD test
order was placed for one unit of the selected product. The request deliberately
sent a false client price/subtotal of ৳0.01; the server used the catalog price
of ৳2,800 and returned a total of ৳2,880. Stock changed from 30 to 29, and the
tracking endpoint returned the order and item successfully. The order is
Pending and explicitly marked “TEST ORDER - DO NOT FULFILL.” The admin page is
signed out, so the order still needs cancellation through the normal admin
workflow; do not dispatch it. The order number and customer contact details are
intentionally not stored in this repository.

For a future test, do not add placeholder inventory. Use only a product and
customer-controlled test contact/address explicitly approved by the owner;
order creation changes production records and stock.

1. Record the product's stock quantity in the admin panel.
2. Place a small test order through the storefront.
3. Confirm the order total reflects server-side product prices and that stock
   decreased by the ordered quantity.
4. Use the order number and the customer phone number on the tracking page and
   confirm the order status and items are returned.
5. Cancel or otherwise resolve the test order using the normal admin workflow.

## Android admin app

Before building or distributing the Android app, confirm its API base URL is
`https://wonderfulcollection.store/api`. The app must send its admin bearer
token in the `Authorization` header for protected API requests.
