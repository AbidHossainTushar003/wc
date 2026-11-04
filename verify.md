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

## Phase 3: HTTP-to-HTTPS proxy retest

### Copy-ready hosting support update

> HTTP requests to `http://wonderfulcollection.store/` and
> `http://wonderfulcollection.store/api/products` are returning cached HTML
> with HTTP 200 from the Nginx proxy, while the corresponding HTTPS requests
> work. The local `.htaccess` cannot override a response served by the proxy
> cache before the request reaches the account. Please purge the proxy cache
> for `wonderfulcollection.store`, exclude `/api/*` from proxy caching, and
> enforce a 301 redirect from HTTP to HTTPS at the proxy level for the domain.
> Acceptance test: `curl -I http://wonderfulcollection.store/` must return
> HTTP 301 or 308 with an HTTPS `Location` header. Please also verify
> `/api/products` redirects and returns JSON when requested over HTTPS.

Run the local retest script from the repository root after the hosting provider
confirms the proxy change:

```powershell
.\deploy\Test-HttpsRedirect.ps1
```

Equivalent manual checks:

```powershell
curl.exe -I http://wonderfulcollection.store/
curl.exe -I http://wonderfulcollection.store/api/products
curl.exe -i https://wonderfulcollection.store/api/products
```

Both HTTP requests must return 301 or 308 and a `Location` beginning with
`https://wonderfulcollection.store/`. The HTTPS API request should return
JSON, not HTML. Do not send credentials or bearer tokens over HTTP.

### Cloudflare fallback runbook

Use this only if the hosting provider cannot correct the proxy behavior. Do not
change nameservers until you have recorded the current DNS configuration and
confirmed the mail-related records with the domain/email provider.

1. In Cloudflare, choose **Add a site**, enter `wonderfulcollection.store`,
   and review the imported DNS records against the current authoritative DNS
   zone. Preserve all A, AAAA, CNAME, MX, TXT, and verification records.
2. Keep mail-related records (especially MX and mail hostnames) **DNS only**.
   Proxy only the website hostname after confirming its origin address and
   that the origin serves the domain correctly.
3. At the domain registrar, replace the current nameservers with the two
   nameservers Cloudflare assigns. Do not delete the old DNS zone. Allow
   propagation and verify website and email DNS before continuing.
4. In Cloudflare **SSL/TLS → Overview**, select **Full (strict)** only while
   the origin has a valid certificate for the domain. Confirm **Edge
   Certificates** is active.
5. In **SSL/TLS → Edge Certificates**, enable **Always Use HTTPS**.
6. In **Caching → Cache Rules**, create a rule matching the hostname
   `wonderfulcollection.store` and URI path beginning with `/api/`, then set
   **Cache eligibility** to **Bypass cache**. Also ensure authenticated or
   other dynamic routes are not cached. Purge the Cloudflare cache after
   creating the rule.
7. Run the redirect retest script above and check the HTTPS products endpoint
   returns JSON. Fix any redirect loop or incorrect DNS/origin response before
   proceeding.
8. Enable HSTS only after both HTTP redirect checks consistently pass and
   HTTPS works for every required hostname. Start with a short max-age; do not
   enable `includeSubDomains` or preload until all subdomains are confirmed
   HTTPS-ready.

## Phase 3 checkpoint

The support update, proxy retest script, and Cloudflare fallback runbook are
prepared. The proxy redirect remains blocked on the hosting provider or the
owner's DNS changes; no production DNS, proxy, cache, or hosting settings have
been changed by this repository work.

## Phase 4: Checkout test and Lighthouse

### Manual checkout, stock, and tracking test

Do not fulfill a test order or use real mobile-money payment. The existing
production test order is still marked **DO NOT FULFILL**; resolve that order
before creating another production test. Use an owner-controlled test contact
and address, and do not record personal details or order identifiers in this
repository.

1. In the admin product/inventory screen, select an inexpensive product with
   enough stock. Record its current effective price (sale price when active,
   otherwise regular price) and stock quantity privately.
2. In a clean storefront session, add exactly one of that product to the cart.
   Continue to checkout and confirm the item, quantity, selected delivery
   area, and configured fee are correct. Use Cash on Delivery for this test.
3. Before placing the order, calculate the expected total as the catalog
   effective price times quantity, minus any deliberately applied valid
   coupon, plus the delivery fee configured for the selected area. Do not rely
   on a total or unit price edited in the browser.
