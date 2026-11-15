# Shopademia staging-first release runbook

**Release package:** build a fresh ZIP for each release; never reuse an older
dated package.
**SHA-256:** record the hash printed by `Get-FileHash` after package
verification. The package contains web files only; `index.html` is at the ZIP
root. It includes the placeholder-only `api/config.local.php.template` and
excludes `api/config.local.php`, database files, migrations, and development
files.

Do not upload any package until every staging check below passes. Never send
passwords, tokens, database credentials, or the TOTP secret in chat or commit
them to Git.

## 1. Back up production first

1. In cPanel, open **Files → Backup Wizard → Back Up → Full Backup** (or the
   equivalent **Backup** page). Save it outside `public_html` and keep an
   encrypted copy in a separate, owner-controlled location.
2. In **Databases → phpMyAdmin**, select the production database, choose
   **Export → Custom**, include structure and data, choose SQL (gzip if
   available), and save the export with the full-account backup.
3. In **Files → File Manager**, make a private copy of
   `public_html/api/config.local.php` outside the document root. Do not put
   this file in Git or the release ZIP.
4. Record the current production files and PHP version. Do not modify the live
   database or upload the release during this step.

## 2. Create staging and a separate database

1. In cPanel, use **Domains → Create A New Domain** (or **Subdomains**, if that
   is the control-panel layout) to create the staging hostname chosen by the
   owner. Set its document root to a separate directory, not
   `/home/wonderfu/public_html`.
2. Enable AutoSSL for that hostname and confirm HTTPS works before proceeding.
   The test script refuses plain HTTP and unlisted hosts.
3. Under **Databases → MySQL Databases**, create a staging database and user.
   cPanel prefixes names with `wonderfu_`; grant the staging user **ALL
   PRIVILEGES** to that staging database only.
4. In **Databases → phpMyAdmin**, export production structure/data and import
   it into the staging database. Never point staging `config.local.php` at the
   production database.
5. Set staging mail to an owner-controlled test inbox. Do not send test
   notifications to customers. Leave courier integration disabled.

## 3. Check staging schema, then migrate staging

1. Select the staging database in phpMyAdmin and run
   `tests/schema-check.sql` from the SQL tab. Review all result sets:
   - Resolve every missing table/column before continuing.
   - Confirm a unique index covers `idempotency_key`.
   - Resolve duplicate `(payment_method, trx_id)` rows before adding its unique
     index.
   - Confirm `order_items.product_id` uses `ON DELETE SET NULL`.
2. Import or paste `migrations/2026-11-04-fixes.sql` into the **staging**
   database. Run each `ALTER TABLE` statement separately. If phpMyAdmin reports
   a duplicate column, it is already present; continue. For the unique
   idempotency index, skip the statement when schema-check already shows an
   equivalent unique index. A duplicate-key error on the TrxID index requires
   resolving the duplicate records; do not ignore it.
3. Import or paste `migrations/2026-11-09-order-idempotency-fingerprint.sql`
   into the **staging** database. This additive column is required before
   deploying the updated checkout API. Existing orders remain `NULL` until a
   retry is verified from the stored order and item data; a legacy order that
   cannot be verified returns a conflict instead of a success-shaped response.
4. Verify the new column with
   `SHOW COLUMNS FROM orders LIKE 'idempotency_fingerprint';`.
5. Import `migrations/2026-11-12-consent-log.sql` into the **staging**
   database. Verify the `consent_log` table and its columns exist before
   deploying the consent receipt endpoint. Keep SQL migrations outside the
   public web document root and ZIP.
6. Import `migrations/2026-11-12-navbar-hero-slides.sql` into the **staging**
   database. Verify the `hero_slides` table and `settings.primary_nav_links`
   row exist before deploying the navbar/hero code.
7. Before applying
   `database-migrations/2026-11-13-customer-contact-preferences.sql`, run each
   of its three preflight `SELECT` queries separately against staging. Continue
   only when there are no duplicate normalized emails, duplicate normalized
   Bangladesh phones, or invalid existing phone rows. If any query returns
   rows, stop and resolve them before importing the migration; do not run the
   migration speculatively. After the private backup and clean preflight,
   import the migration and verify the new customer columns, the unique phone
   index, and the pre-existing unique email index.
