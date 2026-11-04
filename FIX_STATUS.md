# Wonderful Collection audit fix status

This ledger tracks findings in `AUDIT_REPORT.md`. `OPEN` means not addressed yet; `PARTIAL` identifies an owner/host blocker and explains what remains.

| ID | Status | Summary / remaining reason |
|---|---|---|
| M-01 | PARTIAL | Catalog and real product/category images require owner-provided business data and photos. The empty database catalog safely prevents checkout of nonexistent products. |
| M-02 | PARTIAL | Idempotent MySQL table migration is prepared in `migrations/2026-11-04-fixes.sql`; owner must back up, run it, and provide genuine opening balances before finance transactions are usable. |
| M-03 | PARTIAL | Contact API validates and rate-limits submissions and sends only through configured cPanel mail; it returns 503 while sender/recipient are unset or delivery fails. Needs owner mail setup and delivery test. |
| M-04 | PARTIAL | Order creation sends owner and optional customer confirmation via cPanel `mail()` after commit; delivery is safely skipped until verified `MAIL_FROM`/`MAIL_TO` are configured. SPF/DKIM/DMARC and end-to-end delivery remain owner actions. |
| M-05 | OPEN | Return/refund policy has no corresponding workflow. |
| M-06 | OPEN | Analytics and hosted error monitoring are not configured. |
| M-07 | OPEN | Product review submission feature is absent. |
| M-08 | OPEN | Backup scheduling and offsite retention require hosting setup. |
| B-01 | FIXED | API and checkout preview apply the configured free-delivery threshold to server-calculated Dhaka/Dhanmondi subtotal; outside-Dhaka fee remains. |
| B-02 | FIXED | Delivery-zone input is validated on the server and the final fee is recomputed from the configured delivery rules; the checkout label is only a UI hint, not the source of truth. |
| B-03 | FIXED | Product API now rejects non-positive regular prices, invalid sale prices, and invalid category IDs before persisting records. |
| B-04 | FIXED | Order transitions now follow Pending → Processing → Shipped → Delivered, with cancellation only before shipment; checkout locks product and coupon rows during server-side calculation. |
| B-05 | PARTIAL | Product/category APIs now archive records; schema and idempotent migration preserve order-item snapshots with `ON DELETE SET NULL`. Owner must run the migration before deploying these API changes. |
| B-06 | FIXED | Checkout accepts an idempotency key and rejects repeat submissions; coupon usage increments only within the same transaction and is not allowed to exceed the configured cap. |
| B-07 | FIXED | Admin order updates check `rowCount()` and surface a failure instead of reporting success when the server rejects the change. |
| B-08 | FIXED | Checkout still shows a client-side preview, but the server recomputes subtotal, discount, and delivery totals and rejects mismatched or tampered requests. |
| B-09 | FIXED | Location lookup only runs after explicit user consent and uses no embedded API keys; the browser requests data from OpenStreetMap only after the user approves. |
| B-10 | FIXED | Login attempt upsert now selects SQL by PDO driver; MySQL failures do not fall through to SQLite syntax. MySQL integration remains unverified locally. |
| S-02 | FIXED | Login attempts are isolated into hashed account and IP buckets: the IP may receive a 15-minute throttle, while account-level backoff is capped at two seconds and cannot lock the account. |
| S-03 | PARTIAL | Web/API and Android login require a 6-digit TOTP; the seed admin is forced through a 15-minute scoped token to change password; codes are single-use. Admin login stays disabled until the owner adds a private `ADMIN_TOTP_SECRET` and enrolls an authenticator. |
| S-04 | OPEN | Customer bearer token is stored in localStorage for up to 30 days. |
| S-05 | OPEN | Admin role permissions are not consistently enforced. |
| S-06 | OPEN | Manual mobile-money references are not verified or deduplicated. |
| S-07 | OPEN | Image metadata and orphaned uploads are not cleaned up. |
| S-08 | OPEN | CSP permits inline scripts and styles. |
| S-09 | OPEN | Post-deploy test script can send an admin token to any HTTPS host. |
| S-10 | OPEN | Courier webhook freshness, replay prevention, and status transitions are not enforced. |
| D-01 | PARTIAL | The earlier ZIPs remain untouched and predate the committed Batch 1 fixes; a new archive including current committed fixes is deferred to Batch 4. |
| D-02 | PARTIAL | Every PHP API response now emits `Cache-Control: no-store` plus legacy no-cache headers. The host still must purge/bypass its proxy cache and enforce HTTP-to-HTTPS redirect; agent cannot change hosting proxy configuration. |
| D-03 | OPEN | Production MySQL import/integration has not been verified. |
| D-04 | OPEN | Local config path and deployment handling need hardening/documentation. |
| D-05 | OPEN | SQLite fallback/error behavior needs review. |

## NEEDS OWNER

- **M-01:** Provide the real sellable catalog, category images, and optimized product photographs; do not launch with placeholder listings.
- **M-02:** Back up the live database and run the migration; provide verified opening balances for each cash/bank account before recording financial transactions.
- **B-05:** The same migration adds archive columns and changes the historical product reference to `ON DELETE SET NULL`; run it against a backed-up database before deploying the APIs.
- **M-03/M-04:** Provide a verified cPanel sender and owner notification address; configure SPF, DKIM, and DMARC for the sending domain. Customer order email requires customers to supply a valid address.
- **S-03:** Provision a private TOTP secret in `api/config.local.php` and enroll the admin authenticator app before admin login can be enabled.
- **D-02:** Hosting support must purge the proxy cache, bypass `/api/*`, and enforce HTTP-to-HTTPS redirect at the proxy.
