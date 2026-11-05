# Wonderful Collection web inventory

## Scope

This inventory describes the current local source tree. It does not certify the
production host, its database contents, or Apache/LiteSpeed configuration.

## Runtime and structure

- Storefront: 26 standalone HTML pages with vanilla JavaScript and CSS.
- API: PHP 8.x endpoints intended for cPanel, using PDO with MySQL/MariaDB in
  production.
- Production does not run the local Node.js development server.
- Database bootstrap: root `database.sql`; it declares 23 MySQL tables.
- Admin companion: the Android app is a separate project and is not part of the
  web document root.
- The ignored `web/api/config.local.php` is a private runtime configuration. It
  was not read, copied, or included in this inventory or in web deliverables.

## Pages

| Area | Pages |
|---|---|
| Store and catalog | `index.html`, `shop.html`, `category.html`, `product.html`, `search.html` |
| Cart and orders | `cart.html`, `checkout.html`, `order-success.html`, `orders.html`, `track-order.html` |
| Customer account | `login.html`, `profile.html`, `forgot-password.html`, `reset-password.html`, `resend-verification.html`, `verify-email.html` |
| Administration | `admin.html` |
| Store information and policies | `about.html`, `contact.html`, `faq.html`, `privacy.html`, `refund-policy.html`, `shipping-policy.html`, `terms.html` |
| Error handling | `404.html` |

## Shared frontend files

- CSS: `web/css/style.css`, `web/css/homepage.css`.
- JavaScript: `web/js/store.js`, `web/js/admin.js`.
- The homepage, checkout, account, and admin documents also contain inline
  scripts; JSON-LD script blocks are data, not executable JavaScript.
- Static assets and uploaded-product image storage live under `web/assets/`.

## PHP API modules

The 29 PHP files currently present under `web/api/` include one ignored local
configuration file and 28 application/support modules:

- Storefront and order flow: `products.php`, `categories.php`, `orders.php`,
  `track.php`, `coupons.php`, `settings.php`, `locale.php`, `sitemap.php`,
  `contact.php`.
- Authentication and customer management: `auth.php`, `customers.php`.
- Admin operations: `inventory.php`, `reports.php`, `accounts.php`, `sales.php`,
  `suppliers.php`, `couriers.php`, `cms.php`, `audit.php`, `error_logs.php`,
  `product-images.php`.
- Shared runtime and safeguards: `config.php`, `db.php`, `mail.php`,
  `csv_shield.php`, `webhook_verify.php`, `error_tracker.php`, `health.php`.
- Private runtime-only file: `config.local.php` (ignored; not inspected).

## Data areas

The 23 table declarations in `database.sql` cover store configuration,
categories/products, customers and verification/session tokens, orders/items,
coupons/reviews, admin authentication, login limits/password resets, and the
accounts, sales, supplier, CMS, courier, error-log, and audit modules.

## External/runtime dependencies

- Google Fonts is a remote font dependency.
- Optional location lookup uses a third-party geocoding service only after the
  storefront's consent flow; browser/network policy and provider availability
  remain host-dependent.
- Product imagery should be served from the site's own assets or an owner-
  approved image host; critical catalog imagery must not rely on hotlinks.
- Production rewrite, security-header, cache, and protected-file behavior
  depends on the hosting web server and is not exercised by PHP's built-in
  server.
