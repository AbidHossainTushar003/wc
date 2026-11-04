# 🛡️ Wonderful Collection E-Commerce Admin App — Complete Audit Checklist

This document tracks compliance and implementation coverage for all administrative security, orders, inventory, payments, customer relations, and operational reporting requirements (Phases A1-A8, O1-O7, I1-I8, M1-M4, C1-C3, R1-R7).

---

## 🔐 ADMIN SECURITY
- [x] **A1**: Admin login separate from customer login; 2FA/OTP for owner and manager roles.
- [x] **A2**: Role-based access: owner, manager, staff, with per-permission checks server-side.
- [x] **A3**: Session timeout, logout on all devices, brute-force lockout.
- [x] **A4**: Audit log: who changed price, stock, order status, refund, role or setting, with before/after values and timestamp (immutable).
- [x] **A5**: Mass-assignment protection: admin cannot set arbitrary fields (e.g. role, paid=true) through API payloads.
- [x] **A6**: CSV/Excel import and export: validate uploads, block CSV formula injection (`=`, `+`, `-`, `@`), restrict export by permission.
- [x] **A7**: Soft delete for products, orders and customers (no hard delete without owner approval).
- [x] **A8**: Admin API on separate routes with stricter rate limits; optional IP allowlist.

---

## 📑 ORDERS
- [x] **O1**: Defined status workflow (pending, confirmed, packed, shipped, delivered, cancelled, returned) with allowed transitions only.
- [x] **O2**: Cancel, partial cancel, refund and return flows that also fix stock and payment records.
- [x] **O3**: Duplicate order detection and fake/prank order flags (repeat phone, address or IP).
- [x] **O4**: Order notes, internal comments, and timeline history.
- [x] **O5**: Invoice, packing slip and shipping label printing (PDF, barcode/QR).
- [x] **O6**: Manual order creation (phone/Facebook orders) with the same validation as online orders.
- [x] **O7**: Search, filter, sort and pagination on orders, customers and products.

---

## 📦 INVENTORY AND PRODUCTS
- [x] **I1**: Stock changes inside DB transactions (no overselling, no race conditions).
- [x] **I2**: Variants (size, color), SKU uniqueness, and per-variant stock.
- [x] **I3**: Low-stock and out-of-stock alerts.
- [x] **I4**: Stock movement history (purchase, sale, return, adjustment).
- [x] **I5**: Bulk edit price/stock and bulk product upload.
- [x] **I6**: Image upload with compression and size limits (1.5MB constraint, JPEG/PNG/WebP, multi-photo picker with cache fallback).
- [x] **I7**: Categories, tags, draft/publish status, and scheduled sale prices.
- [x] **I8**: Coupons and discounts: usage limits, expiry, minimum order, no stacking abuse.

---

## 💳 PAYMENT AND COD
- [x] **M1**: Payment reconciliation view: gateway record vs order status, mismatches flagged.
- [x] **M2**: COD tracking: collected, pending, courier-held, and returned amounts.
- [x] **M3**: Courier integration (Pathao, Steadfast, RedX): create parcel, tracking status sync, webhook verification.
- [x] **M4**: Refund records with reason and approver.

---

## 👥 CUSTOMERS AND COMMUNICATION
- [x] **C1**: Customer list with order history, notes, and block/blacklist option.
- [x] **C2**: SMS/email/WhatsApp notifications on order events, with templates and failure logging.
- [x] **C3**: Customer data export/deletion on request (GDPR/privacy compliance).

---

## 📈 REPORTS AND OPERATIONS
- [x] **R1**: Dashboard: sales, orders, profit, top products, returns rate, date filters.
- [x] **R2**: Daily, weekly and monthly reports; exportable.
- [x] **R3**: Expense and profit tracking (cost price per product).
- [x] **R4**: Settings page: shipping zones/fees, tax, store info, payment methods.
- [x] **R5**: Backup and restore for the admin database, with a tested restore.
- [x] **R6**: Admin UI usable on mobile; loading, empty and error states on every screen.
- [x] **R7**: Concurrent-edit protection (two staff editing one order).

---

## 🚀 Sprint 1 Completed Items (Foundation & Safety)
- [x] **PRD-08**: Automated encrypted DB & file backups (`deploy/backup-mysql.sh`).
- [x] **PRD-12**: Error tracking helper (`web/api/error_tracker.php`).
- [x] **PRD-17**: Health check endpoint (`web/api/health.php`).
- [x] **PRD-18**: Bangladesh phone normalization & BDT locale helper (`web/api/locale.php`).
- [x] **PRD-19**: Background queue & cron schedule documentation.
- [x] **PRD-20**: Documentation & runbooks setup.
- [x] **SEC-02**: Environment variables & `.env.example`.
- [x] **SEC-03**: Git secret checks & `.gitignore` rules.
- [x] **SEC-19**: Production debug mode disabled.
- [x] **SEC-20**: Production error logging & safe logging.
- [x] **SEC-25**: Exposure sweep completed.
- [x] **SEC-26**: Supply chain & dependency pinning verified.

---

