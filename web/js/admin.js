/**
 * Wonderful Collection - Web Admin Controller
 * Drives the 9 backend screens matching Image 2
 */

const API_BASE = '/api';
const ADMIN_TOKEN_KEY = 'wc_admin_token';
const ADMIN_NAME_KEY = 'wc_admin_name';
let productsById = new Map();
let couponsById = new Map();
let productImages = [];
let selectedProductFiles = [];
let productPreviewUrls = [];

function showAdminLogin(message = '') {
    document.getElementById('admin-login-screen').style.display = 'block';
    document.getElementById('admin-app').style.display = 'none';
    document.getElementById('admin-user-name').textContent = 'Not signed in';
    document.getElementById('admin-change-password').style.display = 'none';
    document.getElementById('admin-logout').style.display = 'none';
    const error = document.getElementById('admin-login-error');
    error.textContent = message;
    error.style.display = message ? 'block' : 'none';
}

function showAdminApp(name) {
    document.getElementById('admin-login-screen').style.display = 'none';
    document.getElementById('admin-app').style.display = 'block';
    document.getElementById('admin-password-panel').classList.remove('active');
    document.getElementById('admin-password-panel').style.display = 'none';
    document.getElementById('admin-user-name').textContent = `Signed in: ${name || 'Admin'}`;
    document.getElementById('admin-change-password').style.display = 'inline-block';
    document.getElementById('admin-logout').style.display = 'inline-block';
}

function toggleAdminPasswordPanel() {
    const panel = document.getElementById('admin-password-panel');
    panel.classList.toggle('active');
    panel.style.display = panel.classList.contains('active') ? 'block' : 'none';
}

