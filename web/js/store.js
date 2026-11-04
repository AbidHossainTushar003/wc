/**
 * Wonderful Collection - Frontend Store & Client Application
 * Handles Cart, Wishlist, API Communication, Checkout, and UI interactions
 */

const Store = {
    API_BASE: '/api',

    state: {
        cart: [],
        wishlist: [],
        appliedCoupon: null,
        user: null
    },

    init() {
        this.loadState();
        this.updateBadgeCounters();
        this.bindGlobalEvents();
        this.updateCategoryNavigation();
        this.bindLocationControls();
        this.loadPublicAnnouncement();
        console.log('🛍️ Wonderful Collection Store Initialized');
    },

    async loadPublicAnnouncement() {
        const announcement = document.getElementById('announcement-copy');
        if (!announcement) return;
        try {
            const response = await fetch(`${this.API_BASE}/settings?public=1`);
            const result = await response.json();
            if (!response.ok || result.status !== 'success') {
                throw new Error(result.error || 'Could not load store announcement.');
            }
            const text = String(result.data.announcement_text || '').trim();
            if (text) {
                document.querySelectorAll('.announcement-marquee-copy').forEach(copy => {
                    copy.textContent = text;
                });
            }
        } catch (error) {
            console.error('Could not load store announcement:', error);
        }
    },

    bindLocationControls() {
        const button = document.getElementById('nav-location-button');
        if (!button) return;
        const savedLocation = sessionStorage.getItem('wc_delivery_location');
        if (savedLocation) {
            try {
                const location = JSON.parse(savedLocation);
                button.textContent = `📍 ${location.label}`;
            } catch (error) {
                sessionStorage.removeItem('wc_delivery_location');
            }
        }

        button.addEventListener('click', async () => {
            button.disabled = true;
            button.textContent = 'Finding location…';
            try {
                const location = await this.detectDeliveryLocation();
                sessionStorage.setItem('wc_delivery_location', JSON.stringify(location));
                button.textContent = `📍 ${location.label}`;
            } catch (error) {
                button.textContent = '📍 Use my location';
                this.showToast(error.message || 'Could not detect your location. You can choose a delivery area at checkout.');
            } finally {
                button.disabled = false;
            }
        });
    },

    async detectDeliveryLocation() {
        if (!sessionStorage.getItem('wc_nominatim_consent')) {
            const consent = window.confirm('To identify your delivery area, your location coordinates will be sent to OpenStreetMap for a lookup. Continue?');
            if (!consent) {
                throw new Error('Location lookup was cancelled. Choose your delivery area manually at checkout.');
            }
            sessionStorage.setItem('wc_nominatim_consent', '1');
        }
        if (!navigator.geolocation) {
            throw new Error('Location is not supported by this browser. Choose your delivery area at checkout.');
        }

        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, () => {
                reject(new Error('Location permission was denied or unavailable. Choose your delivery area at checkout.'));
            }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
        });
        const { latitude, longitude } = position.coords;
        const query = new URLSearchParams({
            format: 'jsonv2',
            lat: latitude.toFixed(6),
            lon: longitude.toFixed(6),
            zoom: '14',
            addressdetails: '1'
        });
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`, {
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) {
            throw new Error('Location lookup is temporarily unavailable. Choose your delivery area at checkout.');
        }

        const result = await response.json();
        const address = result.address || {};
        if (address.country_code !== 'bd') {
            throw new Error('We currently deliver within Bangladesh. Choose your delivery area manually at checkout.');
        }

        const locality = [
            address.suburb || address.neighbourhood || address.quarter || address.city_district,
            address.city || address.town || address.village || address.county,
            address.state
        ].filter(Boolean);
        const uniqueLocality = [...new Set(locality)];
        const label = uniqueLocality.length ? uniqueLocality.join(', ') : 'Bangladesh';
        const dhakaLocation = [
            address.city,
            address.town,
            address.city_district,
            address.county,
            address.state_district
        ].filter(Boolean).join(' ').toLowerCase();
        const neighborhood = [
            address.suburb,
            address.neighbourhood,
            address.quarter,
            address.city_district
        ].filter(Boolean).join(' ').toLowerCase();
        const zone = /dhanmondi/.test(neighborhood)
            ? 'dhanmondi'
            : /dhaka/.test(dhakaLocation) ? 'dhaka' : 'outside_dhaka';

        return { label, zone };
    },

    loadState() {
        try {
            this.state.cart = JSON.parse(localStorage.getItem('wc_cart') || '[]');
            this.state.wishlist = JSON.parse(localStorage.getItem('wc_wishlist') || '[]');
            this.state.appliedCoupon = JSON.parse(localStorage.getItem('wc_coupon') || 'null');
            if (localStorage.getItem('wc_user')) {
                localStorage.removeItem('wc_user');
            }
            this.state.user = JSON.parse(sessionStorage.getItem('wc_user') || 'null');
        } catch (e) {
            console.error('Storage error:', e);
        }
    },

    saveState() {
        try {
            localStorage.setItem('wc_cart', JSON.stringify(this.state.cart));
            localStorage.setItem('wc_wishlist', JSON.stringify(this.state.wishlist));
            localStorage.setItem('wc_coupon', JSON.stringify(this.state.appliedCoupon));
            sessionStorage.setItem('wc_user', JSON.stringify(this.state.user));
            if (localStorage.getItem('wc_user')) {
                localStorage.removeItem('wc_user');
            }
            this.updateBadgeCounters();
        } catch (e) {
            console.error('Save state error:', e);
        }
    },

    formatBDT(amount) {
        return '৳' + Number(amount || 0).toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    },

    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[char]);
    },

    isSafeProductImage(image) {
        return typeof image === 'string'
            && (image.startsWith('https://') || /^assets\/[a-z0-9._/-]+$/i.test(image));
    },

    productImage(product) {
        const image = Array.isArray(product.images) ? product.images[0] : product.image;
        return this.isSafeProductImage(image) ? image : 'assets/product-placeholder.svg';
    },

    async updateCategoryNavigation() {
        const nav = document.querySelector('.nav-links');
        if (!nav) return;
        const categories = await this.fetchCategories();
        if (!categories.length) return;

        const fixedItems = Array.from(nav.querySelectorAll('li')).filter(item => {
            const link = item.querySelector('a');
            return link && (link.getAttribute('href') === 'index.html' || link.getAttribute('href') === 'shop.html');
        });
        nav.replaceChildren(...fixedItems);
        categories.forEach(category => {
            const item = document.createElement('li');
            const link = document.createElement('a');
            link.href = `category.html?cat=${encodeURIComponent(category.slug)}`;
            link.textContent = category.name;
            item.appendChild(link);
            nav.appendChild(item);
        });
    },

    // --- CART METHODS ---
    addToCart(product, quantity = 1) {
        const stock = Number(product.stock_quantity);
        quantity = Number(quantity);
        if (!Number.isInteger(stock) || stock < 1) {
            this.showToast('This product is currently out of stock.');
            return false;
        }
        if (!Number.isInteger(quantity) || quantity < 1) {
            this.showToast('Choose a valid quantity.');
            return false;
        }

        const existing = this.state.cart.find(item => item.id === product.id);
        const nextQuantity = (existing?.quantity || 0) + quantity;
        if (nextQuantity > stock) {
            this.showToast(`Only ${stock} item(s) are currently in stock.`);
            return false;
        }
        const price = Number(product.sale_price || product.regular_price);
        const image = this.productImage(product);

        if (existing) {
            existing.quantity = nextQuantity;
            existing.stock_quantity = stock;
        } else {
            this.state.cart.push({
                id: product.id,
                name: product.name,
                price: price,
                regular_price: Number(product.regular_price),
                image: image,
                quantity: quantity,
                stock_quantity: stock,
                slug: product.slug
            });
        }
        this.saveState();
        this.showToast(`Added "${product.name}" to your cart! 🛍️`);
        this.renderDrawerCart();
        this.openDrawerCart();
        return true;
    },

    removeFromCart(productId) {
        this.state.cart = this.state.cart.filter(item => item.id !== productId);
        this.saveState();
        this.showToast('Item removed from cart.');
        this.renderDrawerCart();
        if (typeof renderCartPage === 'function') renderCartPage();
    },

    updateCartQuantity(productId, delta) {
        const item = this.state.cart.find(i => i.id === productId);
        if (!item) return;
        if (delta > 0 && Number.isInteger(Number(item.stock_quantity)) && item.quantity + delta > Number(item.stock_quantity)) {
            this.showToast(`Only ${item.stock_quantity} item(s) are currently in stock.`);
            return;
        }
        item.quantity += delta;
        if (item.quantity <= 0) {
            this.removeFromCart(productId);
            return;
        }
        this.saveState();
        this.renderDrawerCart();
        if (typeof renderCartPage === 'function') renderCartPage();
    },

    getCartSubtotal() {
        return this.state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    },

    getCartCount() {
        return this.state.cart.reduce((count, item) => count + item.quantity, 0);
    },

    clearCart() {
        this.state.cart = [];
        this.state.appliedCoupon = null;
        this.saveState();
    },

    // --- WISHLIST METHODS ---
    toggleWishlist(product) {
        const index = this.state.wishlist.findIndex(item => item.id === product.id);
        if (index > -1) {
            this.state.wishlist.splice(index, 1);
            this.showToast(`Removed from wishlist ❤️`);
        } else {
            this.state.wishlist.push({
                id: product.id,
                name: product.name,
                price: Number(product.sale_price || product.regular_price),
                regular_price: Number(product.regular_price),
                sale_price: Number(product.sale_price || 0),
                stock_quantity: Number(product.stock_quantity),
                image: this.productImage(product),
                slug: product.slug
            });
            this.showToast(`Saved to wishlist! ❤️`);
        }
        this.saveState();
        if (typeof renderWishlistPage === 'function') renderWishlistPage();
    },

    isInWishlist(productId) {
        return this.state.wishlist.some(item => item.id === productId);
    },

    // --- UI HELPERS ---
    updateBadgeCounters() {
        const cartCount = this.getCartCount();
        const wishCount = this.state.wishlist.length;

        document.querySelectorAll('.cart-count-badge').forEach(el => {
            el.textContent = cartCount;
            el.style.display = cartCount > 0 ? 'flex' : 'none';
        });

        document.querySelectorAll('.wish-count-badge').forEach(el => {
            el.textContent = wishCount;
            el.style.display = wishCount > 0 ? 'flex' : 'none';
        });
    },

    showToast(message) {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = 'toast';
        const text = document.createElement('span');
        text.textContent = message;
        toast.appendChild(text);
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    },

    openDrawerCart() {
        const overlay = document.querySelector('.cart-drawer-overlay');
        const drawer = document.querySelector('.cart-drawer');
        if (overlay && drawer) {
            overlay.classList.add('active');
            drawer.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    },

    closeDrawerCart() {
        const overlay = document.querySelector('.cart-drawer-overlay');
        const drawer = document.querySelector('.cart-drawer');
        if (overlay && drawer) {
            overlay.classList.remove('active');
            drawer.classList.remove('active');
            document.body.style.overflow = '';
        }
    },

    renderDrawerCart() {
        const body = document.querySelector('.cart-drawer .drawer-body');
        const footer = document.querySelector('.cart-drawer .drawer-footer');
        if (!body || !footer) return;

        if (this.state.cart.length === 0) {
            body.innerHTML = `
                <div style="text-align: center; padding: 48px 16px; color: #94a3b8;">
                    <div style="font-size: 3rem; margin-bottom: 12px;">🛍️</div>
                    <p style="font-weight: 700; color: #1e293b; font-size: 1.1rem;">Your shopping cart is empty</p>
                    <p style="font-size: 0.88rem; margin: 8px 0 20px;">Explore our curated collection and fill it with style.</p>
                    <a href="shop.html" class="btn-primary" style="display: inline-block; padding: 10px 20px; font-size: 0.88rem;" onclick="Store.closeDrawerCart()">Browse Shop</a>
                </div>
            `;
            footer.innerHTML = '';
            return;
        }

        let itemsHtml = '';
        this.state.cart.forEach(item => {
            itemsHtml += `
                <div class="drawer-cart-item">
                    <img src="${this.escapeHtml(this.productImage(item))}" alt="${this.escapeHtml(item.name)}" class="drawer-cart-img" onerror="this.onerror=null;this.src='assets/product-placeholder.svg'">
                    <div style="flex: 1;">
                        <a href="product.html?id=${Number(item.id)}" class="drawer-item-title" style="color: #0e2a47;">${this.escapeHtml(item.name)}</a>
                        <div class="drawer-item-price">${this.formatBDT(item.price)}</div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                            <div style="display: flex; align-items: center; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; background: #fff;">
                                <button onclick="Store.updateCartQuantity(${Number(item.id)}, -1)" style="border: none; background: #f8fafc; padding: 4px 10px; cursor: pointer; font-weight: bold;">-</button>
                                <span style="padding: 0 10px; font-size: 0.85rem; font-weight: 700;">${Number(item.quantity)}</span>
                                <button onclick="Store.updateCartQuantity(${Number(item.id)}, 1)" style="border: none; background: #f8fafc; padding: 4px 10px; cursor: pointer; font-weight: bold;">+</button>
                            </div>
                            <button onclick="Store.removeFromCart(${Number(item.id)})" style="border: none; background: none; color: #ef4444; font-size: 0.8rem; cursor: pointer;">Remove</button>
                        </div>
                    </div>
                </div>
            `;
        });
        body.innerHTML = itemsHtml;

        const subtotal = this.getCartSubtotal();
        footer.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 14px; font-weight: 700; font-size: 1.05rem;">
                <span>Subtotal:</span>
                <span style="color: #f05423;">${this.formatBDT(subtotal)}</span>
            </div>
            <p style="font-size: 0.78rem; color: #64748b; margin-bottom: 14px;">🚚 Fast delivery across Dhaka within 24 hours available at checkout.</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <a href="cart.html" class="btn-secondary" style="color: #0e2a47; border-color: #cbd5e1; justify-content: center; text-align: center; padding: 12px;" onclick="Store.closeDrawerCart()">View Cart</a>
                <a href="checkout.html" class="btn-primary" style="justify-content: center; text-align: center; padding: 12px;" onclick="Store.closeDrawerCart()">Checkout</a>
            </div>
        `;
    },

    bindGlobalEvents() {
        document.querySelectorAll('.open-cart-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.renderDrawerCart();
                this.openDrawerCart();
            });
        });

        const drawerClose = document.querySelector('.cart-drawer .drawer-close');
        if (drawerClose) {
            drawerClose.addEventListener('click', () => this.closeDrawerCart());
        }

        const overlay = document.querySelector('.cart-drawer-overlay');
        if (overlay) {
            overlay.addEventListener('click', () => this.closeDrawerCart());
        }

        document.addEventListener('click', event => {
            const target = event.target instanceof Element
                ? event.target.closest('[data-add-to-cart], [data-toggle-wishlist]')
                : null;
            if (!target) return;
            try {
                const product = JSON.parse(target.dataset.product);
                if (target.hasAttribute('data-add-to-cart')) {
                    this.addToCart(product);
                } else {
                    this.toggleWishlist(product);
                    target.classList.toggle('active', this.isInWishlist(product.id));
                }
            } catch (error) {
                console.error('Could not process product action:', error);
                this.showToast('Could not process that product. Please refresh and try again.');
            }
        });
    },

    // --- API WRAPPERS ---
    async fetchProducts(params = {}) {
        try {
            const query = new URLSearchParams(params).toString();
            const res = await fetch(`${this.API_BASE}/products${query ? '?' + query : ''}`);
            const json = await res.json();
            if (!res.ok || !Array.isArray(json.data)) throw new Error(json.message || `Request failed (${res.status})`);
            return json.data;
        } catch (e) {
            console.error('Fetch products error:', e);
            this.showToast('Products could not be loaded. Please try again shortly.');
            return [];
        }
    },

    async fetchProductById(id) {
        try {
            const res = await fetch(`${this.API_BASE}/products?id=${id}`);
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`);
            return json.data || null;
        } catch (e) {
            console.error('Fetch product by id error:', e);
            this.showToast('Product details could not be loaded. Please try again shortly.');
            return null;
        }
    },

    async fetchCategories() {
        try {
            const res = await fetch(`${this.API_BASE}/categories`);
            const json = await res.json();
            if (!res.ok || !Array.isArray(json.data)) throw new Error(json.message || `Request failed (${res.status})`);
            return json.data;
        } catch (e) {
            console.error('Fetch categories error:', e);
            this.showToast('Categories could not be loaded. Please try again shortly.');
            return [];
        }
    },

    async validateCoupon(code, subtotal) {
        try {
            const res = await fetch(`${this.API_BASE}/coupons`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'validate', code: code, subtotal: subtotal })
            });
            return await res.json();
        } catch (e) {
            return { error: 'Network error validating coupon' };
        }
    },

    async placeOrder(orderPayload) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (this.state.user && this.state.user.token) {
                headers.Authorization = `Bearer ${this.state.user.token}`;
            }
            const res = await fetch(`${this.API_BASE}/orders`, {
                method: 'POST',
                headers,
                body: JSON.stringify(orderPayload)
            });
            return await res.json();
        } catch (e) {
            return { error: 'Failed to connect to checkout service.' };
        }
    },

    async trackOrder(orderOrCode, phone) {
        try {
            const res = await fetch(`${this.API_BASE}/track`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order: orderOrCode, phone: phone || '' })
            });
            return await res.json();
        } catch (e) {
            return { error: 'Tracking service unreachable' };
        }
    }
};

document.addEventListener('DOMContentLoaded', () => Store.init());
