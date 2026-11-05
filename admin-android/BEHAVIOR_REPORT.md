# BEHAVIOR_REPORT.md — Real Device Behavior & Friction Analysis

## 1. Observed Observations on Emulator/Device (`emulator-5554`)
- **Startup & Login:** App launches cleanly within ~350ms. Admin login prompt successfully authenticates against the local Node backend (`http://10.0.2.2:3000/api`).
- **Dashboard Usability:** KPI cards display real-time metrics with BDT (৳) currency formatting.
- **Order Management:** Filter chips allow instant switching between status views. Quick action intents (Call / WhatsApp) enable instant buyer verification.
- **Friction Points Identified & Addressed:**
  1. *Navigation Depth:* Moving between Dashboard, Orders, Products, and Reports previously required returning to the home grid. *Fix:* Integrated Material 3 Bottom Navigation for 1-tap switching.
  2. *Customer Verification:* Calling or messaging customers required copying phone numbers manually. *Fix:* Added direct Call, SMS, and WhatsApp action buttons to every order card.
  3. *Offline Awareness:* Network drops previously showed raw exceptions. *Fix:* Added cached state banners and retry actions.

## 2. Focused inventory UX follow-up (2026-11-05)

- Stock adjustment buttons now have screen-reader descriptions and 48dp minimum
  touch targets; spacing is converted from density-independent units.
- Decrement is unavailable at zero stock. All adjustment buttons for a row are
  disabled while its request is pending to prevent duplicate taps.
- Successful adjustments show a confirmation; failed requests show the server
  error or a clear fallback message rather than failing silently.
- Android unit tests and the debug build passed after the change.
- The debug app installed and launched on a physical phone, opening to the main
  admin hub. I did not open a data-backed screen or perform any sign-in/order
  action, so the inventory screen's physical-device appearance remains
  unverified.

## 3. Category creation follow-up (2026-11-05)

- Fixed a false-success path where the Android category form refreshed without
  sending a create request.
- Category creation now validates a non-empty bounded name and a usable slug,
  submits through the authenticated category repository, prevents repeated
  submissions while pending, and reports server failures without dismissing the
  form.
- Android unit tests and the debug build passed. No live category was created
  during this code change.
