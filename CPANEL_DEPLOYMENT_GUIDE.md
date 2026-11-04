# 🚀 Deployment Guide for Wonderful Collection
**Domain:** [wonderfulcollection.store](https://wonderfulcollection.store/)  
**cPanel Server:** `server.shodns.in:2083`  
**cPanel User:** `wonderfu`  
**Home Directory:** `/home/wonderfu`  
**Public Root:** `/home/wonderfu/public_html`  
**Brand:** 🛍️ Wonderful Collection — Dhanmondi, Dhaka, Bangladesh 🇧🇩  

---

## 📋 Architecture Overview

This project provides a unified full-stack e-commerce solution:
1. **Web Storefront & REST API (`/web`):**
   - 22+ customer-facing pages (Shopping, Customer Account, Policies)
   - Interactive Web Admin Panel mirroring the Android app
   - PHP REST API (`/api/`) compatible with cPanel shared hosting (PHP 8.x + MySQL PDO)
   - Zero-dependency Node.js dev server (`server.js`) for instant local testing on your PC
2. **Database Schema (`database.sql`):**
   - MySQL schema for Products, Categories, Orders, Customers, Coupons, Inventory, Reviews, and Store Settings
   - Seeds store settings and the hashed admin account only; catalog and sample tables start empty
3. **Admin Android Application (`/admin-android`):**
   - Native Kotlin Android App
   - Built with **SOLID Principles** & **Clean Architecture / MVVM**
   - Exact 3x3 Grid UI matching your brand layout (Dashboard, Products, Categories, Orders, Customers, Coupons, Stock/Inventory, Reports, Settings)

---

## Phase 3: cPanel Deployment Checklist

The archive is built locally from the project root with:

```powershell
.\deploy\Build-Deployment.ps1
```

This creates `deploy\wonderful-deploy.zip` with `index.html` at the archive root and an `api/config.local.php` template. Keep the ZIP on your computer until the File Manager upload step. Do not send cPanel passwords or session links in chat.

1. **Create the MySQL database and user**
   - Sign in to cPanel at [https://server.shodns.in:2083](https://server.shodns.in:2083).
   - From the cPanel home page, open **Databases → MySQL® Databases**.
   - Under **Create New Database**, enter a suffix such as `store`; cPanel adds the `wonderfu_` prefix. Record the full database name it displays.
   - Under **MySQL Users → Add New User**, create a user with a unique password. Record the full prefixed username and keep the password private.
   - Under **Add User To Database**, select that user and database, click **Add**, select **ALL PRIVILEGES**, then click **Make Changes**.

2. **Import the production schema**
   - Return to cPanel home and open **Databases → phpMyAdmin**.
   - Select the newly created, empty database in the left sidebar.
   - Open **Import → Choose File**, select the project-root `database.sql` from your computer, keep the format as **SQL**, and click **Import** (or **Go**).
   - Confirm phpMyAdmin reports success and shows the tables. The SQL initializes an empty database and does not drop tables; do not import it into a database already containing application tables.

3. **Select PHP and verify required extensions**
   - From cPanel home, open **Software → MultiPHP Manager**.
   - Check the `wonderfulcollection.store` row, select **PHP 8.1** or later from **PHP Version**, and click **Apply**.
   - If cPanel provides **Software → Select PHP Version**, open its **Extensions** tab and enable `pdo_mysql`, `mbstring`, and `json`, then click **Apply**.
   - **MultiPHP INI Editor** changes PHP configuration directives; it does not enable missing extensions. If **Select PHP Version** is unavailable or an extension is missing, ask the hosting provider to enable it for this domain.

4. **Upload and configure the site**
   - From cPanel home, open **Files → File Manager**, then open `/home/wonderfu/public_html`.
   - Before extracting over an existing site, enable **Show Hidden Files** in File Manager and inspect `.htaccess`. If it contains a cPanel-generated PHP INI directives block, preserve and merge that block into the deployment `.htaccess`; do not replace the account's `php.ini` or `.user.ini`.
   - Click **Upload**, choose `deploy\wonderful-deploy.zip`, return to File Manager, select the ZIP, and click **Extract**. Extract into `public_html` itself, not a nested folder.
   - Confirm `/home/wonderfu/public_html/index.html` exists at the web-root level, then delete `wonderful-deploy.zip` from File Manager.
   - Open `public_html/api/config.local.php` in File Manager's editor and replace the database-name, database-user, and password placeholders:
     ```php
     define('DB_HOST', 'localhost');
     define('DB_NAME', 'wonderfu_<full_database_name>');
     define('DB_USER', 'wonderfu_<full_database_user>');
     define('DB_PASS', '<database_password>');
     define('DEV_MODE', false);
     ```
   - Use the exact full prefixed names shown in MySQL Databases. Keep the password in cPanel only; escape `'` and `\` if either appears inside the PHP single-quoted password value. Save the file.

5. **Set file permissions**
   - In File Manager, set directories (including `api`, `assets`, `css`, and `js`) to **755** and ordinary files to **644**.
   - Set `api/config.local.php` to **600**; use **640** only if the PHP handler needs group-read access. Do not use `777`.

6. **Confirm SSL and HTTPS**
   - From cPanel home, open **Security → SSL/TLS Status** and confirm `wonderfulcollection.store` has a valid certificate.
   - If it is not covered, run **AutoSSL** from that page if available, or ask the host to issue/enable the certificate.
   - Visit `https://wonderfulcollection.store` and confirm it loads securely and HTTP redirects to HTTPS.

7. **Initialize the real catalog**
   - Sign in at `https://wonderfulcollection.store/admin.html` using username `admin` and the one-time initial password already provided; change it immediately.
   - The production database intentionally starts without products, categories, coupons, or reviews. Add real categories and products in the admin panel before accepting customer orders. See [deploy/IMAGE_UPLOADS.md](./deploy/IMAGE_UPLOADS.md) for local image placeholders and image path guidance.

---

## Optional: Testing Locally with Node.js

Before or during cPanel deployment, you can preview and test everything locally on Windows:

1. Open PowerShell or Terminal in the project directory:
   ```powershell
   cd C:\Users\Abidh\Desktop\Wonderfulcollection
   ```
2. Run the standalone development server (Node.js is already installed on your system):
   ```powershell
   node server.js
   ```
3. Open your browser:
   - **Customer Website:** [http://localhost:3000](http://localhost:3000)
   - **Admin Panel:** [http://localhost:3000/admin.html](http://localhost:3000/admin.html)
   - **Live Order Tracking:** [http://localhost:3000/track-order.html](http://localhost:3000/track-order.html)
   - **REST API:** [http://localhost:3000/api/products](http://localhost:3000/api/products)

---

## Optional: Running the Admin Android App

1. Open **Android Studio**.
2. Choose **Open Project** and select:
   `C:\Users\Abidh\Desktop\Wonderfulcollection\admin-android`
3. **Configure API Base URL:**
   - For Production (pointing to your live store):
     `https://wonderfulcollection.store/api`
   - For Local Testing via Android Emulator:
     `http://10.0.2.2:3000/api`
   - You can also change the API Base URL directly inside the app under **Settings (⚙️)**!
4. Click **Run 'app'** (or press `Shift + F10`) to launch on your Android device or emulator.

---

## Admin Credentials & Defaults

- **Admin Portal (Web):** `https://wonderfulcollection.store/admin.html`
- **Default Username:** `admin`
- **Initial Admin Password:** use the one-time password provided in the deployment conversation; change it immediately after first login.
- **Store Moto:** Wonderful Collection: Quality products, delivered across Bangladesh.
- **Fast Dhanmondi Delivery:** 2 to 4 hours (৳60 delivery fee, Free on orders ৳2,000+)
- **Mobile Payments:** bKash, Nagad, and Rocket Personal accounts with TrxID verification
