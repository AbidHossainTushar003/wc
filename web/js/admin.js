/**
 * Wonderful Collection - Web Admin Controller
 * Drives the 9 backend screens matching Image 2
 */

const API_BASE = '/api';
const ADMIN_TOKEN_KEY = 'wc_admin_token';
const ADMIN_NAME_KEY = 'wc_admin_name';

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
                password: document.getElementById('admin-password').value
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
        showAdminApp(result.data.full_name);
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
    return '৳' + Number(amount || 0).toLocaleString('en-BD');
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
                <div style="font-size: 1.6rem; font-weight: 800; color: #38bdf8;">${ov.total_orders}</div>
            </div>
            <div style="background: #0f172a; padding: 20px; border-radius: 12px; border: 1px solid #334155;">
                <div style="font-size: 0.8rem; color: #94a3b8;">Average Order (AOV)</div>
                <div style="font-size: 1.6rem; font-weight: 800; color: #fbbf24;">${formatBDT(ov.average_order_value)}</div>
            </div>
            <div style="background: #0f172a; padding: 20px; border-radius: 12px; border: 1px solid #334155;">
                <div style="font-size: 0.8rem; color: #94a3b8;">Low Stock Alerts</div>
                <div style="font-size: 1.6rem; font-weight: 800; color: #ef4444;">${ov.low_stock_alerts} Products</div>
            </div>
        `;

        const tbody = document.querySelector('#dash-orders-table tbody');
        tbody.innerHTML = (json.data.recent_orders || []).map(o => `
            <tr>
                <td style="font-weight: 800; color: #38bdf8;">${o.order_number}</td>
                <td>${o.customer_name}</td>
                <td>${o.delivery_area}</td>
                <td style="font-weight: 700;">${formatBDT(o.total)}</td>
                <td><span style="color: #fbbf24; font-weight: 700;">● ${o.order_status}</span></td>
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
    const tbody = document.querySelector('#products-table tbody');
    tbody.innerHTML = (json.data || []).map(p => `
        <tr>
            <td><img src="${Array.isArray(p.images) && p.images.length ? p.images[0] : (p.image || 'assets/product-placeholder.svg')}" style="width: 44px; height: 44px; border-radius: 6px; object-fit: cover;"></td>
            <td style="font-weight: 700; color: #f8fafc;">${p.name}</td>
            <td style="color: #94a3b8;">${p.category_name}</td>
            <td>${formatBDT(p.regular_price)}</td>
            <td style="color: #f97316; font-weight: 700;">${p.sale_price ? formatBDT(p.sale_price) : '-'}</td>
            <td style="font-weight: 700;">${p.stock_quantity}</td>
            <td><button onclick="deleteProduct(${p.id})" style="border: none; background: #dc2626; color: #fff; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.78rem;">Delete</button></td>
        </tr>
    `).join('');
}

async function showAddProductModal() {
    const form = document.getElementById('product-create-form');
    const isOpening = form.style.display === 'none';
    form.style.display = isOpening ? 'block' : 'none';
    if (!isOpening) return;

    form.reset();
    const status = document.getElementById('product-create-status');
    status.textContent = '';
    status.style.display = 'none';

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
        document.getElementById('new-product-name').focus();
    } catch (error) {
        status.textContent = error.message || 'Could not load product categories.';
        status.style.color = '#fca5a5';
        status.style.display = 'block';
    }
}