8. Apply `migrations/2026-11-14-customer-feedback-notifications.sql` after
   confirming the customer preference columns, `orders`, `order_items`, and
   `admins` tables exist. Verify the four new tables and unique order-item and
   notification-event indexes.
9. After another private backup, apply
   `migrations/2026-11-15-support-chat.sql`. Verify the conversation, message,
   FAQ, and settings tables. The customer widget uses short-interval polling;
   no worker or provider credentials are required. Admin availability is
   considered current only while an authorized admin session is polling.
10. After a private backup, apply
    `migrations/2026-11-16-coupon-performance-tag.sql` to add the optional
    coupon campaign tag. Verify `coupons.tag` exists before deploying the
    updated coupon API.
11. Re-run `tests/schema-check.sql`. Continue only when the expected schema and
   indexes are present. The migration is additive; rollback is by restoring
   the full pre-migration database backup, not by guessing at reverse DDL.

## 4. Upload the release to staging

1. On Windows, build and verify a fresh package, then record its hash:

   ```powershell
   $ReleasePath = ".\deploy\wonderful-deploy-$((Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')).zip"
   .\deploy\Build-Deployment.ps1 -OutputPath $ReleasePath
   .\deploy\Verify-DeploymentPackage.ps1 -PackagePath $ReleasePath
   Get-FileHash $ReleasePath -Algorithm SHA256
   ```

   Record the generated filename and SHA-256 with the release notes. The
   verifier checks package contents and the manifest; do not upload if it
   fails.
2. In cPanel, open **Files → File Manager** and navigate to the staging
   document root. Upload the exact generated ZIP, select it,
   choose **Extract**, and extract into that document root. Confirm `index.html`
   appears directly at the root, with no extra `web/` directory.
3. The ZIP contains `api/config.local.php.template` with placeholders only;
   the template is blocked from web access. It does not contain
   `api/config.local.php`; do not overwrite or delete the staging config when
   extracting. If no staging config exists, copy or rename the template to
   `api/config.local.php` in File Manager and enter only the staging values:

   ```php
   <?php
   define('DB_HOST', 'localhost');
   define('DB_PORT', 3306);
   define('DB_NAME', 'wonderfu_<staging_database>');
   define('DB_USER', 'wonderfu_<staging_user>');
   define('DB_PASS', '<staging_database_password>');
   define('DEV_MODE', false);
   define('MAIL_FROM', '<verified_sender_address>');
   define('MAIL_TO', '<owner_controlled_staging_test_inbox>');
   define('ADMIN_TOTP_SECRET', '<locally_generated_base32_secret>');
   define('FEEDBACK_TOKEN_SECRET', '<locally_generated_64_character_hex_secret>');
   define('SITE_BASE_URL', 'https://<staging-hostname>');
   define('REQUIRE_VERIFIED_EMAIL_FOR_ORDERS', true);
   ```

   Use the real cPanel-generated DB values locally; the angle-bracket strings
   above are placeholders, not literal values. The supported config keys are
   `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DEV_MODE`, `MAIL_FROM`,
   `MAIL_TO`, `ADMIN_TOTP_SECRET`, `FEEDBACK_TOKEN_SECRET`, `SITE_BASE_URL`,
   `REQUIRE_VERIFIED_EMAIL_FOR_ORDERS`, and `COURIER_WEBHOOK_SECRET`. `DB_*` and
   `DEV_MODE` are required. `REQUIRE_VERIFIED_EMAIL_FOR_ORDERS` defaults to
   `true`; set it to `false` only if the owner explicitly chooses to allow
   unverified accounts to order. `DB_PORT` defaults to MySQL's standard port 3306
   for legacy local configuration files; environment-based configurations
   must provide it. Missing/empty required config returns a clean JSON 500
   from application APIs; `/api/health.php` reports an unconfigured database
   with HTTP 503 so deployment checks show staging is not ready.
   Missing mail settings disables store email delivery. If email delivery is
   unavailable during signup, the account remains unverified and the customer
   can use the resend flow after the verified sender is configured. **Do not
   define `COURIER_WEBHOOK_SECRET` on staging or production until a courier
   provider and shared signing secret are approved.** The courier callback
   stays disabled without it.
