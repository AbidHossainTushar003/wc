# Wonderful Collection security, readiness, and SEO audit

**Audit date:** 2026-11-04
**Phase:** 1-3 — implementation and deployment in progress; the latest static accessibility/layout hotfix is deployed, and remaining production checks are listed below.
**Working branch:** `audit/phase0-security-seo-2026-11-04`

## Detected stack

- **Storefront:** static HTML, CSS, and vanilla JavaScript; no frontend framework or package manifest.
- **API:** PHP 8.x REST-style endpoints, hosted on cPanel shared hosting.
- **Database:** MySQL/MariaDB through PDO in production; an explicitly gated SQLite development fallback is present.
- **Authentication:** bearer tokens stored as hashes in SQL tables; admin/customer tokens are handled by PHP endpoints.
- **Mobile:** native Android application in Kotlin, built with Gradle.
- **Payments:** Cash on Delivery and manually verified bKash/Nagad/Rocket transfers. No payment-gateway SDK or webhook integration was detected.
- **Local-only development:** Node.js `server.js` and `dev-data.json`; these are not the production runtime.

## Dependency vulnerability scan

- No `package.json`/lockfile, Python dependency manifest, or PHP Composer manifest/lockfile was found; npm/pip/Composer audit commands therefore do not apply.
- Resolved the Android release and unit-test Maven dependency graphs with Gradle and queried OSV for **131 resolved Maven coordinates**. No advisories were returned for those resolved dependencies.
- Separately queried the Android build-plugin coordinates. OSV reported **GHSA-r937-wjx7-w2jp / CVE-2026-53914** for `org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.10`: unsafe build-cache deserialization can allow code execution; the advisory lists versions before `2.4.20-Beta1` as affected. Its CVSS vector requires local access, high attack complexity, and high privileges; treat as **Medium** supply-chain risk. The separate Kotlin Gradle plugin was removed in favor of AGP 9.4.1's built-in Kotlin support; an OSV query for AGP 9.4.1 returned no advisory.
- `:app:assembleDebug` passed after the Android plugin migration. Existing Gradle deprecation/configuration warnings remain.

## Security review finding

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟠 HIGH | `web/api/orders.php`; `web/js/admin.js` | 77-85, 115, 210-214; 213-218, 376-384 | Public checkout persists customer-controlled order fields that admin HTML rendering interpolates into `innerHTML`, creating stored XSS in the admin panel. | 9/10 |

## Coverage checklist

Status definitions: **Done** = source evidence supports the control; **Partial** = a control exists but has material gaps or deployment verification is outstanding; **Missing** = not found; **N/A** = the feature does not exist and the reason is stated.

