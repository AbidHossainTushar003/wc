# APP_INVENTORY.md — Wonderful Collection Android Admin App

## 1. Activities & Screens
1. **`MainActivity` (`store.wonderfulcollection.admin.presentation.main.MainActivity`)**:
   - Launcher activity. Displays top bar, admin sign-in status, and the 2-column grid of 9 rounded white cards (Dashboard, Products, Categories, Orders, Customers, Coupons, Inventory, Reports, Settings). The top-bar add control opens the product creation form directly.
   - Dialogs: Admin Login prompt (username, password, and required six-digit TOTP code).
2. **`DashboardActivity` (`store.wonderfulcollection.admin.presentation.dashboard.DashboardActivity`)**:
   - Screen 1: Executive Dashboard with API-backed metrics (recorded order value, order count, average order total, registered customers, and low-stock count). Weekly trends and fulfillment performance are not provided by the current API.
3. **`ProductsActivity` (`store.wonderfulcollection.admin.presentation.products.ProductsActivity`)**:
   - Screen 2: Products Inventory management. Search bar, product listing cards, Add Product button (`+ Add`), and tap-to-edit product modal (Name, short desc, regular price, sale price, stock).
4. **`CategoriesActivity` (`store.wonderfulcollection.admin.presentation.categories.CategoriesActivity`)**:
   - Screen 3: Category listing and creation through the protected categories API.
5. **`OrdersActivity` (`store.wonderfulcollection.admin.presentation.orders.OrdersActivity`)**:
   - Screen 4: Customer Orders management. Status filter chips (All, Pending, Processing, Shipped, Delivered), real-time search, order cards with status accent lines, advance status buttons, and tap-to-edit order status dialog.
6. **`CustomersActivity` (`store.wonderfulcollection.admin.presentation.customers.CustomersActivity`)**:
   - Screen 5: Customer list, contact details, total orders, and total spent.
7. **`CouponsActivity` (`store.wonderfulcollection.admin.presentation.coupons.CouponsActivity`)**:
   - Screen 6: Promo Coupons management. Add/edit coupon modal (Code, Type, Value, Min Order, Expiry Date), delete option, and coupon listing.
8. **`InventoryActivity` (`store.wonderfulcollection.admin.presentation.inventory.InventoryActivity`)**:
   - Screen 7: Stock & Inventory management. Low-stock indicators, stock adjustment controls.
9. **`ReportsActivity` (`store.wonderfulcollection.admin.presentation.reports.ReportsActivity`)**:
   - Screen 8: API-backed order-value, order-count, average-order-total, and discount totals. Delivery performance is not provided by the current API.
10. **`SettingsActivity` (`store.wonderfulcollection.admin.presentation.settings.SettingsActivity`)**:
    - Screen 9: Store configuration, merchant details, and Backend API endpoint URL configuration.

## 2. API Endpoints Called
- `POST /api/auth?action=admin_login` (Admin authentication)
- `POST /api/auth?action=admin_logout` (Admin session revocation)
- `POST /api/auth?action=admin_change_password` (Password update)
- `GET /api/products` (Product catalog)
- `POST /api/products` (Create product)
- `PUT /api/products` (Update product)
- `DELETE /api/products` (Delete product)
- `GET /api/orders` (Order list & search)
- `PUT /api/orders` (Update order status)
- `GET /api/categories` (Category list)
- `POST /api/categories` (Create category)
- `GET /api/customers` (Customer list)
- `GET /api/coupons` (Coupon list)
- `POST /api/coupons` (Create coupon)
- `PUT /api/coupons` (Update coupon)
- `DELETE /api/coupons` (Delete coupon)
- `GET /api/inventory` (Inventory stock)
- `POST /api/inventory` (Stock adjustment)
- `GET /api/reports` (Dashboard metrics & overview)
- `GET /api/settings` (Store settings)
- `POST /api/settings` (Update settings)
- `POST /api/product-images` (Product image multi-part upload)

## 3. Storage, Permissions & Services
- **Storage:** `SecureTokenStorage` using `EncryptedSharedPreferences` (AES-256 GCM/SIV) for bearer token persistence.
- **Permissions:** `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS` (Android 13+).
- **Notifications:** `OrderNotificationHelper` (high importance channel with sound and vibration).
- **Dependencies:** AndroidX Core, AppCompat, Material Components, ConstraintLayout, Lifecycle (ViewModel/LiveData), RecyclerView, SwipeRefreshLayout, Coroutines, Security Crypto.
- **Build Variants:** Debug (allows local `10.0.2.2` / `localhost` HTTP testing) & Release (HTTPS-only enforced).