4. With the owner's approval, place the test order. Record the order number
   and tracking code privately. Check the success page and then the admin
   order record: the server-calculated item price, subtotal, delivery fee,
   discount, and total should match the calculation from step 3.
5. Confirm stock decreased by exactly the ordered quantity. On
   `track-order.html`, use the order number and the same customer phone number
   to confirm the order and item appear.
6. In the admin orders screen, mark the test order **Cancelled** and confirm
   it is not shipped or fulfilled. The API should restore the order quantities
   to stock in the same database transaction as cancellation. Submit the same
   cancellation again and confirm stock does not increase a second time.
   Cancelled orders cannot be reopened, which prevents a later cancellation
   from restoring stock twice.

### Checkout indexability and Lighthouse

Checkout is a transactional page that can display a customer's cart and
delivery details; it must not appear in search results. The intentional
`noindex, nofollow` directive remains. Do not remove it to improve a Lighthouse
score.

**Mobile Lighthouse 13.6.0 on the live checkout with one cart item:** Performance
100, Accessibility 84, Best Practices 100, SEO 58; FCP 0.2 s, LCP 0.2 s, CLS
0.002. The SEO audit identified two causes: no meta description and the
intentional noindex directive. The local checkout now has a specific title and
meta description while preserving noindex. The remaining noindex SEO warning
is expected; it is not a production SEO defect.

Lighthouse also reported checkout accessibility failures on the live page:
low contrast for the Nagad label and an unlabeled delivery-area selector. The
local checkout label is explicitly associated with the selector, and the
Nagad label color was darkened to meet WCAG AA contrast. Re-run the local or
staging audit after deploying these changes; no checkout UX changes have been
deployed to production.

**Local post-fix mobile Lighthouse 13.6.0 with a one-item test cart:**
Performance 99, Accessibility 100, Best Practices 96, SEO 66; FCP 0.3 s, LCP
0.3 s, CLS 0.075. No accessibility audits failed. The SEO failure is only the
intentional noindex directive.
The Best Practices score is reduced by expected 404s for PHP API endpoints
and a production-only product image because the local preview uses Python's
static server, not the PHP/MySQL backend or the production image store. At a
375 CSS-pixel viewport, the checkout showed the test item and had no
horizontal overflow. The local test cart was isolated; no order was submitted.
Production remains unchanged until an approved deployment.

## Phase 11 post-deploy test kit

After an approved deployment, run `tests/post-deploy.ps1` from Windows
PowerShell. It reads `WC_ADMIN_TOKEN` from the process environment or prompts
securely; it never reads the token from a file and never prints it. The
announcement XSS check temporarily changes the live banner only after you type
`RUN`, pauses for a browser check, then restores the previous announcement.
If the restoration check fails, restore the prior text immediately in Admin →
Settings.

`POST /api/orders` is intentionally public for customer checkout. The script
does not expect 401 for that route; it submits an empty, invalid payload and
expects HTTP 422 (or 429 if checkout rate-limiting is already active), before
any order can be created. Order `PUT` and `DELETE` remain admin-token
protected. The HTTP redirect checks print expected host failures until ticket
`FPB-032495` is resolved.

Use `tests/stock-test.md` for the controlled order/cancellation sequence and
phpMyAdmin read-only SQL checks. Do not run that test until the existing
production test order marked **DO NOT FULFILL** has been resolved.

### Results (fill in after the tests)

| Test | PASS/FAIL | Date | Notes |
|---|---|---|---|
| GET `/api/products` returns JSON 200 |  |  |  |
| No-token admin writes return 401 |  |  |  |
| Invalid public order POST is rejected without creating an order |  |  |  |
| Sensitive files return 403/404 |  |  |  |
| `/assets/products/` has no directory listing |  |  |  |
| PHP payload uploaded as `.jpg` is rejected |  |  |  |
| Announcement renders literal text; no script executes; original restored |  |  |  |
| HTTP `/` redirects to HTTPS (ticket `FPB-032495`) |  |  |  |
| HTTP `/api/products` redirects to HTTPS (ticket `FPB-032495`) |  |  |  |
| Order reduces stock by ordered quantity |  |  |  |
| First cancellation restores stock |  |  |  |
| Repeated cancellation does not restore stock again |  |  |  |
| Cancelled order cannot be reopened |  |  |  |
