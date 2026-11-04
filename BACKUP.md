# Production backups and post-session checklist

## cPanel account backup

Before a production database migration or other risky maintenance:

1. Sign in to cPanel and open **Files → Backup Wizard**.
2. Select **Back Up → Full Backup** (or **Download a Full Account Backup** from
   **Files → Backup** if that is the option available).
3. Use the home directory as the backup destination, not `public_html`. Start
   the backup and download the completed archive to your computer.
4. Store the archive in an encrypted location outside the website and hosting
   account, such as an encrypted external drive plus a separate encrypted
   backup location. Never put backups in Git or a web-accessible directory.

## Weekly database export

Once each week, and before any database/schema change:

1. Open **Databases → phpMyAdmin** and select the Wonderful Collection
   production database.
2. Choose **Export → Custom**. Include the table structure and data for every
   application table; use SQL format and gzip compression when offered.
3. Download the export and store it with the cPanel archive in the encrypted
   backup locations above. Use a dated filename such as
   `wonderfulcollection-db-YYYY-MM-DD.sql.gz`.
4. Keep at least eight weekly exports and three month-end exports. Periodically
   verify that an export is non-empty and can be opened; do not test restoration
   over the live database.

The optional `deploy/backup-mysql.sh` script writes a verified compressed dump
outside `public_html`. Use it only if the host supports Bash, `mysqldump`, and
`gzip`; its MySQL option file and backup directory must remain private and
outside the web root.

## Restore check

For a restore rehearsal, create a separate staging database in **cPanel →
Databases → MySQL Databases**, import the dated SQL export through
**phpMyAdmin → Import**, and verify the tables and sample records. Do not
overwrite the production database during a rehearsal. A production restore is
destructive: get owner approval first, take a fresh backup, and follow the
host's database restore procedure.

## Post-session security checklist

- Sign out of cPanel and the admin panel; close their browser sessions.
- Rotate the admin password and cPanel password to unique, strong passwords.
  Do not send either password through chat or store it in this repository.
- Confirm `web/api/config.local.php` is ignored by Git and is not tracked.
  If a real database credential is ever committed, rotate it immediately.
- Keep the cPanel backup, SQL exports, and database credentials outside
  `public_html`, Git, and shared chat.
