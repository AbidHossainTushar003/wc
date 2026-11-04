# Admin MFA and forced-password test

1. Back up `api/config.local.php` privately.
2. Run `.\tests\generate-admin-totp-secret.ps1` in a local PowerShell window.
   Keep the output private; do not paste it into chat, commit it, or save it in
   the repository. Add it as `ADMIN_TOTP_SECRET` in the server's ignored
   `api/config.local.php`.
3. Add that same Base32 secret to one authenticator app as a time-based
   (30-second), 6-digit TOTP entry. Confirm the host clock is synchronized.
4. Sign in with the current admin password and authenticator code. Before the
   forced password change, verify other admin APIs return 403 even when using
   the temporary token.
5. Change to a unique password of at least 14 characters in the web admin
   password panel. Verify the app returns a fresh token and the old one no
   longer authorizes admin APIs.
6. Attempt a second login using the same still-current TOTP code; it must be
   rejected as a replay. Wait for the next code and confirm a normal login
   succeeds.
7. Leave `ADMIN_TOTP_SECRET` unset in a test configuration and confirm admin
   login returns 503 without issuing a token.

The configured secret is shared by the current single-admin deployment. Do not
create staff accounts until per-admin MFA secrets and role permissions exist.