## 🛡️ Sprint 2 Completed Items (Security, Access & Hardening)
- [x] **SEC-01**: API keys hidden in frontend code.
- [x] **SEC-04 to SEC-15, SEC-17 to SEC-18**: Protected admin routes, auth, role checks, input sanitization, XSS/SQLi prevention, rate limiting, file upload validation, CORS, security headers, secure session tokens.
- [ ] **SEC-16**: Android release builds disallow cleartext traffic; debug builds allow it for local development. The website's HTTP-to-HTTPS redirect is still unverified because fresh HTTP probes return stale HTTP 200 responses from the hosting Nginx proxy.
- [x] **SEC-21**: Webhook signature verification (`web/api/webhook_verify.php`).
- [x] **SEC-22 to SEC-24**: Security event logging, bcrypt password hashing, auth hardening & lockout policies.
- [x] **SEC-27 & SEC-28**: Business-logic abuse prevention & personal data protection.
- [x] **PRD-01 to PRD-03**: Real login/logout, password reset tokens, email verification.
- [x] **ADM-01 to ADM-08**: Separate admin login, role-based access, session timeouts, immutable audit log (`web/api/audit.php`), mass-assignment protection, CSV formula injection protection (`web/api/csv_shield.php`), soft delete (`deleted_at`), strict admin API routes.
- [x] **GAP-01 to GAP-03, GAP-08**: Roles/permissions, audit log, 2FA/lockout, soft delete & trash.
- [x] **UNI-01 to UNI-11**: Server permissions, validation, audit logs, soft deletes, pagination, CSV security, mobile states, decimal money, double-submit protection.
- [x] **ADN-1, ADN-2, CFG-2, CFG-5**: Admin management, privilege escalation prevention, encrypted webhook & courier config.

---

## 💰 Sprint 3 Completed Items (Money Correctness, Accounts & Reports)
- [x] **ACC-1 to ACC-7**: Income, expense, due, balance, fund transfer, employee salary (`web/api/accounts.php`), and bill statements.
- [x] **REP-1 to REP-9**: Profit/loss, product stock and profit, order reports, office sale reports, order profit, sale profit, purchase reports, supplier reports, and stock reports.
- [x] **DSH-1 & DSH-2**: Dashboard metrics accuracy, unit labels, date filters, and safe caching.
- [x] **OPS-01 to OPS-03**: Dashboard analytics, daily/weekly/monthly reports, expense and profit tracking (cost price).
- [x] **PAY-01 & PAY-04**: Payment reconciliation view and refund records with reason and approver.

---

## 📦 Sprint 4 Completed Items (Orders and Stock)
- [x] **ORM-1 to ORM-4**: Manage order status workflow, add exchange orders, order processing report, duplicate/fake order detection (`customer_blacklist`, `order_timeline`).
- [x] **SAL-1 to SAL-3**: OfficeSale (`web/api/sales.php`), Wholesale, and Wholeseller ledger management with transactional stock deductions.
- [x] **ORD-01 to ORD-07**: Status transitions, cancel/refund/return flows, order notes, invoice/slip printing, manual order creation, and search/filter/pagination.
- [x] **INV-01 & OPS-07**: Transaction-safe inventory updates and concurrent edit protection.

---

## 🚚 Sprint 5 Completed Items (Products and Fulfilment)
- [x] **PRO-1 to PRO-7**: Manage products, variants/sizes (`product_variants`), purchase history, reviews, product views, and stock movement/low-stock alerts (`stock_movements`).
- [x] **SUP-1**: Supplier add/manage (`web/api/suppliers.php`), payable balances, and duplicate prevention.
- [x] **INV-02 to INV-08**: SKU uniqueness, stock history, bulk edits, image uploads with compression, and discount/coupon validation.
- [x] **CMP-1 & PAY-02/03/CFG-7**: Coupons (`coupons`), COD tracking, and courier integration (`web/api/couriers.php` for Pathao, Steadfast, RedX with webhook verification).

---

## 📝 Sprint 6 Completed Items (Content, Customers, Compliance)
- [x] **CAT-1 to CAT-3**: Categories, brands, and sliders hierarchy integrity and safe management.
- [x] **WEB-1 to WEB-3, PRD-13/14**: Header, footer, theme, and CMS pages (`web/api/cms.php`, privacy & terms pages).
- [x] **CFG-1 to CFG-9, OPS-04/05**: Marketing, courier API, delivery charge, city/zone config, order source, and database backup management.
- [x] **CMP-2, CST-1/2, CUS-01 to 03, LND-1**: Offer banners, customer messaging & logs (`customer_messages`), GDPR data export/deletion, and landing page builder.
- [x] **GAP-09 to 14, PRD-15**: Database backup/restore, CSV injection protection, notification logs, privacy/terms pages, and error log viewer (`web/api/error_logs.php` for owner).

---

## 🎨 Sprint 7 Completed Items (UI/UX Design System & Layout)
- [x] **UXD-1 to 4, UXL-1 to 3**: Design tokens, typography, spacing, component shell, and responsive mobile grid layout.
- [x] **UXP-1 to 6, UXR-1 to 7**: Page patterns rollout (Login prompt, Dashboard metrics & trend charts, Orders filter/status management, Sale, Accounts, Products, Customers, Reports, Settings).
- [x] **PRD-04 to PRD-07, PRD-09/10/16, OPS-06, GAP-15, DSH-1**: Loading, empty, and error states on every screen, responsive mobile layout, custom 404, admin onboarding flow, and mobile sidebar/dashboard overlap fixes.

---

## 🔍 Sprint 8 Completed Items (SEO and Final Verification)
- [x] **SEO-01 to SEO-19**: Auto-generated sitemap (`web/api/sitemap.php`), `robots.txt`, noindex tags on admin pages, canonical tags, unique meta titles and descriptions, single H1, heading hierarchy, alt texts, JSON-LD Schema markup, internal links, image compression, Core Web Vitals readiness, clean URLs, Open Graph / Twitter cards (`og:image`), Search Console preparation, `llms.txt`, and backlink strategy (`SEO_BACKLINK_PLAN.md`).
- [x] **PRD-11 & PRD-20**: Storefront analytics integration and finalized comprehensive documentation/runbooks.
- [x] **Full Project Verification**: Build passes successfully, all tests pass, zero errors or warnings, and all security/money/inventory invariant checks verified.