4. Keep `api/config.local.php` outside Git, set it to `600` or `640` if
   supported, and do not leave a backup or credentials under the public
   document root.

## 4a. Configure customer feedback notifications

1. Generate a unique 32-byte feedback signing secret locally. Do not reuse the
   admin TOTP or database password:

   ```powershell
   python -c "import secrets; print(secrets.token_hex(32))"
   ```

   Put the result in `FEEDBACK_TOKEN_SECRET` in the private API config. Set
   `SITE_BASE_URL` to the exact HTTPS staging host. Signed customer feedback
   links expire after 30 days and are bound to one delivered order/customer.
2. Set `MAIL_FROM` to a sender verified by the hosting mail service. Signup
   verification still uses the existing email-verification flow; delivery
   feedback notifications are queued and retried by the worker.
3. If enabling WhatsApp, configure `WHATSAPP_ACCESS_TOKEN`,
   `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_FEEDBACK_TEMPLATE`,
   `WHATSAPP_TEMPLATE_LANGUAGE` (for example `en`), and
   `WHATSAPP_GRAPH_API_VERSION` (default `v21.0`) in the hosting environment.
   Keep the access token private. Create and obtain approval for the
   `feedback_request` utility template with body variables `{{1}}` (order
   number) and `{{2}}` (signed feedback URL) in the same order used by the
   worker. Only customers with WhatsApp notifications enabled are queued.
4. In cPanel **Advanced → Cron Jobs**, schedule the worker every five minutes.
   Use the actual account home path and PHP CLI path shown by the host, e.g.:

   ```text
   */5 * * * * /usr/local/bin/php -q /home/<account>/public_html/api/notification-worker.php
   ```

   The worker processes at most 50 due records per run, retries failed sends
   with exponential backoff up to five attempts, and records the result in the
   admin order screen. Confirm the staging queue and provider logs before
   enabling the production cron.

## 5. Configure and enroll admin MFA before sign-in

Admin login intentionally returns **HTTP 503** until a valid
`ADMIN_TOTP_SECRET` is configured. Do not attempt admin login before this step.

1. Generate a 20-byte Base32 secret on your own Windows machine. This prints
   the secret only in your local terminal:

   ```powershell
   python -c "import base64,secrets; print(base64.b32encode(secrets.token_bytes(20)).decode().rstrip('='))"
   ```

   Copy it directly into the staging `api/config.local.php` using cPanel File
   Manager. Do not send it to the agent, save it in the repository, or put it
   in the ZIP.
2. In your authenticator app, add an account manually (no QR enrollment page
   exists). Use the account name **Shopademia Admin**, paste the
   same Base32 secret, and select time-based TOTP with six digits. Keep a
   protected offline backup of the secret.
3. Open the staging admin page over HTTPS. Sign in with the owner-held initial
   admin credentials and the current six-digit authenticator code. The seeded
   admin is required to change its password before using admin features.
   Choose a unique password of at least 14 characters in your password
   manager, complete the prompted change, then sign out and verify a fresh
   login with the new password and a new TOTP code.
4. **MFA recovery:** if the authenticator is lost, generate a new secret
   locally, replace `ADMIN_TOTP_SECRET` in the staging or production
   `api/config.local.php` through **Files → File Manager**, and enroll the new
   value in the authenticator app. Keep the existing secret/config backup
   private until the replacement login succeeds. If a device may be
   compromised, after regaining access change the admin password; the password
   change revokes that admin's existing tokens. Do not remove the MFA setting
   as a recovery shortcut.

## 6. Check PHP version, syntax, and required extensions

In cPanel, open **Software → MultiPHP Manager** and note the PHP version
assigned to the staging hostname. In **Software → Select PHP Version** (or
**MultiPHP INI Editor**), ensure `fileinfo` and `pdo_mysql` are enabled.

In **Advanced → Terminal**, use the matching cPanel EA-PHP CLI binary. Replace
`81` below with the version selected in MultiPHP Manager (for example, `82`):

