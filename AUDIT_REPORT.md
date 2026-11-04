# Wonderful Collection — Read-only audit

## Scope and evidence

**Detected stack:** static HTML/CSS and vanilla JavaScript storefront; PHP 8 API intended for cPanel with MySQL/MariaDB; Node/JSON/optional SQLite for local development; Kotlin Android admin client. Production must not run Node. No production login, cPanel access, deployment, external request, or database write was performed.

The working tree is on `audit/phase0-security-seo-2026-11-04` and is already dirty. Existing edits and the three untracked ZIPs were left untouched. This audit adds only this report. Findings distinguish current working-tree code from the packaged ZIP where they differ. No secret values or ignored configuration contents were read or copied here.

## 1. MISSING

### M-01 — Production catalog is empty and product imagery is placeholder-only
- **Severity:** High
- **Evidence:** [database.sql](database.sql#L31) and [database.sql](database.sql#L41) define categories/products, but the SQL has no category or product seed inserts. [product-placeholder.svg](web/assets/product-placeholder.svg#L1) and [category-placeholder.svg](web/assets/category-placeholder.svg#L1) are fallback artwork; no uploaded production product/category photos were found in the repository.
- **What's wrong:** A fresh import has no sellable catalog; the storefront will show empty states or placeholders until the owner adds real products, prices, stock, categories, and images.
- **Fix:** Add owner-approved catalog records and upload optimized product/category photos before accepting orders.
- **Effort:** M

### M-02 — Admin modules depend on tables absent from the production schema
- **Severity:** High
- **Evidence:** [database.sql](database.sql#L6) through [database.sql](database.sql#L188) creates 14 tables. [accounts.php](web/api/accounts.php#L17) queries `accounts`, `transactions`, and `employee_salaries`; [sales.php](web/api/sales.php#L15) queries `office_sales`; [couriers.php](web/api/couriers.php#L47) queries `courier_parcels`; [suppliers.php](web/api/suppliers.php#L15) queries `suppliers`; [cms.php](web/api/cms.php#L13) queries `cms_pages`; [error_logs.php](web/api/error_logs.php#L19) queries `error_logs`; [audit.php](web/api/audit.php#L10) inserts `audit_logs`. None of those table names is created in `database.sql`.
- **What's wrong:** The corresponding admin screens/endpoints fail after importing the supplied schema. Audit inserts catch the missing-table error and continue, so the audit trail is silently unavailable.
- **Fix:** Add reviewed MySQL migrations for every required table, or remove/disable those incomplete admin modules; make audit-log failure visible to administrators.
- **Effort:** L

### M-03 — Contact form reports success but sends or stores nothing
- **Severity:** High
- **Evidence:** [contact.html](web/contact.html#L113) prevents submission, displays a success alert at line 115, and resets the form; no request is sent to an API or email service.
- **What's wrong:** Customer inquiries are discarded while the UI promises a callback/WhatsApp response.
- **Fix:** Implement a server-side contact endpoint with validation, abuse controls, and a verified delivery channel, or replace the form with an honest direct-contact link.
- **Effort:** M

### M-04 — No order/customer notification pipeline is implemented
- **Severity:** High
- **Evidence:** [orders.php](web/api/orders.php#L280) returns the order response after commit; the order-creation path has no mail/SMS/WhatsApp delivery. Email sending exists only for account verification/reset in [auth.php](web/api/auth.php#L199) and later mail actions. [config.local.php.template](deploy/config.local.php.template#L7) requires an owner-provided sender address.
- **What's wrong:** The customer receives only the browser success screen, and the shop has no automatic new-order notification or configured transactional email assurance.
- **Fix:** Configure and test a transactional mail provider and implement owner/customer order notifications. Publish and verify SPF, DKIM, and DMARC with the mail provider.
- **Effort:** M

### M-05 — Return/refund policy has no corresponding workflow
- **Severity:** Medium
- **Evidence:** [refund-policy.html](web/refund-policy.html#L39) promises a seven-day return/exchange process and line 49 promises refunds in 2–4 business days. The order API only supports `Pending`, `Processing`, `Shipped`, `Delivered`, and `Cancelled` in [orders.php](web/api/orders.php#L315); no return request, refund approval, or refund execution endpoint was found.
- **What's wrong:** Customers are promised an operational process that the application cannot record or manage. The policy and the business's actual ability to fulfill it have not been verified.
- **Fix:** Either implement a documented return/refund workflow with an auditable status/payment process or revise the policy to match the real manual process.
- **Effort:** M

### M-06 — No installed analytics or external error-monitoring/alerting service
- **Severity:** Low
- **Evidence:** The HTML page set loads the storefront/admin scripts, e.g. [index.html](web/index.html#L360); no analytics or Sentry-style client/server integration was found. [error_tracker.php](web/api/error_tracker.php#L6) only formats a message and sends it to PHP `error_log()` at line 15; it does not transmit alerts or persist searchable events.
- **What's wrong:** There is no configured privacy-aware usage analytics, alerting, or hosted error-tracking service.
- **Fix:** Add only if the owner wants it; configure consent/privacy behavior and provider-side retention/access controls.
- **Effort:** M

### M-07 — Product review prompt has no submission feature
- **Severity:** Low
- **Evidence:** [product.html](web/product.html#L258) renders existing reviews and says “Be the first to review”; the API review table is read by [products.php](web/api/products.php#L29), but no review-submission route or form was found.
- **What's wrong:** The storefront invites an action customers cannot complete.
- **Fix:** Implement authenticated/verified-purchase reviews with moderation and input limits, or remove the invitation.
- **Effort:** M

### M-08 — Backups are documented, but scheduling and offsite execution are manual
- **Severity:** Medium
- **Evidence:** [BACKUP.md](BACKUP.md#L1) instructs an owner to make cPanel and weekly phpMyAdmin exports. [backup-mysql.sh](deploy/backup-mysql.sh) is optional and requires a host cron/shell setup; no scheduled job or offsite destination is configured in the repository.
- **What's wrong:** Documentation is useful, but it does not establish that backups run or that restores are monitored.
- **Fix:** Configure a private scheduled backup and offsite retention in cPanel/provider tooling, then periodically rehearse a restore in a separate database.
- **Effort:** M

## 2. MUST FIX BEFORE LAUNCH

The following are launch blockers or require an explicit owner decision: **M-01, M-02, M-03, M-04, D-01, D-02, D-03, B-01, B-04, B-05, B-09, S-02, S-03, S-04, S-06.** The current repository does not establish that production has the missing schema/catalog or that the live host issue is resolved.

## 3. BUGS

### B-01 — Advertised free-delivery threshold is never applied
- **Severity:** High
- **Evidence:** The SQL seeds `free_delivery_min_amount = 2000` in [database.sql](database.sql#L25), and [shipping-policy.html](web/shipping-policy.html#L62) promises free Dhaka delivery at/above ৳2,000. Checkout instead always adds the selected zone's configured fee: [orders.php](web/api/orders.php#L146) selects a fee setting and [orders.php](web/api/orders.php#L212) calculates `subtotal - discount + deliveryFee`. No runtime use of `free_delivery_min_amount` was found.
- **What's wrong:** The live server charges delivery even when the policy promises free delivery.
- **Fix:** Apply the threshold on the server to the server-calculated eligible subtotal and update the preview/policy together.
- **Effort:** S

### S-10 — Courier HMAC webhook has no replay or status-transition protection
- **Severity:** Medium
- **Evidence:** [webhook_verify.php](web/api/webhook_verify.php#L6) checks only `HMAC-SHA256(rawBody)`; [couriers.php](web/api/couriers.php#L23) accepts the signature without a timestamp/event ID, then [couriers.php](web/api/couriers.php#L35) only checks that status is a non-empty string before [couriers.php](web/api/couriers.php#L39) updates the parcel status.
- **What's wrong:** A previously signed event can be replayed, and accepted status strings are not constrained to known courier transitions. This is limited to a party able to capture/replay a valid signed request; the endpoint does not itself verify event freshness or idempotency.
- **Fix:** Require a signed timestamp/event ID, reject stale/duplicate events, validate provider status values and legal transitions, and configure a strong private webhook secret.
- **Effort:** M

### B-02 — Checkout trusts the customer's selected delivery zone
- **Severity:** Medium
- **Evidence:** [orders.php](web/api/orders.php#L112) accepts `delivery_zone` from the request and [orders.php](web/api/orders.php#L146) uses that zone to select a fee. The browser sends the selected value from [checkout.html](web/checkout.html#L320); there is no server-side validation that the delivery address actually belongs to that zone.
- **What's wrong:** A customer can select the cheaper Dhanmondi/Dhaka zone for an address outside that area. Browser geolocation is a suggestion, not proof.
- **Fix:** Confirm the zone/address before order acceptance or present a clear, owner-approved manual verification rule; do not treat client location as authoritative.
- **Effort:** M

### B-03 — Product API accepts negative regular prices
- **Severity:** Medium
- **Evidence:** [products.php](web/api/products.php#L96) only checks `empty(regular_price)`; a negative number is not empty. It is cast and stored at [products.php](web/api/products.php#L113). The PUT allowlist also accepts `regular_price` without numeric/range validation at [products.php](web/api/products.php#L138).
- **What's wrong:** A caller with an admin token can create/update a negative-priced product. Checkout correctly reads prices from MySQL, but then faithfully calculates from this invalid catalog price.
- **Fix:** Validate finite numeric prices server-side, require regular price > 0, constrain sale price to a valid range, and protect the DB with suitable checks.
- **Effort:** S

### B-04 — Order status is not a transition state machine
- **Severity:** High
- **Evidence:** [orders.php](web/api/orders.php#L315) accepts every status in the list without checking the current status. The only prohibited transition is reopening a cancelled order at [orders.php](web/api/orders.php#L353). Cancelling any other status restores all item stock at [orders.php](web/api/orders.php#L360) and [orders.php](web/api/orders.php#L376).
- **What's wrong:** An admin can cancel a delivered order and add its stock back even though it was delivered; arbitrary jumps such as Pending → Delivered are also accepted.
- **Fix:** Define and enforce explicit transitions, require a return/physical-stock decision for delivered orders, and distinguish refund/return from pre-fulfillment cancellation.
- **Effort:** M

### B-05 — Deleting a category/product can erase historic order items
- **Severity:** High
- **Evidence:** [database.sql](database.sql#L56) cascades category deletion to products; [database.sql](database.sql#L116) cascades product deletion to `order_items`; [products.php](web/api/products.php#L179) deletes products directly, and [categories.php](web/api/categories.php#L57) supports category deletion.
- **What's wrong:** Deleting a catalog entry can remove product rows from past orders and reports. Later cancellation can no longer find the order items to restore stock.
- **Fix:** Use soft deletion/archive for products/categories and preserve historical order-item snapshots; do not cascade-delete sales history.
- **Effort:** M

### B-06 — Checkout retries can create duplicate orders; cancelled orders keep consuming coupon usage
- **Severity:** Medium
- **Evidence:** [orders.php](web/api/orders.php#L212) generates a fresh random order number for every request and has no idempotency key. Coupon usage increments at [orders.php](web/api/orders.php#L271); cancellation restores product stock but never decrements coupon use in [orders.php](web/api/orders.php#L360).
- **What's wrong:** A retry after a lost response may create a second COD order, while cancelled/failed-to-fulfill orders can exhaust limited coupons permanently.
- **Fix:** Add an idempotency key with a unique DB constraint; define whether coupon use is consumed on placement, payment, or fulfillment and reverse it consistently on eligible cancellation.
- **Effort:** M

### B-07 — Admin shows success even when an order update fails
- **Severity:** Medium
- **Evidence:** [admin.js](web/js/admin.js#L577) awaits `adminFetch`, but [admin.js](web/js/admin.js#L584) alerts success without checking `response.ok` or parsing the API error.
- **What's wrong:** Reopening a cancelled order returns HTTP 409, but the UI can still claim the status changed.
- **Fix:** Check the response and display the server's error; only show success after a successful update.
- **Effort:** S

### B-08 — Checkout preview can be stale and is not confirmed against server totals
- **Severity:** Medium
- **Evidence:** Cart prices are persisted in localStorage by [store.js](web/js/store.js#L142) and [store.js](web/js/store.js#L153). Checkout renders those stored prices at [checkout.html](web/checkout.html#L216) and calculates the preview at [checkout.html](web/checkout.html#L284), while the server re-reads current DB prices at [orders.php](web/api/orders.php#L161) and places the order without a pre-commit price-change confirmation.
- **What's wrong:** Server totals are not client-trusted, which is good, but a price/stock change can make the displayed amount differ from the accepted order without an explicit confirmation step.
- **Fix:** Refresh catalog prices/stock before final submission and require the customer to confirm any changed total before creating the order.
- **Effort:** M

### B-09 — Location detection is disabled by the deployed security policy
- **Severity:** Medium
- **Evidence:** [web/.htaccess](web/.htaccess#L33) sends `Permissions-Policy: ... geolocation=()`; [web/.htaccess](web/.htaccess#L35) restricts `connect-src` to `'self'`; yet [store.js](web/js/store.js#L88) calls `navigator.geolocation` and [store.js](web/js/store.js#L100) fetches OpenStreetMap Nominatim.
- **What's wrong:** Browsers are instructed to deny geolocation and the CSP blocks the cross-origin lookup, so the location button cannot complete its intended flow.
- **Fix:** If location detection remains a feature, allow geolocation for this origin and allow only the required Nominatim origin in `connect-src`; retain the explicit consent and manual-area fallback.
- **Effort:** S

### B-10 — Login-rate-limit fallback can issue SQLite SQL on MySQL errors
- **Severity:** Low
- **Evidence:** [db.php](web/api/db.php#L474) first executes MySQL `ON DUPLICATE KEY UPDATE`; any `PDOException` enters the catch at [db.php](web/api/db.php#L481), which executes `INSERT OR REPLACE` at line 482 without checking the PDO driver.
- **What's wrong:** On a MySQL-side insert error, the fallback statement is invalid MySQL syntax and can obscure the original failure, breaking login rate-limit recording.
- **Fix:** Branch on the PDO driver before selecting SQL, and surface/log the original storage error without a syntax-incompatible retry.
- **Effort:** S

## 4. SECURITY PROBLEMS

### Admin route authentication matrix (evidence; not a finding)

The following is the **current working tree** route behavior. `requireAdminToken()` validates an `Authorization: Bearer` token against the hashed DB token and expiry in [db.php](web/api/db.php#L347). This is not a blanket claim that every route is safe; the public exceptions are listed explicitly.

| Route | Methods/actions | Authentication/evidence |
|---|---|---|
| `/api/products` | GET public; POST/PUT/DELETE admin | Method gate [products.php](web/api/products.php#L9); writes begin at lines 93, 128, 167. |
| `/api/categories` | GET public; other methods admin | [categories.php](web/api/categories.php#L9). |
| `/api/orders` | POST public checkout; GET `customer_id` requires matching customer token; other GET and PUT admin | [orders.php](web/api/orders.php#L10), customer ownership check [orders.php](web/api/orders.php#L31), checkout [orders.php](web/api/orders.php#L70), update [orders.php](web/api/orders.php#L305). |
| `/api/coupons` | POST `action=validate` public/rate-limited; admin GET and CRUD | [coupons.php](web/api/coupons.php#L62), public validation [coupons.php](web/api/coupons.php#L78), write guard [coupons.php](web/api/coupons.php#L133). |
| `/api/settings` | GET `public=1` returns allowlisted fields; all other operations admin | [settings.php](web/api/settings.php#L10), allowlist [settings.php](web/api/settings.php#L16). |
| `/api/track` | POST public; exact order/tracking identifier plus matching phone and IP rate limit | [track.php](web/api/track.php#L15), phone match [track.php](web/api/track.php#L44). |
| `/api/auth` | POST admin login is public; admin password/logout require admin token; customer profile/logout/delete require customer token; registration/reset/verification actions are public and rate-limited | [auth.php](web/api/auth.php#L28), [auth.php](web/api/auth.php#L78), [auth.php](web/api/auth.php#L122), [auth.php](web/api/auth.php#L138), [auth.php](web/api/auth.php#L156), [auth.php](web/api/auth.php#L199). |
| `/api/cms` | GET one page by slug public; other operations admin | [cms.php](web/api/cms.php#L11), [cms.php](web/api/cms.php#L22). |
| `/api/couriers` | POST webhook uses HMAC in current worktree; other methods admin | [couriers.php](web/api/couriers.php#L12), admin gate [couriers.php](web/api/couriers.php#L44). The packaged ZIP does not contain this HMAC handler; see D-01. |
| `/api/accounts`, `/api/sales`, `/api/suppliers` | GET/POST admin | [accounts.php](web/api/accounts.php#L10), [sales.php](web/api/sales.php#L10), [suppliers.php](web/api/suppliers.php#L10). |
| `/api/customers`, `/api/error_logs`, `/api/inventory`, `/api/reports` | All supported methods admin | [customers.php](web/api/customers.php#L10), [error_logs.php](web/api/error_logs.php#L9), [inventory.php](web/api/inventory.php#L10), [reports.php](web/api/reports.php#L10). |
| `/api/product-images` | POST admin | [product-images.php](web/api/product-images.php#L8). |
| `/api/health`, `/api/sitemap` | Public read endpoints | [health.php](web/api/health.php#L7), [sitemap.php](web/api/sitemap.php#L1). |

### S-02 — Login lockout is shared by every account behind one client IP
- **Severity:** Medium
- **Evidence:** [db.php](web/api/db.php#L369) hashes the literal string `'login'` for every username and pairs it with the client IP hash. Both admin and customer login use the same `isLoginRateLimited()` / `recordLoginFailure()` path; see [auth.php](web/api/auth.php#L35) and [auth.php](web/api/auth.php#L456).
- **What's wrong:** Five failed attempts from one IP can lock out all accounts from that IP, enabling targeted denial of service against an admin or shared-NAT customers. There is no separate per-account bucket.
- **Fix:** Use independent account and IP throttles with progressive backoff, avoid a hard account lockout attackers can trigger, and confirm the host's `REMOTE_ADDR` proxy configuration.
- **Effort:** M

### S-03 — Seed admin has no enforced first-login password change or MFA
- **Severity:** High
- **Evidence:** [database.sql](database.sql#L155) seeds the `admin` account. The login path accepts a valid password and issues a token at [auth.php](web/api/auth.php#L28); password changes are optional and only occur through the separate action at [auth.php](web/api/auth.php#L78). No first-login flag or 2FA path was found.
- **What's wrong:** The seeded credential can remain active indefinitely if the owner does not manually change it, and compromise of the password alone is enough to create a 12-hour admin token.
- **Fix:** Force a unique owner-set password at first login and add MFA before granting admin privileges. Do not rely on a repository-stored seed hash as the production credential.
- **Effort:** M

### S-04 — Customer bearer token is stored in localStorage for up to 30 days
- **Severity:** Medium
- **Evidence:** [auth.php](web/api/auth.php#L18) creates a 30-day customer token; login saves the full response via [login.html](web/login.html#L139) and [store.js](web/js/store.js#L156) writes it to `localStorage` as `wc_user`. Authenticated requests attach the token at [store.js](web/js/store.js#L527).
- **What's wrong:** Any same-origin script execution can read and exfiltrate the customer bearer token, which is a long-lived credential.
- **Fix:** Prefer an HttpOnly, Secure, SameSite session cookie with a CSRF strategy, or shorten/restrict bearer-token lifetime and keep it out of persistent browser storage.
- **Effort:** M

### S-05 — Role checks are not applied across admin APIs
- **Severity:** Medium
- **Evidence:** [db.php](web/api/db.php#L347) returns a role, and [accounts.php](web/api/accounts.php#L25) checks `Super Admin` only for salary reads/writes. Other admin routes call `requireAdminToken()` without role checks, e.g. [products.php](web/api/products.php#L12) and [orders.php](web/api/orders.php#L12).
- **What's wrong:** Any future staff role granted a token will receive broad super-admin access outside the two salary checks.
- **Fix:** Define permissions centrally and enforce role/permission checks on every sensitive route before adding staff accounts.
- **Effort:** M

### S-06 — Manual mobile-money references are not verified or deduplicated
- **Severity:** Medium
- **Evidence:** [orders.php](web/api/orders.php#L132) accepts a `trx_id`; [orders.php](web/api/orders.php#L215) sets MFS orders to `Pending Verification`, not `Paid`. The `orders.trx_id` column in [database.sql](database.sql#L83) has no uniqueness constraint, and no payment-provider verification endpoint was found.
- **What's wrong:** This is a manual bKash/Nagad/Rocket flow, not gateway integration. Reused/fake TrxIDs can create pending orders and reserve stock/coupons until staff notices; the server does not require a TrxID when an API caller selects an MFS method.
- **Fix:** Tell customers verification is manual, require a TrxID server-side for MFS, alert staff, check the provider transaction before marking paid, and reject duplicate TrxIDs where appropriate. Do not fulfill based on client claims.
- **Effort:** M

### S-07 — Current upload handling is substantially safer, but EXIF/orphan cleanup is missing
- **Severity:** Medium
- **Evidence:** Current [product-images.php](web/api/product-images.php#L41) uses `finfo`; it limits files to 1,500,000 bytes at line 52, checks JPEG/PNG/WebP at lines 57–68, limits each request to five at line 21, and names files with `random_bytes()` at line 82. The current [product images .htaccess](web/assets/products/.htaccess#L1) disables listing/CGI and denies PHP-family extensions.
- **What's wrong:** Uploaded image metadata is not stripped, so a supplier photo can publish embedded EXIF/GPS data. Images also remain in the public directory after later product-save failures or product deletion. The package version differs; see D-01.
- **Fix:** Strip metadata or re-encode images, delete uploads on failed product persistence, and add an admin-safe orphan cleanup path.
- **Effort:** M

### S-08 — CSP still permits inline scripts/styles
- **Severity:** Medium
- **Evidence:** [web/.htaccess](web/.htaccess#L35) contains `script-src 'self' 'unsafe-inline'` and `style-src 'self' 'unsafe-inline'`.
- **What's wrong:** If an injection bug is introduced, the policy does not block inline script execution. Current inspected product/category/coupon/customer output paths use escaping or text nodes, but that does not make `unsafe-inline` a strong mitigation.
- **Fix:** Move inline code to files or use per-response nonces/hashes; keep the allowlist as narrow as the current storefront permits.
- **Effort:** L

### S-09 — Post-deploy test script can send the admin token to any HTTPS host
- **Severity:** Medium
- **Evidence:** [post-deploy.ps1](tests/post-deploy.ps1#L2) accepts arbitrary `BaseUri`; it checks only that the scheme is HTTPS at line 10. The entered/env token is then attached to requests at lines 54–57 and the authorized checks later in the script.
- **What's wrong:** A mistyped or malicious `-BaseUri` can receive the bearer token over valid TLS. The token is not stored in a file, but target-host validation is missing.
- **Fix:** Pin the production host or require an explicit warning/confirmation for non-production hosts before reading the token.
- **Effort:** S

### Security checks verified in source

- Admin bearer tokens are random, stored as SHA-256 hashes, and checked against expiry by [auth.php](web/api/auth.php#L57) and [db.php](web/api/db.php#L347); admin logout deletes the current token at [auth.php](web/api/auth.php#L122). Password change revokes all admin tokens at [auth.php](web/api/auth.php#L97).
- Customer order listing checks token ownership at [orders.php](web/api/orders.php#L31). Tracking requires both order/tracking identifier and matching phone at [track.php](web/api/track.php#L44); its response omits customer name, phone, and address at [track.php](web/api/track.php#L104).
- Checkout derives price from DB rows at [orders.php](web/api/orders.php#L161), validates quantity 1–100 and at most 50 lines at [orders.php](web/api/orders.php#L90), and performs conditional stock decrement inside the order transaction at [orders.php](web/api/orders.php#L252). This prevents ordinary concurrent oversell; no database-concurrency test was run.
- Password reset tokens are hashed, expire after one hour, are deleted when used, and revoke customer sessions at [auth.php](web/api/auth.php#L218) and [auth.php](web/api/auth.php#L239). Email verification is required by customer login at [auth.php](web/api/auth.php#L452).
- CORS allows only `https://wonderfulcollection.store` in [config.php](web/api/config.php#L9). The customer APIs use Bearer headers rather than cookie authentication; no `session_start()`/`setcookie()` implementation was found.
- Checked product descriptions/reviews, category names, coupon codes, announcements, and customer/order fields are encoded before dynamic HTML insertion or assigned with `textContent` (examples: [product.html](web/product.html#L222), [product.html](web/product.html#L254), [admin.js](web/js/admin.js#L164), [store.js](web/js/store.js#L38)). This is a source review, not a browser-based XSS test.
- Query values in the reviewed checkout/catalog/admin endpoints are bound parameters; dynamic product update column names are allowlisted in [products.php](web/api/products.php#L138). The production schema itself is MySQL-specific and contains no SQLite-only `INSERT OR IGNORE`/`AUTOINCREMENT` syntax.

## 5. DEPLOYMENT/HOSTING PROBLEMS

### D-01 — Phase 8 ZIP does not include current uncommitted security changes
- **Severity:** Medium
- **Evidence:** `deploy/wonderful-deploy-phase8-20261104.zip` has 64 entries, `index.html` at its root, size 151,210 bytes, SHA-256 `498ED527E91F2AA2DFAE61C45D5EC89B6C44B4B904B9C4630F2B36FF01DE34CF`. The archive was extracted to a temporary directory and all 64 entries compared byte-for-byte with `HEAD`: zero differences and zero omitted tracked `web/` files. It therefore does **not** contain the working-tree edits to [couriers.php](web/api/couriers.php#L12), [product-images.php](web/api/product-images.php#L57), [settings.php](web/api/settings.php#L60), or [product images .htaccess](web/assets/products/.htaccess#L1).
- **What's wrong:** The archive lacks the current HMAC courier webhook and current announcement validation; its upload endpoint is JPEG-only (it already has finfo, random filenames, a 1.5 MB per-file limit, and the five-file cap). Its product `.htaccess` denies PHP extensions and directory listing but lacks the current explicit `php_flag engine off` directives. The ZIP is stale relative to the worktree.
- **Fix:** After owner approval and commit-plan review, rebuild the package from the approved worktree, then repeat the archive/content/hash checks. Do not assume the current ZIP contains the latest fixes.
- **Effort:** S

The working tree also contains modified deployment/docs/API/admin files, untracked `tests/`, and three untracked ZIPs. No changes were staged or committed during this audit; the three ZIPs were not modified.

### D-02 — HTTP proxy cache/redirect remains a host-level launch blocker
- **Severity:** High
- **Evidence:** Local [web/.htaccess](web/.htaccess#L5) redirects HTTPS and line 38 marks `/api/*` no-store. The owner has reported that the host Nginx proxy still serves cached HTTP 200 responses for `/` and `/api/products` and that ticket `FPB-032495` remains open. This report did not make live requests.
- **What's wrong:** A proxy response served before Apache cannot be changed by `.htaccess`. Cached HTML at `/api/products` breaks clients expecting JSON; cached catalog data can also be stale. If the proxy ever caches authenticated API responses contrary to the headers, customer/admin data exposure is an additional inferred risk.
- **Fix:** Have the host purge the domain cache, bypass cache for `/api/*`, and enforce a proxy-level 301/308 redirect. Acceptance test: `curl -I http://wonderfulcollection.store/` returns 301/308 with an HTTPS `Location`; repeat for `/api/products`.
- **Effort:** S

### D-03 — MySQL schema import and application integration are unverified
- **Severity:** Medium
- **Evidence:** [database.sql](database.sql#L6) uses MySQL/MariaDB syntax (`AUTO_INCREMENT`, InnoDB, `ENUM`, `ON UPDATE`). [db.php](web/api/db.php#L27) returns a JSON 500 when MySQL fails and `DEV_MODE` is false; SQLite creation is only entered when `DEV_MODE` is true at [db.php](web/api/db.php#L31). PHP CLI is not available in the local PATH; the MySQL client is available, but no local database import was run.
- **What's wrong:** Static inspection cannot prove import compatibility, indexes/foreign keys, PHP driver availability, or that cPanel PHP has `fileinfo`. Production config must keep `DEV_MODE=false`.
- **Fix:** Import into a disposable local/staging MySQL/MariaDB database and run API integration tests before production. Verify `pdo_mysql`, `mbstring`, `json`, and `fileinfo` in the hosting PHP selector.
- **Effort:** M

### D-04 — Local config is ignored and excluded from the ZIP, but resides under public_html
- **Severity:** Medium
- **Evidence:** `web/api/config.local.php` exists locally, is ignored by [.gitignore](.gitignore#L1), and is not tracked. [config.php](web/api/config.php#L64) loads it; root [web/.htaccess](web/.htaccess#L7) and line 17 deny direct access. The ZIP contains no `config.local.php`. [.env.example](.env.example#L1) is a template; [config.php](web/api/config.php#L54) reads process environment variables and does not parse `.env` files.
- **What's wrong:** Credentials are still inside the document root and protection depends on the host honoring `.htaccess`; the proxy/origin configuration was not verified. The file contents were intentionally not read.
- **Fix:** Store credentials outside the document root if cPanel permits; otherwise preserve the deny rule and verify direct HTTPS requests return 403/404 after deployment.
- **Effort:** M

### D-05 — SQLite fallback is development-only, but one error fallback is not driver-gated
- **Severity:** Low
- **Evidence:** Production MySQL failure returns a clean JSON 500 at [db.php](web/api/db.php#L27); the local SQLite database is created only under `DEV_MODE` at line 31. Separately, login-attempt storage tries SQLite `INSERT OR REPLACE` after any PDO failure at [db.php](web/api/db.php#L481); see B-10.
- **What's wrong:** The main fallback is safely gated, but the login error path can still attempt SQLite syntax on MySQL.
- **Fix:** Keep production `DEV_MODE=false` and driver-gate the login-attempt SQL.
- **Effort:** S

### Hosting configuration verified in source

- [web/.htaccess](web/.htaccess#L1) disables directory indexes; denies dotfiles, `.sqlite`, `.sql`, `.md`, and `config.local.php` at lines 7–17; sets X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS, CSP and API no-cache headers at lines 30–38; and defines a custom 404 at line 27.
- Actual Nginx cache behavior, `.htaccess` support, HSTS delivery, `display_errors`, PHP error-log location/access, `REMOTE_ADDR` proxy normalization, database least-privilege grants, and production HTTPS responses were not verified.

## 6. UNVERIFIED

| Item | Reason and consequence |
|---|---|
| Production MySQL import, schema/table existence, transactions, row locks, and API queries | No live/staging DB was accessed; PHP CLI is not available in the local PATH, so PHP/PDO integration tests could not run. `database.sql` is statically MySQL-oriented, but import success is not proven. |
| Production `fileinfo`, image-upload behavior, `.htaccess` enforcement, and actual PHP execution denial under `assets/products/` | No PHP CLI/hosting runtime available. The current source checks MIME/content; the older ZIP code was not executed. |
| cPanel config values and actual credential protection | `web/api/config.local.php` was deliberately not opened. Its tracking/ignore status and ZIP exclusion were checked only. |
| Real payment destinations, support number/email, address, legal details, return terms, and mail deliverability | The repository repeats `01560024777` for store contact and all three mobile-money channels, with `+880 1560-024777` in settings. Occurrences include [database.sql](database.sql#L18), [database.sql](database.sql#L26), [checkout.html](web/checkout.html#L106), [contact.html](web/contact.html#L55), [faq.html](web/faq.html#L59), [index.html](web/index.html#L48), [refund-policy.html](web/refund-policy.html#L54), and Android settings [SettingsActivity.kt](admin-android/app/src/main/java/store/wonderfulcollection/admin/presentation/settings/SettingsActivity.kt#L124). These may be real; owner confirmation is required. The address seed is only `DHAKA, BANGLADESH` at [database.sql](database.sql#L20). |
| Email recovery/verification in production | Code calls PHP `mail()` and refuses reset/register when sender configuration is absent; the sender in [config.local.php.template](deploy/config.local.php.template#L7) is a placeholder. DNS/provider delivery and mailbox ownership were not tested. |
| Live proxy cache and HTTPS redirect | The unresolved host behavior is owner-reported; this audit made no HTTP/HTTPS requests. |
| Lighthouse/Core Web Vitals, mobile layout, browser console, assistive technology, Android release signing/crashes, and live checkout | No production/browser/device test was run. No Lighthouse score is claimed. |
| Secrets in full Git history/provider dashboards, production DB grants, hosting logs, uptime/backups, DNS SPF/DKIM/DMARC, Search Console verification | Not accessible from this read-only local audit; no credentials or provider dashboards were used. |

## 7. Prioritized fix order (top 15)

1. **M-02** — Add/verify all MySQL tables required by enabled admin modules.
2. **M-01** — Populate the catalog and upload real product/category imagery.
3. **D-01** — Rebuild the deployment ZIP from the approved current source; keep old ZIPs untouched for rollback.
4. **D-02** — Resolve the proxy-level HTTPS redirect/cache ticket and verify both root and API paths.
5. **B-01** — Make server delivery-charge calculation match the advertised free-delivery policy.
6. **S-03** — Force a new admin password and add MFA before launch.
7. **S-04** — Remove long-lived customer bearer tokens from localStorage.
8. **B-05** — Prevent catalog deletion from cascading into historical order items.
9. **B-04** — Enforce a valid order state machine, especially for Delivered/Cancelled.
10. **M-03** — Stop falsely acknowledging unsent contact messages; implement a real channel.
11. **M-04** — Add owner/customer order notifications and configure verified mail delivery.
12. **S-06** — Document and secure manual MFS verification; require and deduplicate TrxIDs.
13. **B-03** — Enforce positive server-side product prices and valid sale-price bounds.
14. **B-09** — Reconcile location lookup with the geolocation policy/CSP while retaining consent.
15. **S-02** — Separate per-account and per-IP login rate limits to reduce lockout abuse.

## Verified OK (bounded static checks)

- `robots.txt` allows the public site, disallows `/api/`, and points to the sitemap at [robots.txt](web/robots.txt#L1). [sitemap.php](web/api/sitemap.php#L10) emits public product/category and policy pages without listing admin/account URLs; [llms.txt](web/llms.txt) exists.
- Checkout deliberately has `noindex, nofollow` at [checkout.html](web/checkout.html#L8); account/admin pages inspected also use noindex. The public product page updates its title, description, canonical, Open Graph, and Product/Breadcrumb JSON-LD from product data in [product.html](web/product.html#L132).
- Static scan of 26 HTML pages found no broken local `href`/`src` paths and no `<img>` without `alt`. All pages had one static H1 except `product.html`, which inserts its H1 only after JavaScript fetches product data.
- No Unsplash URL was found in the searched production/development files. The email text `example.com` appears in form placeholders and dev fixtures; demo customer/order data is in local-only [dev-data.json](dev-data.json#L262) and the explicitly gated SQLite seed in [db.php](web/api/db.php#L276), not in production `database.sql`.
- A static scan of `web/` and `admin-android/` found no common provider API-key/private-key patterns. Git history and provider dashboards were not scanned; no secret values were printed.
- The deploy ZIP contains 64 tracked `web/` files with `index.html` at its root and no `.sqlite`, `.sql`, `.md`, `config.local.php`, or obvious dev files. This is a contents check, not a claim that the ZIP matches the current worktree; see D-01.

## Testing coverage

**Automated application tests found:** none for PHP checkout/auth/stock, browser flows, or admin APIs. Android Gradle declares JUnit/Espresso dependencies in [build.gradle.kts](admin-android/app/build.gradle.kts#L61), but no corresponding test cases were found. [post-deploy.ps1](tests/post-deploy.ps1#L1) is an unrun smoke-test script; [stock-test.md](tests/stock-test.md#L1) is a manual production checklist, not an automated integration test. The test script's announcement test restores the old value in `finally`, but a response lost after a committed update can prevent its `$changedAnnouncement` flag from being set; rerun/restore manually if the script reports an ambiguous failure.

Ten tests that should exist:

1. Checkout ignores client-submitted prices/totals and calculates current catalog prices, delivery, coupon, and total.
2. Free-delivery threshold is applied exactly at/below/above the configured amount for each delivery zone.
3. Invalid/forged delivery zones and addresses cannot obtain a cheaper delivery fee.
4. Coupon expiry, minimum order, maximum discount, usage caps, cancellation reversal, and concurrent redemption.
5. Concurrent orders for the final stock unit cannot oversell; failed transactions roll back order/items/stock/coupon counters.
6. Cancellation restores stock exactly once; Delivered → Cancelled and Cancelled → Processing are rejected.
7. Product/category deletion preserves historic order items and reporting.
8. Every admin write route rejects no-token/expired/revoked tokens; role tests cover staff vs Super Admin.
9. Upload tests reject spoofed MIME, PHP renamed `.jpg`, oversized/many files, malformed images, and unsafe path input; verify EXIF policy and cleanup.
10. Login/reset/email flows cover rate-limit key isolation, reset expiry/single use/session revocation, and mail failure; MFS tests cover missing/duplicate/fake TrxIDs and manual payment status.

## One-page summary

- **Finding counts:** Critical **0** · High **9** · Medium **19** · Low **4**. Counts include findings M-01–M-08, B-01–B-10, S-02–S-10, and D-01–D-05; the authentication matrix and “Verified OK” checks are not findings.
- **Top five launch blockers:** missing production/admin schema (M-02); no real sellable catalog/photos (M-01); stale package vs current source (D-01); unresolved proxy redirect/cache issue (D-02); advertised shipping/payment behavior and unverified payment destinations (B-01, S-06, UNVERIFIED business details).
- **Owner actions:** confirm real mobile-money/contact/address/legal values; supply real product/category images and catalog data; configure private DB/mail credentials and sender DNS; arrange cPanel schema/import/backup and run post-deploy tests; approve the new archive before any deployment.
- **Host actions:** close ticket `FPB-032495` only after purging the proxy cache, bypassing `/api/*`, and passing the HTTP-to-HTTPS acceptance test.
