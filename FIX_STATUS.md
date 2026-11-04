# Wonderful Collection audit fix status

Status is based on source inspection and `deploy/wonderful-deploy-phase16-20261104.zip`.
ZIP paths below are relative to the extracted archive. A code reference can prove
implemented behavior; it cannot prove an external host setting or successful MySQL execution.

| ID | Status | ZIP evidence (`path:line`) | Verification / remaining work |
|---|---|---|---|
| M-01 | PARTIAL | `assets/product-placeholder.svg:1`; `api/products.php:47` | The catalog is still owner-provided; placeholder art remains. |
| M-02 | PARTIAL | `api/accounts.php:17`; `api/couriers.php:47` | Migration creates the missing module tables; run schema check and migration on staging/live first. |
| M-03 | PARTIAL | `api/contact.php:30-42` | Configured mail is required; owner must set verified addresses and test delivery. |
| M-04 | PARTIAL | `api/orders.php:397-411` | Mail is attempted after order commit; DNS and delivery require owner verification. |
| M-05 | OPEN | `api/orders.php:488-496` | No return/refund workflow; resolve business policy or implement one. |
| M-06 | OPEN | `api/error_tracker.php:15` | Logs locally only; no hosted alerting/analytics configured. |
| M-07 | OPEN | `product.html:266` | Review prompt remains without a submission workflow. |
| M-08 | OPEN | Archive contains no scheduled-backup implementation | Configure offsite scheduled backups and test restore outside the web package. |
| B-01 | FIXED | `api/orders.php:231-235` | Server applies free delivery from the database-calculated subtotal. |
| S-10 | OPEN | `api/couriers.php:32-40` | HMAC is checked, but timestamp/event replay protection and legal status transitions remain missing. |
| B-02 | PARTIAL | `api/orders.php:113-130` | Zone values and some address mismatches are checked; address-to-zone truth is not established. |
| B-03 | FIXED | `api/products.php:100-103`; `api/products.php:149-160` | Product price bounds are validated on create/update. |
| B-04 | FIXED | `api/orders.php:488-498`; `api/orders.php:505-524` | Order transition rules and transactional stock restore are enforced. |
| B-05 | PARTIAL | `api/products.php:202-205` | Catalog deletion archives; schema migration and live FK behavior still need staging verification. |
| B-06 | PARTIAL | `api/orders.php:138-141`; `api/orders.php:505-524` | Retry lookup exists, but coupon usage is not reversed when an order is cancelled. |
| B-07 | FIXED | `js/admin.js:587-599` | Admin checks API success before reporting an order update. |
| B-08 | PARTIAL | `api/orders.php:263-280`; `checkout.html:351-379` | Server compares the preview to its total and checkout requests confirmation before resubmitting. Browser checkout has not been exercised end-to-end, so the customer confirmation behavior remains unverified. |
| B-09 | PARTIAL | `.htaccess:33-35`; `js/store.js:76-101` | Policy and consent gating are aligned in source; a live browser check has not confirmed geolocation and the consented Nominatim request under the deployed CSP. |
| B-10 | FIXED | `api/db.php:513-551` | Login-attempt SQL is selected by PDO driver. |
| S-02 | FIXED | `api/db.php:480-510`; `api/db.php:513-551` | Hashed account and IP buckets are separate; account delay is bounded and IP lockout is separate. |
| S-03 | PARTIAL | `api/auth.php:27-40`; `api/auth.php:82-85`; `api/auth.php:130-146` | MFA is enforced and forced password change is supported; owner must configure/enroll MFA and prepare recovery. |
| S-04 | FIXED | `js/store.js:145-161` | Customer token uses session storage; legacy local-storage token is removed. |
| S-05 | OPEN | `api/db.php:369-398` | Bearer auth exists; role-specific authorization remains inconsistent. |
| S-06 | PARTIAL | `api/orders.php:160-175`; `api/orders.php:282-329` | Reused TrxID is rejected per method in API code. The required MySQL unique index is in the external migration, not the web-only ZIP; staging must apply and verify it. |
| S-07 | OPEN | `api/product-images.php:41-82` | MIME/size/random-name checks exist; EXIF stripping and orphan cleanup do not. |
| S-08 | OPEN | `.htaccess:35` | CSP still permits inline scripts/styles. |
| S-09 | PARTIAL | No corresponding file in the web-only ZIP; repository test: `tests/post-deploy.ps1:12-27` | The test script rejects unlisted hosts and passed a negative-host check, but is intentionally outside the deploy ZIP, so this fix cannot be proven from the extracted package as required. |
| D-01 | FIXED | `api/orders.php:263-280`; `.htaccess:33-38` | Phase 16 ZIP is rebuilt from the release commit and contains current code; archive contents are checked separately. |
| D-02 | PARTIAL | `api/config.php:6-11`; `.htaccess:4-6` | App emits no-store and redirects in Apache config; host proxy cache/redirect remains unverified. |
| D-03 | OPEN | `api/db.php:24-31` | Production failure is clean/fail-closed; MySQL import and integration remain untested. |
| D-04 | OPEN | `api/config.php:73-85`; `.htaccess:7-17` | Local config is denied by app rules but remains under the document root if deployed there; host enforcement is unverified. |
| D-05 | FIXED | `api/db.php:28-37`; `api/db.php:513-551` | SQLite connection fallback is gated by `DEV_MODE`; login SQL has an explicit driver branch. |

## NEEDS OWNER

- **M-01:** Provide the real catalog and product/category photos.
- **M-02 / B-05 / D-03:** Back up, run `tests/schema-check.sql`, resolve reported gaps, apply the migration on staging, and verify MySQL/PHP integration before production.
- **M-03 / M-04:** Configure verified mail sender/recipient, test mail delivery, and publish SPF/DKIM/DMARC.
- **M-05:** Decide and implement the real return/refund process.
- **M-06:** Choose privacy-appropriate analytics and error monitoring, if wanted.
- **M-07:** Decide whether to implement or remove the product review invitation.
- **M-08:** Configure scheduled offsite backups and test restoration.
- **B-02:** Confirm a safe delivery-zone verification policy; current address matching is heuristic.
- **B-06:** Decide coupon consumption on cancellation and implement reversal if policy requires it.
- **S-03:** Generate and enroll a private TOTP secret; prepare a backup authenticator/recovery procedure.
- **S-06:** Run the schema check, resolve existing duplicate references, and apply/verify the unique index on staging before production.
- **D-04:** Move config outside document root if supported, or verify direct HTTPS access is denied.

## NEEDS HOST

- **D-02:** Purge the proxy cache, bypass `/api/*`, and enforce HTTP-to-HTTPS redirection at the proxy (ticket FPB-032495).
