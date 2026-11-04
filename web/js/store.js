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
        console.log('🛍️ Wonderful Collection Store Initialized');
    },

    loadState() {
        try {
            this.state.cart = JSON.parse(localStorage.getItem('wc_cart') || '[]');
            this.state.wishlist = JSON.parse(localStorage.getItem('wc_wishlist') || '[]');
            this.state.appliedCoupon = JSON.parse(localStorage.getItem('wc_coupon') || 'null');
            this.state.user = JSON.parse(localStorage.getItem('wc_user') || 'null');
        } catch (e) {
            console.error('Storage error:', e);
        }
    },

    saveState() {
        try {
            localStorage.setItem('wc_cart', JSON.stringify(this.state.cart));
            localStorage.setItem('wc_wishlist', JSON.stringify(this.state.wishlist));
            localStorage.setItem('wc_coupon', JSON.stringify(this.state.appliedCoupon));
            localStorage.setItem('wc_user', JSON.stringify(this.state.user));
            this.updateBadgeCounters();
        } catch (e) {
            console.error('Save state error:', e);
        }
    },

    formatBDT(amount) {
        return '৳' + Number(amount || 0).toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    },

    // --- CART METHODS ---
    addToCart(product, quantity = 1) {
        const existing = this.state.cart.find(item => item.id === product.id);
        const price = Number(product.sale_price || product.regular_price);
        const image = Array.isArray(product.images) ? product.images[0] : (product.image || 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=500&q=80');

        if (existing) {
            existing.quantity += quantity;
        } else {
            this.state.cart.push({
                id: product.id,
                name: product.name,
                price: price,
                regular_price: Number(product.regular_price),
                image: image,
                quantity: quantity,
                slug: product.slug
            });
        }
        this.saveState();
        this.showToast(`Added "${product.name}" to your cart! 🛍️`);
        this.renderDrawerCart();
        this.openDrawerCart();
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
                image: Array.isArray(product.images) ? product.images[0] : product.image,
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
        toast.innerHTML = `<span>${message}</span>`;
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
                    <p style="font-size: 0.88rem; margin: 8px 0 20px;">Explore our curated Dhanmondi collection and fill it with style.</p>
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
                    <img src="${item.image}" alt="${item.name}" class="drawer-cart-img">
                    <div style="flex: 1;">
                        <a href="product.html?id=${item.id}" class="drawer-item-title" style="color: #0e2a47;">${item.name}</a>
                        <div class="drawer-item-price">${this.formatBDT(item.price)}</div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                            <div style="display: flex; align-items: center; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; background: #fff;">
                                <button onclick="Store.updateCartQuantity(${item.id}, -1)" style="border: none; background: #f8fafc; padding: 4px 10px; cursor: pointer; font-weight: bold;">-</button>
                                <span style="padding: 0 10px; font-size: 0.85rem; font-weight: 700;">${item.quantity}</span>
                                <button onclick="Store.updateCartQuantity(${item.id}, 1)" style="border: none; background: #f8fafc; padding: 4px 10px; cursor: pointer; font-weight: bold;">+</button>
                            </div>
                            <button onclick="Store.removeFromCart(${item.id})" style="border: none; background: none; color: #ef4444; font-size: 0.8rem; cursor: pointer;">Remove</button>
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
    },

    // --- API WRAPPERS ---
    async fetchProducts(params = {}) {
        try {
            const query = new URLSearchParams(params).toString();
            const res = await fetch(`${this.API_BASE}/products${query ? '?' + query : ''}`);
            const json = await res.json();
            return json.data || [];
        } catch (e) {
            console.error('Fetch products error:', e);
            return [];
        }
    },

    async fetchProductById(id) {
        try {
            const res = await fetch(`${this.API_BASE}/products?id=${id}`);
            const json = await res.json();
            return json.data || null;
        } catch (e) {
            console.error('Fetch product by id error:', e);
            return null;
        }
    },

    async fetchCategories() {
        try {
            const res = await fetch(`${this.API_BASE}/categories`);
            const json = await res.json();
            return json.data || [];
        } catch (e) {
            console.error('Fetch categories error:', e);
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
            const res = await fetch(`${this.API_BASE}/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderPayload)
            });
            return await res.json();
        } catch (e) {
            return { error: 'Failed to connect to checkout service.' };
        }
    },

    async trackOrder(orderOrCode, phone) {
        try {
            const query = new URLSearchParams({ order: orderOrCode, phone: phone || '' }).toString();
            const res = await fetch(`${this.API_BASE}/track?${query}`);
            return await res.json();
        } catch (e) {
            return { error: 'Tracking service unreachable' };
        }
    }
};

document.addEventListener('DOMContentLoaded', () => Store.init());
