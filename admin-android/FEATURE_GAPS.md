# FEATURE_GAPS.md — Wonderful Collection Android Admin App

| Feature | Exists? | Why It Matters | Effort | Backend Change Needed |
|:---|:---|:---|:---|:---|
| **Push / Local Notifications** | Partial | Alerts owner instantly when a new COD order arrives | Low | None (Local polling / WorkManager + existing API) |
| **Executive Dashboard (Today/Week/Month)**| Yes | Gives shop owner immediate business health overview | Low | None (Uses existing `/api/reports`) |
| **Order Quick Actions (Call/WhatsApp/SMS)** | Missing | Essential for Bangladeshi COD order verification | Low | None (Android Intents) |
| **Payment Verification (bKash/Nagad TrxID)**| Partial | Prevents fake/duplicate mobile-money payments | Med | TrxID verification endpoint |
| **Barcode / QR Product Scanner** | Missing | Speeds up physical retail checkout and stock audits | Med | None (CameraX / ML Kit offline) |
| **Advanced Reports & CSV Export** | Partial | Track daily profit/loss and cash reconciliation | Med | Export CSV endpoint |
| **Language Switch (Bangla/English)** | Missing | Localizes admin panel for local merchants in Dhaka | Med | Local string resources |
| **Material 3 Bottom Navigation** | Partial | Provides smooth 4-5 destination switching | Med | None (UI-only) |
| **Offline-Friendly Stale Data Warnings** | Missing | Informs owner when stock/order data is cached | Low | None (UI-only timestamp) |