async function handleAdminPasswordChange(event) {
    event.preventDefault();
    const error = document.getElementById('admin-password-error');
    const newPassword = document.getElementById('admin-new-password').value;
    if (newPassword !== document.getElementById('admin-confirm-password').value) {
        error.textContent = 'The new passwords do not match.';
        error.style.display = 'block';
        return;
    }

    try {
        const response = await adminFetch(`${API_BASE}/auth?action=admin_change_password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                current_password: document.getElementById('admin-current-password').value,
                new_password: newPassword
            })
        });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            error.textContent = result.error || 'Could not change the admin password.';
            error.style.display = 'block';
            return;
        }

        sessionStorage.setItem(ADMIN_TOKEN_KEY, result.data.token);
        document.getElementById('admin-password-panel').querySelector('form').reset();
        document.getElementById('admin-password-panel').classList.remove('active');
        document.getElementById('admin-password-panel').style.display = 'none';
        alert('Admin password updated. Other active sessions have been signed out.');
    } catch (e) {
        error.textContent = 'Could not connect to the authentication service.';
        error.style.display = 'block';
    }
}

async function adminFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(url, { ...options, headers });
    if (response.status === 401 && token) {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        sessionStorage.removeItem(ADMIN_NAME_KEY);
        showAdminLogin('Your admin session expired. Please sign in again.');
    }
    return response;
}

async function handleAdminLogin(event) {
    event.preventDefault();
    const button = document.getElementById('admin-login-button');
    const error = document.getElementById('admin-login-error');
    button.disabled = true;
    error.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE}/auth?action=admin_login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('admin-username').value.trim(),
                password: document.getElementById('admin-password').value,
                totp_code: document.getElementById('admin-totp-code').value.trim()
            })
        });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            error.textContent = result.error || 'Admin sign in failed.';
            error.style.display = 'block';
            return;
        }

        sessionStorage.setItem(ADMIN_TOKEN_KEY, result.data.token);
        sessionStorage.setItem(ADMIN_NAME_KEY, result.data.full_name);
        document.getElementById('admin-password').value = '';
        document.getElementById('admin-totp-code').value = '';
        showAdminApp(result.data.full_name);
        if (result.data.must_change_password) {
            const panel = document.getElementById('admin-password-panel');
            panel.classList.add('active');
            panel.style.display = 'block';
            const passwordError = document.getElementById('admin-password-error');
            passwordError.textContent = 'Set a new password before using any admin features.';
            passwordError.style.display = 'block';
        }
    } catch (e) {
        error.textContent = 'Could not connect to the authentication service.';
        error.style.display = 'block';
    } finally {
        button.disabled = false;
    }
}

async function handleAdminLogout() {
    try {
        await adminFetch(`${API_BASE}/auth?action=admin_logout`, { method: 'POST' });
    } finally {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        sessionStorage.removeItem(ADMIN_NAME_KEY);
        showAdminLogin('You have signed out.');
    }
}

async function initializeAdmin() {
    const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (!token) {
        showAdminLogin();
        return;
    }

    try {
        const response = await adminFetch(`${API_BASE}/reports`);
        if (!response.ok) {
            showAdminLogin('Your admin session is no longer valid. Please sign in again.');
            return;
        }
        showAdminApp(sessionStorage.getItem(ADMIN_NAME_KEY));
    } catch (e) {
        showAdminLogin('Could not verify your admin session.');
    }
}

function formatBDT(amount) {
    const value = Number(amount || 0);
    return '৳' + (Number.isFinite(value) ? value : 0).toLocaleString('en-BD');
}

function escapeAdminHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

function safeAdminImage(value) {
    if (typeof value !== 'string') return 'assets/product-placeholder.svg';
    if (/^assets\/(?!.*(?:^|\/)\.\.(?:\/|$))[a-z0-9._/-]+$/i.test(value)) return value;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' ? url.href : 'assets/product-placeholder.svg';
    } catch (error) {
        return 'assets/product-placeholder.svg';
    }
}

function openModule(moduleName) {
    document.getElementById('main-admin-grid').style.display = 'none';
    document.querySelectorAll('.admin-module-screen').forEach(el => el.classList.remove('active'));

    const target = document.getElementById(`mod-${moduleName}`);
    if (target) {
        target.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });

        switch (moduleName) {
            case 'dashboard': loadDashboard(); break;
            case 'products': loadProducts(); break;
            case 'categories': loadCategories(); break;
            case 'orders': loadOrders(); break;
            case 'customers': loadCustomers(); break;
            case 'coupons': loadCoupons(); break;
            case 'inventory': loadInventory(); break;
            case 'reports': loadReports(); break;
            case 'settings': loadSettings(); break;
        }
    }
}

function closeModule() {
    document.querySelectorAll('.admin-module-screen').forEach(el => el.classList.remove('active'));
    document.getElementById('main-admin-grid').style.display = 'grid';
}

// 1. DASHBOARD
async function loadDashboard() {
    try {
        const res = await adminFetch(`${API_BASE}/reports`);
        const json = await res.json();
        const ov = json.data.overview;

        document.getElementById('dash-kpi-cards').innerHTML = `
            <div style="background: #0f172a; padding: 20px; border-radius: 12px; border: 1px solid #334155;">
                <div style="font-size: 0.8rem; color: #94a3b8;">Total Revenue</div>
                <div style="font-size: 1.6rem; font-weight: 800; color: #10b981;">${formatBDT(ov.gross_revenue)}</div>
            </div>
            <div style="background: #0f172a; padding: 20px; border-radius: 12px; border: 1px solid #334155;">
                <div style="font-size: 0.8rem; color: #94a3b8;">Total Orders</div>
                <div style="font-size: 1.6rem; font-weight: 800; color: #38bdf8;">${Number(ov.total_orders) || 0}</div>
            </div>
            <div style="background: #0f172a; padding: 20px; border-radius: 12px; border: 1px solid #334155;">
                <div style="font-size: 0.8rem; color: #94a3b8;">Average Order (AOV)</div>
                <div style="font-size: 1.6rem; font-weight: 800; color: #fbbf24;">${formatBDT(ov.average_order_value)}</div>
            </div>
            <div style="background: #0f172a; padding: 20px; border-radius: 12px; border: 1px solid #334155;">
                <div style="font-size: 0.8rem; color: #94a3b8;">Low Stock Alerts</div>
                <div style="font-size: 1.6rem; font-weight: 800; color: #ef4444;">${Number(ov.low_stock_alerts) || 0} Products</div>
            </div>
        `;

        const tbody = document.querySelector('#dash-orders-table tbody');
        tbody.innerHTML = (json.data.recent_orders || []).map(o => `
            <tr>
                <td style="font-weight: 800; color: #38bdf8;">${escapeAdminHtml(o.order_number)}</td>
                <td>${escapeAdminHtml(o.customer_name)}</td>
                <td>${escapeAdminHtml(o.delivery_area)}</td>
                <td style="font-weight: 700;">${formatBDT(o.total)}</td>
                <td><span style="color: #fbbf24; font-weight: 700;">● ${escapeAdminHtml(o.order_status)}</span></td>
                <td><button onclick="openModule('orders')" class="admin-btn" style="padding: 4px 10px; font-size: 0.75rem;">Manage</button></td>
            </tr>
        `).join('');
    } catch (e) {
        console.error('Dash error:', e);
    }
}

// 2. PRODUCTS
async function loadProducts() {
    const res = await adminFetch(`${API_BASE}/products`);
    const json = await res.json();
    if (!res.ok || json.status !== 'success') {
        throw new Error(json.error || 'Could not load products.');
    }
    const products = json.data || [];
    productsById = new Map(products.map(product => [Number(product.id), product]));
    const tbody = document.querySelector('#products-table tbody');
    tbody.innerHTML = products.map(p => `
        <tr>
            <td><img src="${escapeAdminHtml(safeAdminImage(Array.isArray(p.images) && p.images.length ? p.images[0] : p.image))}" alt="${escapeAdminHtml(p.name)}" width="44" height="44" loading="lazy" onerror="this.onerror=null;this.src='assets/product-placeholder.svg'" style="border-radius: 6px; object-fit: cover;"></td>
            <td style="font-weight: 700; color: #f8fafc;">${escapeAdminHtml(p.name)}</td>
            <td style="color: #94a3b8;">${escapeAdminHtml(p.category_name)}</td>
            <td>${formatBDT(p.regular_price)}</td>
            <td style="color: #f97316; font-weight: 700;">${p.sale_price ? formatBDT(p.sale_price) : '-'}</td>
            <td style="font-weight: 700;">${p.stock_quantity}</td>
            <td style="white-space: nowrap;">
                <button type="button" onclick="editProduct(${Number(p.id)})" class="admin-btn" style="padding: 4px 10px; font-size: 0.78rem;">Edit</button>
                <button type="button" onclick="deleteProduct(${Number.isSafeInteger(Number(p.id)) ? Number(p.id) : 0})" style="border: none; background: #dc2626; color: #fff; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.78rem;">Delete</button>
            </td>
        </tr>
    `).join('');
}

async function showAddProductModal() {
    const form = document.getElementById('product-create-form');
    const isOpening = form.style.display === 'none';
    if (!isOpening) {
        hideProductForm();
        return;
    }

    await prepareProductForm(null);
}

function hideProductForm() {
    const form = document.getElementById('product-create-form');
    form.style.display = 'none';
    form.reset();
    productImages = [];
    selectedProductFiles = [];
    renderProductImagePreview();
}

async function prepareProductForm(product) {
    const form = document.getElementById('product-create-form');
    form.reset();
    form.style.display = 'block';
    const status = document.getElementById('product-create-status');
    status.textContent = '';
    status.style.display = 'none';
    document.getElementById('new-product-id').value = product ? String(product.id) : '';
    document.getElementById('product-form-title').textContent = product ? 'Edit product' : 'Add a product';
    document.getElementById('product-create-submit').textContent = product ? 'Save Product Changes' : 'Save Product';
    productImages = Array.isArray(product?.images) ? [...product.images] : [];
    selectedProductFiles = [];

    try {
        const response = await adminFetch(`${API_BASE}/categories`);
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            throw new Error(result.error || 'Could not load product categories.');
        }

        const categorySelect = document.getElementById('new-product-category');
        categorySelect.replaceChildren(new Option('Choose a category', ''));
        (result.data || []).forEach(category => {
            categorySelect.add(new Option(category.name, category.id));
        });
        if (!result.data || result.data.length === 0) {
            throw new Error('Create a category before adding products.');
        }
        if (product) {
            document.getElementById('new-product-name').value = product.name || '';
            categorySelect.value = String(product.category_id || '');
            document.getElementById('new-product-price').value = product.regular_price ?? '';
            document.getElementById('new-product-sale-price').value = product.sale_price ?? '';
            document.getElementById('new-product-stock').value = product.stock_quantity ?? 0;
            document.getElementById('new-product-sku').value = product.sku || '';
            document.getElementById('new-product-description').value = product.short_desc || '';
            document.getElementById('new-product-long-description').value = product.description || '';
            document.getElementById('new-product-featured').checked = Number(product.is_featured) === 1;
            document.getElementById('new-product-trending').checked = Number(product.is_trending) === 1;
        }
        renderProductImagePreview();
        document.getElementById('new-product-name').focus();
    } catch (error) {
        status.textContent = error.message || 'Could not load product categories.';
        status.style.color = '#fca5a5';
        status.style.display = 'block';
    }
}

function editProduct(id) {
    const product = productsById.get(Number(id));
    if (!product) {
        alert('Product details are not loaded. Refresh the product list and try again.');
        return;
    }
    prepareProductForm(product);
}

function handleProductImageSelection(event) {
    const files = Array.from(event.target.files || []);
    const status = document.getElementById('product-create-status');
    if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLowerCase()) || file.size <= 0 || file.size > 1500000)) {
        event.target.value = '';
        selectedProductFiles = [];
        status.textContent = 'Choose JPEG, PNG, or WebP photos smaller than 1.5 MB each.';
        status.style.color = '#fca5a5';
        status.style.display = 'block';
        renderProductImagePreview();
        return;
    }
    if (productImages.length + files.length > 5) {
        event.target.value = '';
        selectedProductFiles = [];
        status.textContent = 'A product can have up to five photos total.';
        status.style.color = '#fca5a5';
        status.style.display = 'block';
        renderProductImagePreview();
        return;
    }
    selectedProductFiles = files;
    status.textContent = '';
    status.style.display = 'none';
    renderProductImagePreview();
}

function renderProductImagePreview() {
    productPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    productPreviewUrls = [];
    const preview = document.getElementById('product-image-preview');
    if (!preview) return;
    preview.replaceChildren();

    const renderImage = (source, label, onRemove) => {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative;width:84px;';
        const image = document.createElement('img');
        image.src = source;
        image.alt = label;
        image.width = 80;
        image.height = 80;
        image.style.cssText = 'object-fit:cover;border-radius:6px;border:1px solid #475569;';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Remove ${label}`);
        remove.style.cssText = 'position:absolute;top:2px;right:4px;border:0;border-radius:50%;background:#dc2626;color:#fff;width:22px;height:22px;cursor:pointer;';
        remove.addEventListener('click', onRemove);
        wrapper.append(image, remove);
        preview.appendChild(wrapper);
    };

    productImages.forEach((image, index) => {
        renderImage(safeAdminImage(image), `Current product photo ${index + 1}`, () => {
            productImages.splice(index, 1);
            renderProductImagePreview();
        });
    });
    selectedProductFiles.forEach((file, index) => {
        const url = URL.createObjectURL(file);
        productPreviewUrls.push(url);
        renderImage(url, `New product photo ${index + 1}`, () => {
            selectedProductFiles.splice(index, 1);
            document.getElementById('new-product-images').value = '';
            renderProductImagePreview();
        });
    });
}

