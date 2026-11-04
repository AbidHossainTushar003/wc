# Wonderful Collection audit fix status

This ledger tracks findings in `AUDIT_REPORT.md`. `OPEN` means not addressed yet; `PARTIAL` identifies an owner/host blocker and explains what remains.

| ID | Status | Summary / remaining reason |
|---|---|---|
| M-01 | PARTIAL | Catalog and real product/category images require owner-provided business data and photos. The empty database catalog safely prevents checkout of nonexistent products. |
| M-02 | PARTIAL | Idempotent MySQL table migration is prepared in `migrations/2026-11-04-fixes.sql`; owner must back up, run it, and provide genuine opening balances before finance transactions are usable. |
| M-03 | OPEN | Contact submissions are currently discarded; delivery must stay disabled until verified mail configuration is provided. |
| M-04 | OPEN | Owner/customer order notifications require verified sender/recipient and DNS mail authentication. |
| M-05 | OPEN | Return/refund policy has no corresponding workflow. |
| M-06 | OPEN | Analytics and hosted error monitoring are not configured. |
| M-07 | OPEN | Product review submission feature is absent. |
| M-08 | OPEN | Backup scheduling and offsite retention require hosting setup. |
| B-01 | FIXED | API and checkout preview apply the configured free-delivery threshold to server-calculated Dhaka/Dhanmondi subtotal; outside-Dhaka fee remains. |
| B-02 | OPEN | Delivery zone is selected by the customer and not independently verified. |
| B-03 | OPEN | Product price validation is insufficient. |
| B-04 | OPEN | Order status transitions are not restricted. |
| B-05 | OPEN | Product/category deletion may cascade into order history. |
| B-06 | OPEN | Checkout idempotency and coupon-use reversal are missing. |
| B-07 | OPEN | Admin UI can report success when order updates fail. |
| B-08 | OPEN | Checkout does not confirm server-side price changes before placement. |
| B-09 | OPEN | Geolocation conflicts with the configured Permissions-Policy and CSP. |
| B-10 | OPEN | Login rate-limit fallback can run SQLite SQL after MySQL failure. |
| S-02 | OPEN | Login throttling can lock out all users behind an IP and lacks a separate account throttle. |
| S-03 | OPEN | First-login password change and MFA are not enforced. |
| S-04 | OPEN | Customer bearer token is stored in localStorage for up to 30 days. |
| S-05 | OPEN | Admin role permissions are not consistently enforced. |
| S-06 | OPEN | Manual mobile-money references are not verified or deduplicated. |
| S-07 | OPEN | Image metadata and orphaned uploads are not cleaned up. |
| S-08 | OPEN | CSP permits inline scripts and styles. |
| S-09 | OPEN | Post-deploy test script can send an admin token to any HTTPS host. |
| S-10 | OPEN | Courier webhook freshness, replay prevention, and status transitions are not enforced. |
| D-01 | OPEN | Existing deployment ZIP is stale; a fresh ZIP will be built in Batch 4. |
| D-02 | PARTIAL | HTTP redirect/proxy-cache behavior is controlled by the hosting proxy; agent cannot change host configuration. |
| D-03 | OPEN | Production MySQL import/integration has not been verified. |
| D-04 | OPEN | Local config path and deployment handling need hardening/documentation. |
| D-05 | OPEN | SQLite fallback/error behavior needs review. |

## NEEDS OWNER

- **M-01:** Provide the real sellable catalog, category images, and optimized product photographs; do not launch with placeholder listings.
- **M-02:** Back up the live database and run the migration; provide verified opening balances for each cash/bank account before recording financial transactions.
- **M-03/M-04:** Provide a verified cPanel sender and owner notification address; configure SPF, DKIM, and DMARC for the sending domain. Customer order email requires customers to supply a valid address.
- **S-03:** Provision a private TOTP secret in `api/config.local.php` and enroll the admin authenticator app before admin login can be enabled.
- **D-02:** Hosting support must purge the proxy cache, bypass `/api/*`, and enforce HTTP-to-HTTPS redirect at the proxy.