async function handleAddProduct(event) {
    event.preventDefault();
    const form = document.getElementById('product-create-form');
    const status = document.getElementById('product-create-status');
    const submit = document.getElementById('product-create-submit');
    const price = Number(document.getElementById('new-product-price').value);
    const salePriceInput = document.getElementById('new-product-sale-price').value;
    const salePrice = salePriceInput === '' ? null : Number(salePriceInput);
    let productCreated = false;

    if (salePrice !== null && salePrice >= price) {
        status.textContent = 'Sale price must be less than the regular price.';
        status.style.color = '#fca5a5';
        status.style.display = 'block';
        return;
    }

    submit.disabled = true;
    status.textContent = '';
    status.style.display = 'none';
    try {
        const response = await adminFetch(`${API_BASE}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: document.getElementById('new-product-name').value.trim(),
                category_id: document.getElementById('new-product-category').value,
                regular_price: price,
                sale_price: salePrice,
                stock_quantity: Number(document.getElementById('new-product-stock').value),
                sku: document.getElementById('new-product-sku').value.trim() || null,
                short_desc: document.getElementById('new-product-description').value.trim()
            })
        });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            throw new Error(result.error || 'Could not add the product.');
        }

        productCreated = true;
        form.reset();
        await loadProducts();
        form.style.display = 'none';
    } catch (error) {
        status.textContent = productCreated
            ? `Product was added, but the product list could not be refreshed: ${error.message}`
            : error.message || 'Could not add the product.';
        status.style.color = '#fca5a5';
        status.style.display = 'block';
    } finally {
        submit.disabled = false;
    }
}

async function deleteProduct(id) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    await adminFetch(`${API_BASE}/products?id=${id}`, { method: 'DELETE' });
    loadProducts();
}

// 3. CATEGORIES
async function loadCategories() {
    const res = await adminFetch(`${API_BASE}/categories`);
    const json = await res.json();
    const tbody = document.querySelector('#categories-table tbody');
    tbody.innerHTML = (json.data || []).map(c => `
        <tr>
            <td style="font-weight: 700; color: #f8fafc;">${c.name}</td>
            <td style="color: #94a3b8;">${c.slug}</td>
            <td style="font-weight: 700;">${c.product_count || 0}</td>
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
    tbody.innerHTML = (json.data || []).map(o => `
        <tr>
            <td style="font-weight: 800; color: #38bdf8;">${o.order_number}</td>
            <td>
                <strong>${o.customer_name}</strong><br>
                <a href="tel:${o.customer_phone}" style="color: #38bdf8; font-size: 0.82rem;">📞 ${o.customer_phone}</a> | 
                <a href="https://wa.me/880${o.customer_phone.replace(/^0+/, '')}" target="_blank" style="color: #10b981; font-size: 0.82rem;">💬 WA</a>
            </td>
            <td>${o.delivery_area}</td>
            <td style="font-weight: 800; color: #f97316;">${formatBDT(o.total)}</td>
            <td><strong style="color: #fbbf24;">● ${o.order_status}</strong></td>
            <td>
                <select onchange="updateOrderStatus(${o.id}, this.value)" style="background: #0f172a; color: #fff; border: 1px solid #334155; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">
                    <option value="">Change Status...</option>
                    <option value="Pending" ${o.order_status==='Pending'?'selected':''}>Pending</option>
                    <option value="Processing" ${o.order_status==='Processing'?'selected':''}>Processing</option>
                    <option value="Shipped" ${o.order_status==='Shipped'?'selected':''}>Shipped</option>
                    <option value="Delivered" ${o.order_status==='Delivered'?'selected':''}>Delivered</option>
                    <option value="Cancelled" ${o.order_status==='Cancelled'?'selected':''}>Cancelled</option>
                </select>
            </td>
        </tr>
    `).join('');
}

async function updateOrderStatus(orderId, newStatus) {
    if (!newStatus) return;
    await adminFetch(`${API_BASE}/orders`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, order_status: newStatus })
    });
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
            <td style="font-weight: 700; color: #f8fafc;">${c.name}</td>
            <td>${c.email}<br><span style="color: #38bdf8;">${c.phone}</span></td>
            <td>${c.address || c.area} (${c.city})</td>
            <td style="font-weight: 700;">${c.total_orders || 1}</td>
            <td style="font-weight: 800; color: #10b981;">${formatBDT(c.total_spent || 0)}</td>
        </tr>
    `).join('');
}

// 6. COUPONS
async function loadCoupons() {
    const res = await adminFetch(`${API_BASE}/coupons`);
    const json = await res.json();
    const tbody = document.querySelector('#coupons-table tbody');
    tbody.innerHTML = (json.data || []).map(cp => `
        <tr>
            <td style="font-weight: 800; color: #38bdf8;">${/dhanmondi/i.test(cp.code) ? 'Legacy coupon' : cp.code}</td>
            <td>${cp.type === 'percentage' ? cp.value + '%' : formatBDT(cp.value)}</td>
            <td>${formatBDT(cp.min_order)}</td>
            <td><span style="color: ${cp.is_active ? '#10b981' : '#ef4444'}; font-weight: 700;">● ${cp.is_active ? 'Active' : 'Disabled'}</span></td>
        </tr>
    `).join('');
}

async function handleAddCoupon() {
    const code = document.getElementById('new-cp-code').value.trim();
    const val = document.getElementById('new-cp-val').value;
    const type = document.getElementById('new-cp-type').value;
    const min = document.getElementById('new-cp-min').value;

    if (!code || !val) return alert('Code and value required');
    await adminFetch(`${API_BASE}/coupons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, value: val, type, min_order: min || 0 })
    });
    alert('Coupon created!');
    loadCoupons();
}

