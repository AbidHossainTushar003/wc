# Login rate-limit isolation test

Run only against a non-production test database/account unless the owner has
approved the temporary lockout test. Do not write passwords, TOTP codes, or
bearer tokens into files or logs.

1. Make five failed sign-in attempts from one client IP using a test account.
   The IP bucket should return HTTP 429 for subsequent attempts for up to 15
   minutes.
2. From a different client IP, sign in to a valid test account. The first IP's
   failures must not block this login.
3. Generate repeated failed attempts for the same account from separate IPs.
   Confirm this adds only a bounded per-account response delay (maximum two
   seconds) and never sets an account-wide `locked_until`; a correct login must
   not be denied solely because another IP guessed that account.
4. Repeat a failed login against the MySQL/MariaDB test DB and inspect PHP
   logs. Confirm no SQLite syntax error or SQLite database file is produced.
5. Confirm rate-limit rows contain hashes only, not usernames or IP addresses.

The login-attempt persistence uses MySQL `ON DUPLICATE KEY UPDATE` only for
MySQL and SQLite `ON CONFLICT ... DO UPDATE` only for explicit development
SQLite mode. There is no cross-driver fallback after a PDO error.
