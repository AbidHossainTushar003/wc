# ANDROID-DEPLOYMENT-GUIDE.md — Wonderful Collection Admin App

## Deployment Steps
1. **Generate Production Keystore:**
   ```powershell
   keytool -genkey -v -keystore production-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias wonderful-admin
   ```
2. **Configure Signing in `app/build.gradle.kts` (or local keystore properties):**
   ```kotlin
   signingConfigs {
       create("release") {
           storeFile = file("production-release.jks")
           storePassword = System.getenv("SIGNING_STORE_PASSWORD")
           keyAlias = System.getenv("SIGNING_KEY_ALIAS")
           keyPassword = System.getenv("SIGNING_KEY_PASSWORD")
       }
   }
   ```
3. **Build Signed Release APK/AAB:**
   ```powershell
   .\gradlew assembleRelease
   ```
4. **Deploy:** Distribute the signed release artifact securely to the shop owner or Google Play Console.