```bash
EA_PHP=/opt/cpanel/ea-php81/root/usr/bin/php
"$EA_PHP" -v
"$EA_PHP" -m | grep -iE '^(fileinfo|pdo_mysql)$'
DOCROOT=/home/wonderfu/<staging_document_root>
find "$DOCROOT" -type f -name '*.php' -print0 | xargs -0 -n1 "$EA_PHP" -l
```

Confirm both `fileinfo` and `pdo_mysql` appear. Every PHP file must report
`No syntax errors detected`; stop if a module or lint check fails.

## 7. Run staging smoke and stock tests

1. From Windows PowerShell, explicitly allow only the staging hostname and run
   the post-deploy checks. Enter the staging admin bearer token at the secure
   prompt; do not put it in a file or pass it over HTTP:

   ```powershell
   $env:WC_STAGING_HOST = '<staging-hostname-only>'
   .\tests\post-deploy.ps1 -BaseUri "https://$env:WC_STAGING_HOST"
   Remove-Item Env:\WC_STAGING_HOST
   ```

   Replace the placeholder with the actual staging hostname. The script checks
   unauthenticated admin writes, public product JSON, protected files, upload
   MIME rejection, announcement escaping, and HTTP-to-HTTPS redirects for the
   selected staging host. It asks for explicit `RUN` before temporarily
   changing the staging announcement and restores the original value.
2. Complete `tests/stock-test.md` on a disposable staging product: record
   stock, place an order, verify the decrement, cancel once and verify
   restoration, cancel again and verify no second restoration, then confirm a
   cancelled order cannot be reopened.
3. Complete the checkout price-confirmation procedure in
   `tests/checkout-price-confirmation.md`, including the changed-price,
   cancellation, re-confirmation, and server-calculated total checks.
4. Fill the PASS/FAIL results in `verify.md`. Confirm admin login/password
   change, HTTPS-only behavior, images, error handling, and mail to the staging
   test inbox. Do not fulfill staging orders.

## 8. Production release (only after staging passes)

1. Make a fresh full-account backup and production database export immediately
   before the maintenance window. Keep the production `api/config.local.php`
   backed up privately.
2. Repeat the schema check and all required additive migrations against
   production, including the consent-log, navbar/hero, customer contact,
   feedback/notification, and support-chat migrations. Before
   applying `database-migrations/2026-11-13-customer-contact-preferences.sql`,
   export a private database backup, run its three duplicate/invalid-phone
   preflight queries separately, and stop if any rows are returned. Do not
   re-import `database.sql`.
3. Upload the exact staged ZIP whose recorded SHA-256 matches the verified
   release notes to
   `/home/wonderfu/public_html`; extract it there. Confirm `index.html` is at
   the web root and the archive did not overwrite
   `/home/wonderfu/public_html/api/config.local.php`.
4. Preserve production DB values and the enrolled `ADMIN_TOTP_SECRET` in
   `api/config.local.php`; keep `DEV_MODE` false and leave
   `COURIER_WEBHOOK_SECRET` undefined. Set directory permissions to `755`,
   regular files to `644`, and `config.local.php` to `600` or `640`.
5. Repeat the EA-PHP lint/module checks and the post-deploy/stock checks using
   `https://wonderfulcollection.store`. Run order-changing tests only with an
   owner-approved, clearly marked test order. Never fulfill it.
6. Do not enable HSTS until the host's HTTP-to-HTTPS redirect is verified.
   Ticket `FPB-032495` remains a host-side dependency; do not send credentials
   or tokens over HTTP.

## Rollback

Prefer the pre-release file backup and database export made in step 1. Stop
checkout/admin writes before restoring. Restore the backed-up application files
while preserving the real `api/config.local.php`, then restore permissions and
retest HTTPS, public products, and admin MFA.

The migration is additive. Leave its extra tables/columns in place when rolling
back code unless a database rollback is necessary. If restoring the database,
use the complete pre-migration export only after preserving or reconciling all
orders and other writes made since that export; restoring it will discard those
later changes. Never re-import `database.sql` over a live database.

The repository tag `deployed-2026-11-04` and the older
`deploy/wonderful-deploy-20261104.zip` are historical references, not verified
copies of the current production tree. Prefer the actual pre-release backup;
do not use an older ZIP as a rollback source until its contents are confirmed
to match the intended previous deployment.
