# ANDROID-SECURITY-REPORT.md — Wonderful Collection Admin App

## Security Audit & Architecture
1. **Transport Security:** Release builds strictly communicate over HTTPS with platform trust store validation. Cleartext traffic is disabled in release (`usesCleartextTraffic="false"`).
2. **Credential Storage:** Bearer tokens are persisted exclusively using `EncryptedSharedPreferences` (AES-256 GCM/SIV) via Android Keystore. Plaintext fallback has been removed.
3. **App Integrity:** R8 obfuscation and minification protect against reverse engineering and decompilation.
4. **Data Privacy:** `allowBackup="false"` ensures no sensitive app data or cached tokens can be exported via `adb backup`.
5. **No Hardcoded Secrets:** Zero API keys, passwords, or TOTP secrets are embedded in source code, resources, or `BuildConfig`.