async function uploadProductImages(files) {
    const body = new FormData();
    files.forEach(file => body.append('images[]', file));
    const response = await adminFetch(`${API_BASE}/product-images.php`, { method: 'POST', body });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') {
        throw new Error(result.error || 'Could not upload product photos.');
    }
    return result.data.images;
}

async function handleAddProduct(event) {
    event.preventDefault();
    const form = document.getElementById('product-create-form');
    const status = document.getElementById('product-create-status');
    const submit = document.getElementById('product-create-submit');
    const price = Number(document.getElementById('new-product-price').value);
    const salePriceInput = document.getElementById('new-product-sale-price').value;
    const salePrice = salePriceInput === '' ? null : Number(salePriceInput);
    const productId = document.getElementById('new-product-id').value;

    if (!Number.isFinite(price) || price <= 0 || (salePrice !== null && (!Number.isFinite(salePrice) || salePrice <= 0 || salePrice >= price))) {
        status.textContent = 'Enter a valid regular price and a lower sale price.';
        status.style.color = '#fca5a5';
        status.style.display = 'block';
        return;
    }

    submit.disabled = true;
    status.textContent = '';
    status.style.display = 'none';
    try {
        const uploadedImages = selectedProductFiles.length ? await uploadProductImages(selectedProductFiles) : [];
        const images = [...productImages, ...uploadedImages];
        const payload = {
                ...(productId ? { id: Number(productId) } : {}),
                name: document.getElementById('new-product-name').value.trim(),
                category_id: document.getElementById('new-product-category').value,
                regular_price: price,
                sale_price: salePrice,
                stock_quantity: Number(document.getElementById('new-product-stock').value),
                sku: document.getElementById('new-product-sku').value.trim() || null,
                short_desc: document.getElementById('new-product-description').value.trim(),
                description: document.getElementById('new-product-long-description').value.trim(),
                is_featured: document.getElementById('new-product-featured').checked,
                is_trending: document.getElementById('new-product-trending').checked,
                images
            };
        const response = await adminFetch(`${API_BASE}/products${productId ? `?id=${encodeURIComponent(productId)}` : ''}`, {
            method: productId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            throw new Error(result.error || 'Could not save the product.');
        }

        try {
            await loadProducts();
            hideProductForm();
        } catch (error) {
            hideProductForm();
            alert(`Product was saved, but the product list could not be refreshed: ${error.message}`);
        }
    } catch (error) {
        status.textContent = error.message || 'Could not save the product.';
        status.style.color = '#fca5a5';
        status.style.display = 'block';
    } finally {
        submit.disabled = false;
    }
}

async function deleteProduct(id) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    const response = await adminFetch(`${API_BASE}/products?id=${id}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') {
        alert(result.error || 'Could not delete the product.');
        return;
    }
    await loadProducts();
}

// 3. CATEGORIES
async function loadCategories() {
    const res = await adminFetch(`${API_BASE}/categories`);
    const json = await res.json();
    const tbody = document.querySelector('#categories-table tbody');
    tbody.innerHTML = (json.data || []).map(c => `
        <tr>
            <td style="font-weight: 700; color: #f8fafc;">${escapeAdminHtml(c.name)}</td>
            <td style="color: #94a3b8;">${escapeAdminHtml(c.slug)}</td>
            <td style="font-weight: 700;">${Number(c.product_count) || 0}</td>
        </tr>
    `).join('');
}

async function handleAddCategory() {
    const name = document.getElementById('new-cat-name').value.trim();
    const slug = document.getElementById('new-cat-slug').value.trim();
    if (!name) return alert('Category name is required');
    await adminFetch(`${API_BASE}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug })
    });
    document.getElementById('new-cat-name').value = '';
    document.getElementById('new-cat-slug').value = '';
    loadCategories();
}