// 7. INVENTORY
async function loadInventory() {
    const res = await adminFetch(`${API_BASE}/inventory`);
    const json = await res.json();
    const sum = json.summary;

    document.getElementById('inv-summary-banner').innerHTML = `
        <div style="background: #0f172a; padding: 12px 20px; border-radius: 8px; border: 1px solid #334155;">
            <strong>Total Products:</strong> ${sum.total_products}
        </div>
        <div style="background: #0f172a; padding: 12px 20px; border-radius: 8px; border: 1px solid #334155; color: #fbbf24;">
            <strong>Low Stock (≤5):</strong> ${sum.low_stock_count}
        </div>
        <div style="background: #0f172a; padding: 12px 20px; border-radius: 8px; border: 1px solid #334155; color: #ef4444;">
            <strong>Out of Stock:</strong> ${sum.out_of_stock_count}
        </div>
    `;

    const tbody = document.querySelector('#inventory-table tbody');
    tbody.innerHTML = (json.data || []).map(item => `
        <tr>
            <td style="font-weight: 700; color: #f8fafc;">${item.name}</td>
            <td style="color: #94a3b8;">${item.sku}</td>
            <td style="font-size: 1.1rem; font-weight: 800; color: ${item.stock_quantity <= 5 ? '#ef4444' : '#10b981'};">${item.stock_quantity}</td>
            <td><span style="font-size: 0.8rem; font-weight: 700;">${item.stock_status}</span></td>
            <td>
                <button onclick="adjustInventory(${item.id}, -1)" class="admin-btn" style="padding: 4px 10px; font-size: 0.8rem;">-1</button>
                <button onclick="adjustInventory(${item.id}, 1)" class="admin-btn" style="padding: 4px 10px; font-size: 0.8rem;">+1</button>
                <button onclick="adjustInventory(${item.id}, 10)" class="admin-btn" style="padding: 4px 10px; font-size: 0.8rem; background: #38bdf8; color: #000;">+10</button>
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
                        <span>${s.order_status}:</span>
                        <strong>${s.count} orders (${formatBDT(s.revenue)})</strong>
                    </div>
                `).join('')}
            </div>

            <div style="background: #0f172a; padding: 20px; border-radius: 12px; border: 1px solid #334155;">
                <h4 style="color: #38bdf8; margin-bottom: 12px;">Top Performing Products</h4>
                ${d.top_products.map(p => `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span>${p.product_name}:</span>
                        <strong>${p.total_units_sold} sold</strong>
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
    document.getElementById('set_fee_dhanmondi').value = s.delivery_fee_dhanmondi || '60';
    document.getElementById('set_fee_dhaka').value = s.delivery_fee_dhaka || '80';
    document.getElementById('set_bkash').value = s.bkash_number || '';
    document.getElementById('set_nagad').value = s.nagad_number || '';
    document.getElementById('set_rocket').value = s.rocket_number || '';
}

async function handleSaveSettings(e) {
    e.preventDefault();
    const payload = {
        store_name: document.getElementById('set_store_name').value,
        delivery_fee_dhanmondi: document.getElementById('set_fee_dhanmondi').value,
        delivery_fee_dhaka: document.getElementById('set_fee_dhaka').value,
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
