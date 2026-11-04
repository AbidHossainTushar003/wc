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

## Test order, stock, and tracking

The production catalog was intentionally seeded empty. Add a real product with
an available stock quantity before ordering; do not use placeholder inventory
for a customer-facing order.

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
