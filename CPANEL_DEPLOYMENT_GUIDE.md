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
   - Pre-seeded tables for Products, Categories, Orders, Customers, Coupons, Inventory, Reviews, and Store Settings
3. **Admin Android Application (`/admin-android`):**
   - Native Kotlin Android App
   - Built with **SOLID Principles** & **Clean Architecture / MVVM**
   - Exact 3x3 Grid UI matching your brand layout (Dashboard, Products, Categories, Orders, Customers, Coupons, Stock/Inventory, Reports, Settings)

---

## 🛠️ Step 1: Build and upload the cPanel package

1. **Log in to cPanel:**
   - Go to [https://server.shodns.in:2083](https://server.shodns.in:2083)
   - Username: `wonderfu`
2. **Open File Manager:**
   - Navigate to `/home/wonderfu/public_html`
3. **Build the deployment archive in PowerShell from the project root:**
   ```powershell
   .\deploy\Build-Deployment.ps1
   ```
   - This creates `deploy\wonderful-deploy.zip` with the contents of `web/` at the archive root and a `config.local.php` template under `api/`.
   - The script excludes development files, SQLite databases, SQL/Markdown files, Android files, and any local `config.local.php`.
4. **Upload the archive:**
   - In cPanel File Manager, upload `deploy\wonderful-deploy.zip` into `public_html/` and click **Extract**.
   - Use [deploy/IMAGE_UPLOADS.md](./deploy/IMAGE_UPLOADS.md) to prepare and connect your own product/category photography; the storefront uses local illustrations until then.
   - Your `public_html/` directory should look like:
     ```
     /home/wonderfu/public_html/
       ├── .htaccess
       ├── index.html
       ├── shop.html
       ├── product.html
       ├── category.html
       ├── cart.html
       ├── checkout.html
       ├── order-success.html
       ├── track-order.html
       ├── admin.html
       ├── css/
       │    └── style.css
       ├── js/
       │    ├── store.js
       │    └── admin.js
       ├── assets/
       │    ├── logo.jpg
       │    ├── logo.svg
       │    ├── product-placeholder.svg
       │    └── category-placeholder.svg
       └── api/
            ├── config.php
            ├── config.local.php
            ├── db.php
            ├── products.php
            ├── orders.php
            ├── inventory.php
            ├── categories.php
            ├── coupons.php
            ├── customers.php
            ├── reports.php
            ├── settings.php
            ├── auth.php
            └── track.php
     ```

---

## 🗄️ Step 2: Setting up MySQL in cPanel

1. In cPanel, click **MySQL Databases**.
2. **Create Database:** e.g. `wonderfu_ecommerce`
3. **Create User:** use a unique, strong password generated in your password manager.
4. **Add User to Database:** Assign **ALL PRIVILEGES** to `wonderfu_admin` on `wonderfu_ecommerce`.
5. **Import Schema via phpMyAdmin:**
   - Open **phpMyAdmin** from cPanel.
   - Select `wonderfu_ecommerce` from the left sidebar.
   - Click the **Import** tab at the top.
   - Choose `database.sql` from your project folder and click **Import** (or **Go**).
6. **Configure API Credentials:**
   - Create `/home/wonderfu/public_html/api/config.local.php` in cPanel File Manager.
   - Set the database constants in that local-only file:
     ```php
     define('DB_HOST', 'localhost');
     define('DB_NAME', 'wonderfu_<your_database>');
     define('DB_USER', 'wonderfu_<your_user>');
     define('DB_PASS', '<your_database_password>');
     define('DEV_MODE', false);
     ```

> SQLite fallback is available only when `DEV_MODE` is explicitly enabled in a local development configuration. Production returns a clean JSON 500 if MySQL is unavailable.

---

## ⚡ Step 3: Testing Locally with Node.js

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

## 📱 Step 4: Running the Admin Android App

1. Open **Android Studio**.
2. Choose **Open Project** and select:
   `C:\Users\Abidh\.gemini\antigravity\scratch\wonderful-collection\admin-android`
3. **Configure API Base URL:**
   - For Production (pointing to your live store):
     `https://wonderfulcollection.store/api`
   - For Local Testing via Android Emulator:
     `http://10.0.2.2:3000/api`
   - You can also change the API Base URL directly inside the app under **Settings (⚙️)**!
4. Click **Run 'app'** (or press `Shift + F10`) to launch on your Android device or emulator.

---

## 🎯 Admin Credentials & Defaults

- **Admin Portal (Web):** `https://wonderfulcollection.store/admin.html`
- **Default Username:** `admin`
- **Initial Admin Password:** use the one-time password provided in the deployment conversation; change it immediately after first login.
- **Store Moto:** Wonderful Collection: Quality products, delivered across Bangladesh.
- **Fast Dhanmondi Delivery:** 2 to 4 hours (৳60 delivery fee, Free on orders ৳2,000+)
- **Mobile Payments:** bKash, Nagad, and Rocket Personal accounts with TrxID verification