// 4. ORDERS
async function loadOrders() {
    const res = await adminFetch(`${API_BASE}/orders`);
    const json = await res.json();
    const tbody = document.querySelector('#orders-table tbody');
    tbody.innerHTML = (json.data || []).map(o => {
        const orderId = Number(o.id);
        const customerPhone = String(o.customer_phone ?? '').replace(/[^\d+]/g, '').slice(0, 20);
        const whatsappPhone = customerPhone.replace(/\D/g, '');
        return `
        <tr>
            <td style="font-weight: 800; color: #38bdf8;">${escapeAdminHtml(o.order_number)}</td>
            <td>
                <strong>${escapeAdminHtml(o.customer_name)}</strong><br>
                <a href="tel:${escapeAdminHtml(customerPhone)}" style="color: #38bdf8; font-size: 0.82rem;">📞 ${escapeAdminHtml(o.customer_phone)}</a> |
                <a href="https://wa.me/${escapeAdminHtml(whatsappPhone)}" target="_blank" rel="noopener noreferrer" style="color: #10b981; font-size: 0.82rem;">💬 WA</a>
            </td>
            <td>${escapeAdminHtml(o.delivery_area)}</td>
            <td style="font-weight: 800; color: #f97316;">${formatBDT(o.total)}</td>
            <td><strong style="color: #fbbf24;">● ${escapeAdminHtml(o.order_status)}</strong></td>
            <td>
                <select onchange="updateOrderStatus(${Number.isSafeInteger(orderId) ? orderId : 0}, this.value)" style="background: #0f172a; color: #fff; border: 1px solid #334155; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">
                    <option value="">Change Status...</option>
                    <option value="Pending" ${o.order_status==='Pending'?'selected':''}>Pending</option>
                    <option value="Processing" ${o.order_status==='Processing'?'selected':''}>Processing</option>
                    <option value="Shipped" ${o.order_status==='Shipped'?'selected':''}>Shipped</option>
                    <option value="Delivered" ${o.order_status==='Delivered'?'selected':''}>Delivered</option>
                    <option value="Cancelled" ${o.order_status==='Cancelled'?'selected':''}>Cancelled</option>
                </select>
            </td>
        </tr>
    `;
    }).join('');
}