| ID | Status | File(s) | Risk | Planned fix / follow-up |
|---|---|---|---|---|
| S1 | Done | `web/js/store.js`; `admin-android/app/src/main/java/store/wonderfulcollection/admin/data/api/ApiClient.kt` | Low | No third-party API keys were found in the reviewed frontend/client source. Keep credentials server-side if a paid provider is added. |
| S2 | Partial | `web/api/config.php`; `web/api/config.local.php`; `deploy/config.local.php.template`; `.gitignore` | Med | Retain private server config, add documented environment/config template and fail-fast validation; ignore `.env*` while explicitly allowing `.env.example`; remove secret-like production defaults. |
| S3 | Partial | `.gitignore`; historical `AUDIT-REPORT.md` revisions; `web/api/config.local.php` | High | Rotate the database credential that appeared in local Git history. Do not rewrite history; ensure local config, SQLite, `.env`, Android SDK properties, and generated output stay excluded. Previous GitHub push attempts were denied and the remote advertised no branches. |
| S4 | Done | `web/api/auth.php`; `web/api/products.php`; `web/api/orders.php`; `web/api/categories.php`; `web/api/coupons.php`; `web/api/customers.php`; `web/api/inventory.php`; `web/api/reports.php`; `web/api/settings.php` | Low | Admin write/data routes use bearer-token checks. Preserve the explicitly public catalog, tracking, coupon-validation, and checkout surfaces and test the route matrix. |
| S5 | Done | `web/api/*.php`; `web/api/db.php` | Low | Protected admin and customer routes validate tokens. Add regression tests for every route/method and documented public exceptions. |
| S6 | Partial | `web/api/db.php`; `web/api/orders.php`; `database.sql` | Med | Customer order ownership is checked; admin role data is not used for fine-grained permissions. Enforce role checks before adding roles beyond the single administrator. |
| S7 | Partial | `web/api/orders.php`; `web/api/products.php`; `web/api/categories.php`; `web/api/coupons.php`; `web/api/settings.php` | High | Checkout validates required fields, quantities, zones, and email, but several fields/admin CRUD inputs lack explicit bounds and type validation. Add shared field-level validation. |
| S8 | Done | `web/js/admin.js`; `web/js/store.js`; `web/*.html` | High | Escaped API-derived text and attribute values, restricted image URLs, and made numeric handler values explicit across reviewed dynamic renderers. Re-run syntax and browser regression checks. |
| S9 | Done | `web/api/*.php` | Low | Reviewed database queries use PDO prepared statements; dynamic column/order choices are allowlisted. Add tests that guard this invariant. |
| S10 | Partial | `database.sql`; `web/api/db.php`; `CPANEL_DEPLOYMENT_GUIDE.md` | High | MySQL has no native row-level security in this setup; preserve application ownership checks. The guide limits the application user to SELECT/INSERT/UPDATE/DELETE after schema import; verify actual production grants manually. |
| S11 | Partial | `web/api/db.php`; `web/api/auth.php`; `web/api/orders.php`; `web/api/coupons.php`; `web/api/track.php` | High | Login, registration, reset/verification, checkout, coupon validation, and tracking have code-side limits; general public catalog reads still rely on host-level capacity/WAF controls. Verify behavior and tune limits in production. |
| S12 | N/A | No paid external API integration found | Low | No paid API or metered provider is currently integrated; add per-user/period spend and usage caps before introducing one. |
| S13 | Partial | `web/api/product-images.php`; `web/assets/products/.htaccess` | Med | Admin-only upload checks JPEG content, size, and count and uses random names; verify host execution blocking and filesystem permissions. Keep only the public product images needed by the storefront. |
| S14 | Done | `web/api/db.php`; `web/api/config.php` | Low | State-changing auth uses explicit bearer headers rather than ambient PHP session cookies; retain strict origin policy and cover token handling in XSS remediation/tests. |
| S15 | Done | `web/api/config.php` | Low | CORS is restricted to the configured storefront origin, with no wildcard production origin found. Verify the deployed origin matches exactly. |
| S16 | Partial | `web/.htaccess`; `verify.md`; cPanel Domains; ChepHost ticket `FPB-032495`; `admin-android/app/src/main/AndroidManifest.xml`; `admin-android/app/build.gradle.kts` | High | Android release manifest now disallows cleartext traffic (debug allows it for local development). Server-side enforcement remains unresolved: fresh direct HTTP requests (including `curl --noproxy "*"` and cache-busting queries) return 200 stale HTML from Nginx for `/` and `/api/products`, not a 301, despite cPanel Force HTTPS Redirect On. Do not send bearer tokens over HTTP. |
| S17 | Partial | `web/.htaccess` | Med | Deployed enforced CSP and `frame-ancestors 'none'`; live responses confirm CSP, HSTS, and `X-Frame-Options: DENY`. `unsafe-inline` remains necessary for current inline scripts/styles; migrate those to hashes/nonces for a strict policy. |
| S18 | N/A | `web/api/db.php`; `web/js/store.js`; `web/js/admin.js` | Med | PHP authentication does not use cookies; bearer tokens are used instead. Review browser token storage as part of XSS remediation. |
| S19 | Partial | `web/api/config.php`; `web/api/db.php`; cPanel PHP configuration | Med | API responses hide database details, but production `display_errors=Off` is not explicitly enforced in source. Confirm production PHP error display is disabled and server-side logging is safe. |
| S20 | Partial | `web/api/config.php`; `web/api/db.php`; `web/api/auth.php`; `web/api/orders.php` | Med | Added redacted event records for failed auth, denied access, rate limits, and privileged order/payment status updates; use persistent structured audit storage only if retention/monitoring requirements are defined. |
| S21 | Partial | `web/api/orders.php`; `web/api/settings.php`; `database.sql` | High | No gateway/webhook was found; mobile transfers stay pending manual verification and COD is supported. Preserve server-side pending status, constrain payment-state transitions, and add signature/amount/currency/idempotency checks only if a gateway is selected. |
| S22 | Partial | `web/api/auth.php`; `web/api/db.php`; `web/api/orders.php` | Med | Redacted error-log security events now cover auth failures, access denials, rate limiting, and admin order/payment status changes; no durable, searchable audit table or alerting exists. |
| P1 | Done | `web/api/auth.php`; `web/js/store.js`; `web/profile.html` | Med | Customer logout now revokes the bearer token server-side and clears local state; admin logout remains server-revoked. |
| P2 | Partial | `web/forgot-password.html`; `web/reset-password.html`; `web/api/auth.php`; `database.sql`; `database-migrations/2026-11-04-password-reset-tokens.sql` | High | Deployed hashed one-time tokens, expiry, password-update invalidation, and request/consume limits; applied the additive migration after a full cPanel backup. Verified mail delivery and PHP integration tests remain manual. |
| P3 | Partial | `web/api/auth.php`; `web/login.html`; `web/verify-email.html`; `web/resend-verification.html`; `database.sql`; `database-migrations/2026-11-04-password-reset-tokens.sql` | Med | Deployed email verification/resend; applied the migration and confirmed existing customer accounts have verification rows marked verified. Configure the sender and verify outbound mail delivery. |
| P4 | Partial | `web/shop.html`; `web/product.html`; `web/*.html`; `web/js/store.js`; `web/js/admin.js` | Low | Added accessible skeleton loading states for catalog and product detail; standardize loading states for remaining async customer/admin actions. |
| P5 | Partial | `web/*.html`; `web/js/store.js`; `web/js/admin.js` | Low | Some empty states exist, but coverage is inconsistent. Add clear empty states to catalog, search, wishlist, orders, and admin tables. |
| P6 | Partial | `web/js/store.js`; `web/js/admin.js`; `web/api/*.php` | Med | Some API errors surface as toasts; standardize actionable, non-sensitive server/client error responses and retry behavior. |
| P7 | Partial | `web/checkout.html`; `web/login.html`; `web/forgot-password.html`; `web/api/*.php` | Med | Checkout has server-side validation; cover all forms and mirror constraints server-side, including bounds and field lengths. |
| P8 | Partial | `deploy/backup-mysql.sh`; `CPANEL_DEPLOYMENT_GUIDE.md`; cPanel Backup | High | Added private-path MySQL dump/compression verification script and cPanel restore/scheduling steps. Confirmed cPanel lists `backup-11.4.2026_16-02-46_wonderfu.tar.gz` as available at 2026-11-04 16:02; keep it private. cPanel states full backups cannot be restored through its interface. A restore drill and private scheduled backups remain outstanding. |
| P9 | Partial | `web/css/style.css`; `web/*.html` | Med | Responsive styles exist and cart/checkout were previously checked at 375px; perform a full-page/device-width audit across all routes and interactions. |
| P10 | Done | `web/404.html`; `web/.htaccess` | Low | Custom 404 is wired. Verify actual hosting errors and ensure server/API failures are also user-safe. |
| P11 | Missing | `web/*.html`; `web/js/` | Low | No analytics integration or consent-aware measurement was found. Select a privacy-respecting provider and implement consent rules only if required. |
| P12 | Missing | `web/api/*.php`; `web/js/` | Med | No error-tracking integration was found. Select/configure a provider and redact PII, tokens, and payment details. |
| P13 | Partial | `web/privacy.html` | Low | Updated the policy for password hashes, verification/reset email, account deletion/order retention, and security logs; owner/legal review and confirmation of the published contact mailbox remain. |
| P14 | Partial | `web/terms.html` | Low | Terms page exists; owner/legal review is needed to confirm current order, payment, cancellation, and delivery behavior. |
| P15 | Done | `web/profile.html`; `web/api/auth.php` | High | Added password-confirmed account deletion, token revocation, and order-contact anonymization while preserving financial/order item records. |
| P16 | Partial | `web/login.html`; `web/verify-email.html`; account pages | Low | Registration now explains required email verification and provides resend/sign-in paths; a broader first-order onboarding flow remains. |
| E1 | Partial | `web/api/sitemap.php`; `web/.htaccess`; `web/robots.txt` | Med | Added an XML sitemap endpoint that enumerates public static pages and current products/categories. Verify on cPanel and submit to Search Console. |
| E2 | Done | `web/robots.txt` | Med | Added crawl rules for the API without listing or revealing admin/private route names. |
| E3 | Partial | `web/admin.html`; account/order/private pages | Med | Added `noindex,nofollow` to admin and private account/checkout flows. Recheck all rendered routes and crawler behavior. |
| E4 | Partial | `web/*.html`; dynamic product/category routes | Med | Added canonicals to main public static pages and runtime product/category canonicals; extend and validate metadata across all public routes. |
| E5 | Partial | `web/*.html`; `web/product.html`; `web/category.html` | Med | Static titles are distinct; product and category titles now update from catalog data. Search and rendered-page title coverage still need crawler validation. |
| E6 | Partial | `web/*.html`; `web/product.html`; `web/category.html` | Med | Added descriptions to main informational/catalog pages and runtime product/category pages. Complete metadata audit for every public page. |
| E7 | Done | `web/*.html` | Med | The current static scan finds exactly one H1 per HTML page, including the login and dynamic product/category templates. |
| E8 | Done | `web/*.html` | Low | Corrected heading-level jumps across checkout, contact, legal pages, admin forms, homepage footer, product details, search empty state, and tracking results without changing visual styling. |
| E9 | Done | `web/*.html`; `web/js/store.js`; `web/js/admin.js` | Med | Static pages have alt attributes and dynamic catalog/admin/customer images also render with meaningful or intentionally empty decorative alt text. |
| E10 | Partial | `web/index.html`; `web/product.html`; `web/category.html` | Med | Added Organization, dynamic Product/Offer, and dynamic Breadcrumb JSON-LD. Validate rendered structured data with Google's rich-results tools. |
| E11 | Done | `web/*.html` | Low | Static same-site links resolve to existing local files; preserve descriptive internal links for crawlable public content. |
| E12 | Partial | `web/*.html`; generated API content | Med | Static local links passed a target-existence check; external and dynamically generated links were not live-checked. Add automated link checks and review external destinations. |
| E13 | Partial | `web/assets/`; `web/*.html`; `web/js/store.js` | Med | Image files are sparse/placeholders; no complete modern-format, compression, lazy-loading, or explicit-dimension audit exists. Optimize owner-provided images and avoid critical hotlinks. |
| E14 | Partial | `web/*.html`; `web/css/style.css` | Med | Post-fix mobile Lighthouse scores: homepage 86/100/100/100 (CLS 0.002), shop 86/100/100/100 (CLS 0.046), and product 96/100/100/100 (CLS 0.001). Tested pages pass color contrast, button name, heading order, and label audits; console-error audits pass. The checkout URL redirects to the empty-cart page, not checkout; INP/field Core Web Vitals and desktop coverage remain unmeasured. |
| E15 | Partial | `web/product.html`; `web/category.html`; `web/.htaccess` | Low | Static page URLs are readable, but product/category identity uses query parameters and no slug-change redirect map exists. Define canonical slugs and preserve redirects for any changed paths. |
| E16 | Done | `web/*.html` | Low | Added Open Graph and Twitter card metadata to indexable public pages and dynamic product/category/search templates, including share images. Validate final previews with the deployed site. |
| E17 | Missing | `web/`; deployment instructions | Med | No Google Search Console verification token/file exists. Prepare verification instructions and sitemap submission; owner must complete account/domain verification. |
| E18 | Done | `web/llms.txt` | Low | Added a concise public-site summary and links to the shop and key policy pages. |
| E19 | Done | `SEO_BACKLINK_PLAN.md` | Low | Added a concise, legitimate local-partnership/content/outreach plan with explicit anti-spam guidance. |

