# cPanel deployment runbook

This package contains only the contents of `web/`; `index.html` is at the ZIP
root. It intentionally excludes database dumps and `api/config.local.php`.
Never put database passwords in chat, Git, or the ZIP.

## 1. Back up before upload

1. In cPanel, open **Files → Backup Wizard → Back Up → Full Backup** (or
   **Files → Backup → Download a Full Account Backup**, depending on the
   available cPanel layout). Save the backup outside `public_html`, then
   download a copy to an encrypted device/location.
2. Open **Databases → phpMyAdmin**, select the production database, choose
   **Export → Custom**, include structure and data, choose SQL and gzip if
   available, and download the export to the same protected backup location.
3. Keep the existing live `api/config.local.php` private and backed up outside
   `public_html`. Do not include it in Git or the deployment ZIP.

## 2. Run the live SQL migration before uploading the ZIP

Before any file upload, back up the live database and run the additive migration in
`migrations/2026-11-04-fixes.sql` against the production database. Use
**phpMyAdmin → Import** for the file or the MySQL client from cPanel Terminal.
Do not re-import `database.sql` and do not drop any tables. The migration is
idempotent and safe to re-run.

## 3. Build and verify the package on Windows

From the repository root, run:

```powershell
.\deploy\Build-Deployment.ps1 -OutputPath .\deploy\wonderful-deploy-batch4-20261104.zip
```

The script checks that the ZIP has root `index.html` and `.htaccess` and
contains no `.sqlite`, `.sql`, `.md`, or `config.local.php` files. It does not
include `server.js`, `dev-data.json`, or `admin-android`.

## 4. Upload and extract

1. In cPanel, open **Files → File Manager** and navigate to
   `/home/wonderfu/public_html`.
2. Click **Upload**, choose `wonderful-deploy-phase8-20261104.zip`, and wait
   until the upload completes.
3. Return to File Manager, select the ZIP, click **Extract**, and set the
   extraction destination to `/home/wonderfu/public_html`. Confirm that
   `index.html` appears directly in `public_html`, not inside an extra
   `web/` directory. Before confirming extraction, verify that the archive
   does not contain `api/config.local.php`; existing config must not be
   overwritten. Allow existing public files to be replaced.
4. If this is the first deployment and `api/config.local.php` does not exist,
   use **File Manager → public_html → api → + File** to create it from the
   private template kept in the repository at
   `deploy/config.local.php.template`. Edit it locally in File Manager with
   the real database values; do not send them in chat or commit them. The
   required values are `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DEV_MODE`,
   `MAIL_FROM`, `MAIL_TO`, `ADMIN_TOTP_SECRET`, and
   `COURIER_WEBHOOK_SECRET`. Keep `ADMIN_TOTP_SECRET` and
   `COURIER_WEBHOOK_SECRET` private and non-empty only after you have the real
   values from the owner/provider. The courier webhook stays disabled until
   `COURIER_WEBHOOK_SECRET` is set to a secret shared with the provider. The
   callback must send `X-Courier-Signature` with the lowercase hexadecimal
   HMAC-SHA256 of the exact raw JSON body. Confirm that signature contract with
   the provider before configuring it; never use the blank template value as a
   secret.
5. In File Manager, select the ZIP and click **Delete** after extraction and
   checks are complete.

## 5. Check files and permissions

1. In File Manager, confirm `public_html/.htaccess` exists and that
   `public_html/assets/products/.htaccess` exists. The latter must remain in
   the product image directory to prevent script execution there.
2. Set directories to `755` and regular files to `644`. Set
   `api/config.local.php` to `600` or `640` if supported by the host.
3. Do not copy the repository's placeholder config template over a working
   production config. This package deliberately excludes local credentials.

## 6. Smoke test

1. Test `https://wonderfulcollection.store/` and
   `https://wonderfulcollection.store/api/products`.
2. From Windows PowerShell, run `tests/post-deploy.ps1`. Enter the token at
   its secure prompt or set `WC_ADMIN_TOKEN` in the current process; never put
   it in a file. The temporary announcement test requires explicit `RUN`
   confirmation and restores the previous text.
3. Run the remaining checklist in `verify.md` and the stock/cancellation
   procedure in `tests/stock-test.md` only after resolving the existing test
   order marked **DO NOT FULFILL**.
4. Test HTTP redirects only after the provider confirms ticket `FPB-032495`.
   Do not send credentials or bearer tokens over HTTP.

## Rollback

Take a fresh backup before rollback. The deployed source snapshot is tagged
`deployed-2026-11-04` (commit `af9d2258bbdf85f64484f1d87e0e5f382de50530`).
The prior full package is `deploy/wonderful-deploy-20261104.zip`; it contains
the previous files with `index.html` at its root.

1. In **Files → File Manager**, make a private copy of the current
   `api/config.local.php` outside `public_html` before extracting the previous
   ZIP. That older ZIP contains a placeholder `api/config.local.php`; never
   leave that placeholder active on production.
2. Upload `wonderful-deploy-20261104.zip`, extract it to
   `/home/wonderfu/public_html`, and restore the backed-up real config file to
   `public_html/api/config.local.php`. Reapply the config permission (`600` or
   `640`) and general directory/file permissions (`755`/`644`).
3. If a rollback requires restoring database contents, stop and get owner
   approval first; use the protected pre-deployment SQL export or ask the host
   to restore the full-account backup. Do not import an old database dump
   without approval.
4. Retest HTTPS pages, the public API, and admin authentication over HTTPS.
   The tag and ZIP are rollback references only; no rollback has been made.
