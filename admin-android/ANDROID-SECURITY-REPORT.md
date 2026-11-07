# ANDROID-SECURITY-REPORT.md — Wonderful Collection Admin App

## Security Audit Report
1. **Token Security:** Tokens are stored using `EncryptedSharedPreferences` (AES-256 GCM/SIV) backed by Android Keystore.
2. **Network Transport:** Release builds strictly enforce HTTPS. Debug builds permit local HTTP endpoints via `network_security_config.xml`.
3. **App Integrity:** R8 minification and obfuscation enabled for release builds.
4. **Data Privacy:** `allowBackup="false"` prevents extraction via adb backup.
5. **No Hardcoded Secrets:** Zero credentials or tokens in source code or resources.