## Implementation progress and constraints

- Lighthouse 13.0.1 mobile before/after: homepage 85/94/100/100 → 86/100/100/100 (CLS 0.002); shop 75/86/100/100 → 86/100/100/100 (CLS 0.247 → 0.046); product 79/73/100/100 → 96/100/100/100 (CLS 0.176 → 0.001). The checkout URL redirected to an empty cart; the cart score improved from 88/85/100/58 to 89/100/100/58 and is not a checkout result. The fixes are deployed and the color contrast, button-name, heading-order, label, and console-error audits pass on the tested routes.
- Owner authorized implementation with “start where u ended,” then requested live deployment. On 2026-11-04, the updated `web/` files were deployed to cPanel and the additive password-reset/email-verification migration was applied to the production database after a full-account cPanel backup was created in the account home directory. The private live `api/config.local.php`, `.user.ini`, and `php.ini` were preserved; the cPanel PHP error-log directives were retained in the deployed `.htaccess`. No Android APK, DNS setting, payment configuration, or GitHub branch was changed.
- Production dashboards, DNS, cPanel, payment-provider accounts, and customer data were not accessed or changed.
- Static internal-link checking found no missing local targets; it did not crawl external URLs or authenticated/private workflows.
- The stored-XSS finding was fixed by contextual output encoding and reviewed across dynamic `innerHTML` sinks. No exploit payload was submitted to production.
- Owner-authorized production order smoke test: server-calculated product price was ৳2,800 and total ৳2,880 despite client-sent price/subtotal values of ৳0.01; stock decreased from 30 to 29; tracking returned the order. The order remains Pending with a “DO NOT FULFILL” note because the admin page is signed out and normal authenticated cancellation cannot be performed yet. Order ID and customer details are not recorded here.
- The accessibility and layout hotfixes were deployed to `public_html` as static HTML/CSS only; production `api/config.local.php` and `.htaccess` were not included or changed. Both uploaded ZIPs were removed after extraction. Cache-busted HTTPS requests confirmed the deployed markers. Accessible names, contrast, heading hierarchy, and labels pass on Lighthouse's tested pages; accessible skeletons reduced shop CLS to 0.046 and product CLS to 0.001.
- Validation completed: 2 external JavaScript files and 18 inline scripts passed Node syntax checks; all 26 HTML pages have exactly one H1, no heading-level jumps, and static local links passed; the XSS escaping/image helpers passed a browser runtime check; login and verification-resend pages had no horizontal overflow at 375px; deployment ZIP content/exclusions passed; Android `:app:assembleDebug`, `:app:assembleRelease`, and `:app:testDebugUnitTest` passed (the unit-test task reported `NO-SOURCE`); merged Android manifests confirm cleartext is enabled only in debug and disabled in release; the API client sends Bearer tokens on its protected calls. The backup shell script passed `bash -n`; OSV returned no advisory for AGP 9.4.1. Latest live checks: HTTPS `/api/products` and `/api/categories` returned JSON 200; unauthenticated POST/PUT/DELETE to `/api/products` returned 401; `/data.sqlite`, `/database.sql`, and `/api/config.local.php` returned 403. The homepage browser sample had one H1, canonical and description, all six images had alt attributes, and DOMContentLoaded/load were ~726/~728 ms (not Lighthouse). PageSpeed Insights API returned 429. cPanel Backup lists the completed full-account archive `backup-11.4.2026_16-02-46_wonderfu.tar.gz`; no restore drill was performed. Latest direct and `--noproxy "*"` HTTP probes, with and without cache-busting query strings, still returned 200 stale HTML from Nginx for both `/` and `/api/products`, not a redirect. Live CSP/HSTS/X-Frame-Options headers were confirmed. PHP CLI lint, Lighthouse, real email delivery, authenticated admin/customer workflows, and a restore drill were not performed.
- A known database-password literal appears in earlier local `AUDIT-REPORT.md` revisions; rotate the corresponding database credential and do not rewrite history. A high-confidence pattern scan of 2,125 reachable Git blobs found no other credential matches. The configured GitHub remote advertised no branches and previous pushes were rejected.

