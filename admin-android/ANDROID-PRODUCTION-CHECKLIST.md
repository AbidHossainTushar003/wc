# ANDROID-PRODUCTION-CHECKLIST.md — Wonderful Collection Admin App

## Production Readiness Checklist
- [x] **HTTPS-Only Release Traffic:** Enforced via `UrlValidator` and Network Security Config (`usesCleartextTraffic="false"` in release).
- [x] **Secure Token Storage:** Implemented `SecureTokenStorage` using `EncryptedSharedPreferences` (AES-256 GCM/SIV) backed by Android Keystore.
- [x] **Authentication & MFA:** Admin login supported with username, password, and TOTP verification.
- [x] **Server-Side Authorization:** Enforced on all backend PHP REST endpoints (`/api/`).
- [x] **R8 Minification & Resource Shrinking:** Enabled (`isMinifyEnabled = true`, `isShrinkResources = true`) with custom keep rules in `proguard-rules.pro`.
- [x] **Backup Exclusion:** `android:allowBackup="false"` in `AndroidManifest.xml` to prevent token/data extraction via adb backup.
- [x] **Unit Testing:** All 15 unit tests pass successfully.
- [ ] **Production Keystore:** Requires owner to generate a secure production release keystore (signing configuration documented).
- [ ] **Production Base URL & TLS:** Verify production backend endpoint (`https://wonderfulcollection.store/api`).
