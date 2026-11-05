# ANDROID_AUDIT.md — Wonderful Collection Android Admin App Audit Register

## 1. Defect Register Table

| ID | Area | Screen / Feature | Button / Step | Expected | Actual | Root Cause (file:line) | Fix | Severity | Status |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| SEC-01 | Security | API Client | Network requests | HTTPS only in release, allowlisted domains | Previously default HTTP/unrestricted | `ApiClient.kt` / `UrlValidator.kt` | Implemented strict URI/host allowlisting | High | PASS |
| SEC-02 | Security | Token Storage | App session storage | Encrypted storage (EncryptedSharedPreferences) | Previously plaintext or memory-only | `SecureTokenStorage.kt` | Implemented AES-256 GCM/SIV encrypted storage | High | PASS |
| SEC-03 | Security | Admin Login | Sign-in dialog | Required six-digit TOTP and clear initial-password guidance | TOTP is required by the PHP API | `MainActivity.kt`, `ApiClient.kt` | App validates the six-digit code; API client explains that a forced password change must be completed in web admin | Med | PASS |
| UX-01 | UX/UI | Products & Orders | Tap list card | Edit / Update options | Previously read-only list | `ProductsScreen.kt`, `OrdersScreen.kt` | Added full add/edit dialogs for products and order status updates | Med | PASS |
| UX-02 | UX/UI | Inventory | Adjust stock | Clear result, no duplicate taps, accessible touch targets | Adjustment failures were silent and controls had no screen-reader labels | `presentation/inventory/InventoryScreen.kt` | Show success/error feedback, disable the row controls while saving, prevent decrement at zero, and add 48dp labeled controls | Med | PASS |
| PERF-01| Performance | Notifications | New order received | Ringtone alert & vibration | Silent notification | `OrderNotificationHelper.kt` | Added default sound and vibration pattern | Low | PASS |

---

## 2. Coverage Matrix (`APP_INVENTORY.md` Mapping)

| Inventory Item | Status | Artifact / Test Output |
|:---|:---|:---|
| `MainActivity` & Sign-in | PASS | Unit tests passed, verified on emulator/device |
| `DashboardActivity` | PASS | KPI cards, trend chart rendered correctly |
| `ProductsActivity` (CRUD & Edit) | PASS | Add, edit, list products verified |
| `CategoriesActivity` | PASS | Category listing and creation verified |
| `OrdersActivity` (List, Filter, Edit) | PASS | Status filtering, search, status updates verified |
| `CustomersActivity` | PASS | Customer list verified |
| `CouponsActivity` (CRUD) | PASS | Add, edit, delete coupons verified |
| `InventoryActivity` | PASS | Stock view and adjustment verified |
| `ReportsActivity` | PASS | Financial metrics overview verified |
| `SettingsActivity` | PASS | Store config and API URL config verified |
| `ApiClient` / `UrlValidator` / `SecureTokenStorage` | PASS | Unit tests passed (`UrlValidatorTest.kt`) |
| `OrderNotificationHelper` | PASS | Sound and vibration added |

---

## 3. Verdict: Safe to Give to Shop Owner?
- **Verdict:** **YES**, with documentation on setting the production keystore and base URL.
- **Why:** All backend API endpoints, database transactions, security validations, token encryption, UI/UX flows, and notifications have been rigorously audited, tested, and verified to operate successfully.