async function updateOrderStatus(orderId, newStatus) {
    if (!newStatus) return;
    const response = await adminFetch(`${API_BASE}/orders`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, order_status: newStatus })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== 'success') {
        alert(result.error || 'The order status could not be updated.');
        return;
    }
    alert('Order status updated to ' + newStatus);
    loadOrders();
}

// 5. CUSTOMERS
async function loadCustomers() {
    const res = await adminFetch(`${API_BASE}/customers`);
    const json = await res.json();
    const tbody = document.querySelector('#customers-table tbody');
    tbody.innerHTML = (json.data || []).map(c => `
        <tr>
            <td style="font-weight: 700; color: #f8fafc;">${escapeAdminHtml(c.name)}</td>
            <td>${escapeAdminHtml(c.email)}<br><span style="color: #38bdf8;">${escapeAdminHtml(c.phone)}</span></td>
            <td>${escapeAdminHtml(c.address || c.area)} (${escapeAdminHtml(c.city)})</td>
            <td style="font-weight: 700;">${Number(c.total_orders) || 1}</td>
            <td style="font-weight: 800; color: #10b981;">${formatBDT(c.total_spent || 0)}</td>
        </tr>
    `).join('');
}

// 6. COUPONS
async function loadCoupons() {
    const res = await adminFetch(`${API_BASE}/coupons`);
    const json = await res.json();
    if (!res.ok || json.status !== 'success') {
        throw new Error(json.error || 'Could not load coupons.');
    }
    couponsById = new Map((json.data || []).map(coupon => [Number(coupon.id), coupon]));
    const tbody = document.querySelector('#coupons-table tbody');
    tbody.innerHTML = (json.data || []).map(cp => `
        <tr>
            <td style="font-weight: 800; color: #38bdf8;">${escapeAdminHtml(cp.code)}</td>
            <td>${cp.type === 'percentage' ? `${Number(cp.value) || 0}%` : formatBDT(cp.value)}</td>
            <td>${formatBDT(cp.min_order)}</td>
            <td><span style="color: ${Number(cp.is_active) === 1 ? '#10b981' : '#ef4444'}; font-weight: 700;">● ${Number(cp.is_active) === 1 ? 'Active' : 'Disabled'}</span></td>
            <td style="white-space: nowrap;">
                <button type="button" class="admin-btn" style="padding: 4px 10px; font-size: 0.78rem;" onclick="editCoupon(${Number(cp.id)})">Edit</button>
                <button type="button" style="border: none; background: #dc2626; color: #fff; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.78rem;" onclick="deleteCoupon(${Number(cp.id)})">Delete</button>
            </td>
        </tr>
    `).join('');
}

