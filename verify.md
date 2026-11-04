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
the proxy layer, and no caching for `/api/*`. Re-run the HTTP checks after the
provider responds; the issue remains open until those requests redirect to
HTTPS.

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

## Admin login and rate limiting

1. Open `https://wonderfulcollection.store/admin.html` and sign in with the
   initial admin credentials provided during setup.
2. Change the initial password immediately to a unique, strong password.
3. Sign out, then verify the new password works and the old password no longer
   works.
4. In a separate attempt, submit an incorrect password repeatedly until the
   login endpoint applies its rate limit. Stop after the rate-limit response;
   do not continue sending attempts.

The unauthenticated write checks passed (401). The production lockout test also
passed: four invalid admin logins returned 401, and the fifth returned 429.
The test-created lockout row was cleared after verification. The seeded admin
password was reset with the owner's authorization, and a login using the new
credentials returned HTTP 200. The owner should change that temporary password
immediately after signing in.

## Test order, stock, and tracking

The production catalog was intentionally seeded empty. Add a real product with
an available stock quantity before ordering; do not use placeholder inventory
for a customer-facing order.

The owner authorized an order test but has not provided the test product and
delivery details yet. The order-flow test remains pending because the catalog
is empty. Only proceed with the explicitly agreed test product and customer
details; do not create fake listings or use an uninvolved person's contact
information.

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