The earlier validation paragraph's “Lighthouse ... not performed” note predates
the post-deployment runs recorded above. Desktop/field INP and populated-cart
checkout testing remain outstanding; the other remaining validation items in
that paragraph are still pending.

Latest HTTP retest at 2026-11-04 20:51 +06:00: direct no-proxy requests to
`http://wonderfulcollection.store/` and
`/api/products?probe=20261104` both returned HTTP 200 from Nginx with the same
cached HTML response metadata; HTTPS `/` returned HTTP 200 from LiteSpeed. The
HTTPS redirect remains a hosting-proxy issue. No credentials or bearer tokens
were sent over HTTP.

## Manual actions

1. Rotate the database password that appeared in historical local Git content; update the private cPanel `api/config.local.php` and verify the site connection. Never send the new password in chat.
2. The owner confirmed the customer phone/WhatsApp number, bKash/Nagad/Rocket receiver numbers, and public city/address; the existing storefront seeds match. Confirm that the published support/privacy email addresses are monitored.
3. Set `MAIL_FROM` to a verified sender in private `api/config.local.php` and have the host verify PHP mail delivery. Registration, verification, and password reset now depend on it.
4. The additive auth migration was applied after creating the full-account backup `backup-11.4.2026_16-02-46_wonderfu.tar.gz` in the private account home directory. cPanel lists it as available, but full backups cannot be restored through the cPanel interface; retain it and arrange a safe restore drill before relying on it.
5. Follow up on ChepHost ticket `FPB-032495` (the provider replied, but HTTP checks still fail) and ask the provider to enforce HTTP-to-HTTPS at the Nginx/cache front end. Latest direct probes with and without client proxies/cache-busting still return HTTP 200 stale HTML for pages and API paths. Verify a no-follow 301/308 `Location: https://...` for both before sending bearer tokens over HTTP. Also configure least-privilege MySQL grants, verify PHP/upload permissions, and configure/test the private backup cron.
6. Configure a verified `MAIL_FROM` sender and test PHP email delivery before relying on registration verification or password reset.
7. Choose a payment gateway only if moving beyond COD/manual mobile-money verification; complete provider onboarding, webhook secret provisioning, and dashboard spend/rate limits yourself.
8. Complete Search Console domain verification and sitemap submission, DNS/hosting dashboard changes, and any analytics/error-monitoring account setup when requested. Select the privacy-respecting analytics and error-tracking providers before credentials or scripts are added.

**Production gate:** The requested website deployment and additive customer-auth migration are live. A full-account cPanel backup was created before the migration. Take and verify a fresh backup before any subsequent production schema change; authenticated user/admin, outbound email, HTTP redirect, and restore-drill checks remain outstanding.