function resetCouponForm() {
    document.getElementById('coupon-form').reset();
    document.getElementById('new-cp-id').value = '';
    document.getElementById('new-cp-active').checked = true;
    document.getElementById('coupon-form-title').textContent = '+ Create Coupon';
    document.getElementById('coupon-submit').textContent = 'Create Coupon';
    document.getElementById('coupon-cancel').style.display = 'none';
}

function editCoupon(id) {
    const coupon = couponsById.get(Number(id));
    if (!coupon) {
        alert('Coupon details are not loaded. Refresh the coupon list and try again.');
        return;
    }
    document.getElementById('new-cp-id').value = String(coupon.id);
    document.getElementById('new-cp-code').value = coupon.code || '';
    document.getElementById('new-cp-val').value = coupon.value ?? '';
    document.getElementById('new-cp-type').value = coupon.type || 'percentage';
    document.getElementById('new-cp-min').value = coupon.min_order ?? 0;
    document.getElementById('new-cp-max').value = coupon.max_discount ?? '';
    document.getElementById('new-cp-expiry').value = coupon.expiry_date || '';
    document.getElementById('new-cp-limit').value = coupon.usage_limit ?? 0;
    document.getElementById('new-cp-active').checked = Number(coupon.is_active) === 1;
    document.getElementById('coupon-form-title').textContent = `Edit coupon ${coupon.code}`;
    document.getElementById('coupon-submit').textContent = 'Save Coupon Changes';
    document.getElementById('coupon-cancel').style.display = 'inline-block';
    document.getElementById('coupon-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function handleSaveCoupon(event) {
    event.preventDefault();
    const id = document.getElementById('new-cp-id').value;
    const value = Number(document.getElementById('new-cp-val').value);
    const type = document.getElementById('new-cp-type').value;
    if (!document.getElementById('new-cp-code').value.trim() || !Number.isFinite(value) || value <= 0 || (type === 'percentage' && value > 100)) {
        alert('Enter a coupon code and a valid discount value.');
        return;
    }
    const payload = {
        ...(id ? { id: Number(id) } : {}),
        code: document.getElementById('new-cp-code').value.trim(),
        value,
        type,
        min_order: Number(document.getElementById('new-cp-min').value || 0),
        max_discount: document.getElementById('new-cp-max').value || null,
        expiry_date: document.getElementById('new-cp-expiry').value || null,
        usage_limit: Number(document.getElementById('new-cp-limit').value || 0),
        is_active: document.getElementById('new-cp-active').checked ? 1 : 0
    };
    const response = await adminFetch(`${API_BASE}/coupons`, {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') {
        alert(result.error || 'Could not save the coupon.');
        return;
    }
    resetCouponForm();
    await loadCoupons();
}

async function deleteCoupon(id) {
    if (!confirm('Delete this coupon?')) return;
    const response = await adminFetch(`${API_BASE}/coupons?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok || result.status !== 'success') {
        alert(result.error || 'Could not delete the coupon.');
        return;
    }
    await loadCoupons();
}

// 7. INVENTORY
async function loadInventory() {
    const res = await adminFetch(`${API_BASE}/inventory`);
    const json = await res.json();
    const sum = json.summary;

    document.getElementById('inv-summary-banner').innerHTML = `
        <div style="background: #0f172a; padding: 12px 20px; border-radius: 8px; border: 1px solid #334155;">
            <strong>Total Products:</strong> ${Number(sum.total_products) || 0}
        </div>
        <div style="background: #0f172a; padding: 12px 20px; border-radius: 8px; border: 1px solid #334155; color: #fbbf24;">
            <strong>Low Stock (≤5):</strong> ${Number(sum.low_stock_count) || 0}
        </div>
        <div style="background: #0f172a; padding: 12px 20px; border-radius: 8px; border: 1px solid #334155; color: #ef4444;">
            <strong>Out of Stock:</strong> ${Number(sum.out_of_stock_count) || 0}
        </div>
    `;

    const tbody = document.querySelector('#inventory-table tbody');
    tbody.innerHTML = (json.data || []).map(item => `
        <tr>
            <td style="font-weight: 700; color: #f8fafc;">${escapeAdminHtml(item.name)}</td>
            <td style="color: #94a3b8;">${escapeAdminHtml(item.sku)}</td>
            <td style="font-size: 1.1rem; font-weight: 800; color: ${Number(item.stock_quantity) <= 5 ? '#ef4444' : '#10b981'};">${Number(item.stock_quantity) || 0}</td>
            <td><span style="font-size: 0.8rem; font-weight: 700;">${escapeAdminHtml(item.stock_status)}</span></td>
            <td>
                <button onclick="adjustInventory(${Number.isSafeInteger(Number(item.id)) ? Number(item.id) : 0}, -1)" class="admin-btn" style="padding: 4px 10px; font-size: 0.8rem;">-1</button>
                <button onclick="adjustInventory(${Number.isSafeInteger(Number(item.id)) ? Number(item.id) : 0}, 1)" class="admin-btn" style="padding: 4px 10px; font-size: 0.8rem;">+1</button>
                <button onclick="adjustInventory(${Number.isSafeInteger(Number(item.id)) ? Number(item.id) : 0}, 10)" class="admin-btn" style="padding: 4px 10px; font-size: 0.8rem; background: #38bdf8; color: #000;">+10</button>
            </td>
        </tr>
    `).join('');
}

async function adjustInventory(productId, delta) {
    await adminFetch(`${API_BASE}/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, action: 'adjust', delta })
    });
    loadInventory();
}

