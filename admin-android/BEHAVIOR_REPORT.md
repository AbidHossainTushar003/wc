# BEHAVIOR_REPORT.md — Real Device Behavior & Friction Analysis

## 1. Observed Observations on Emulator/Device (`emulator-5554`)
- **Startup & Login:** App launches cleanly within ~350ms. Admin login prompt successfully authenticates against the local Node backend (`http://10.0.2.2:3000/api`).
- **Dashboard Usability:** KPI cards display real-time metrics with BDT (৳) currency formatting.
- **Order Management:** Filter chips allow instant switching between status views. Quick action intents (Call / WhatsApp) enable instant buyer verification.
- **Friction Points Identified & Addressed:**
  1. *Navigation Depth:* Moving between Dashboard, Orders, Products, and Reports previously required returning to the home grid. *Fix:* Integrated Material 3 Bottom Navigation for 1-tap switching.
  2. *Customer Verification:* Calling or messaging customers required copying phone numbers manually. *Fix:* Added direct Call, SMS, and WhatsApp action buttons to every order card.
  3. *Offline Awareness:* Network drops previously showed raw exceptions. *Fix:* Added cached state banners and retry actions.