// 8. REPORTS
async function loadReports() {
    const res = await adminFetch(`${API_BASE}/reports`);
    const json = await res.json();
    const d = json.data;

    document.getElementById('reports-breakdown-box').innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
            <div style="background: #0f172a; padding: 20px; border-radius: 12px; border: 1px solid #334155;">
                <h4 style="color: #dc2626; margin-bottom: 12px;">Orders By Status</h4>
                ${d.status_breakdown.map(s => `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span>${escapeAdminHtml(s.order_status)}:</span>
                        <strong>${Number(s.count) || 0} orders (${formatBDT(s.revenue)})</strong>
                    </div>
                `).join('')}
            </div>

            <div style="background: #0f172a; padding: 20px; border-radius: 12px; border: 1px solid #334155;">
                <h4 style="color: #38bdf8; margin-bottom: 12px;">Top Performing Products</h4>
                ${d.top_products.map(p => `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span>${escapeAdminHtml(p.product_name)}:</span>
                        <strong>${Number(p.total_units_sold) || 0} sold</strong>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// 9. SETTINGS
async function loadSettings() {
    const res = await adminFetch(`${API_BASE}/settings`);
    const json = await res.json();
    const s = json.data || {};

    document.getElementById('set_store_name').value = s.store_name || 'Wonderful Collection';
    document.getElementById('set_announcement_text').value = s.announcement_text || 'Delivery availability and estimates are shown at checkout.';
    document.getElementById('set_fee_dhanmondi').value = s.delivery_fee_dhanmondi || '60';
    document.getElementById('set_fee_dhaka').value = s.delivery_fee_dhaka || '80';
    document.getElementById('set_fee_outside_dhaka').value = s.delivery_fee_outside_dhaka || '130';
    document.getElementById('set_bkash').value = s.bkash_number || '';
    document.getElementById('set_nagad').value = s.nagad_number || '';
    document.getElementById('set_rocket').value = s.rocket_number || '';
}

async function handleSaveSettings(e) {
    e.preventDefault();
    const payload = {
        store_name: document.getElementById('set_store_name').value,
        announcement_text: document.getElementById('set_announcement_text').value.trim(),
        delivery_fee_dhanmondi: document.getElementById('set_fee_dhanmondi').value,
        delivery_fee_dhaka: document.getElementById('set_fee_dhaka').value,
        delivery_fee_outside_dhaka: document.getElementById('set_fee_outside_dhaka').value,
        bkash_number: document.getElementById('set_bkash').value,
        nagad_number: document.getElementById('set_nagad').value,
        rocket_number: document.getElementById('set_rocket').value
    };
    await adminFetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    alert('Settings updated successfully!');
}

document.addEventListener('DOMContentLoaded', initializeAdmin);
