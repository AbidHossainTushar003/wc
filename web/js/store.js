/**
 * Shopademia - Frontend Store & Client Application
 * Handles Cart, Wishlist, API Communication, Checkout, and UI interactions
 */

const Store = {
    API_BASE: '/api',
    cartSync: Promise.resolve(true),
    heroCarouselTimer: null,
    primaryNavigationOptions: [
        { id: 'home', label: 'Home', href: 'index.html' },
        { id: 'shop', label: 'Shop', href: 'shop.html' },
        { id: 'search', label: 'Search', href: 'search.html' },
        { id: 'offers', label: 'Offers & Deals', href: 'shop.html?sort=sale' },
        { id: 'track-order', label: 'Track Order', href: 'track-order.html' },
        { id: 'orders', label: 'My Orders', href: 'orders.html' },
        { id: 'contact', label: 'Contact', href: 'contact.html' },
        { id: 'about', label: 'About Us', href: 'about.html' },
        { id: 'faq', label: 'FAQ', href: 'faq.html' },
        { id: 'shipping-policy', label: 'Shipping & Delivery', href: 'shipping-policy.html' },
        { id: 'refund-policy', label: 'Returns & Refunds', href: 'refund-policy.html' },
        { id: 'privacy', label: 'Privacy Policy', href: 'privacy.html' },
        { id: 'terms', label: 'Terms & Conditions', href: 'terms.html' },
        { id: 'cookie-policy', label: 'Cookie Policy', href: 'cookie-policy.html' },
        { id: 'login', label: 'Sign In / Register', href: 'login.html' },
        { id: 'forgot-password', label: 'Forgot Password', href: 'forgot-password.html' },
        { id: 'reset-password', label: 'Reset Password', href: 'reset-password.html' },
        { id: 'verify-email', label: 'Verify Email', href: 'verify-email.html' },
        { id: 'resend-verification', label: 'Resend Verification', href: 'resend-verification.html' },
        { id: 'profile', label: 'My Account', href: 'profile.html' },
        { id: 'wishlist', label: 'Wishlist', href: 'wishlist.html' },
        { id: 'cart', label: 'Shopping Cart', href: 'cart.html' },
        { id: 'checkout', label: 'Checkout', href: 'checkout.html' },
        { id: 'order-success', label: 'Order Confirmation', href: 'order-success.html' }
    ],

    state: {
        cart: [],
        wishlist: [],
        appliedCoupon: null,
        user: null
    },

    init() {
        this.loadState();
        if (this.state.user?.id) {
            this.cartSync = this.mergeGuestCartForUser(this.state.user).then(cart => {
                this.state.cart = cart;
                this.saveState();
                this.renderDrawerCart();
                if (typeof renderCartPage === 'function') renderCartPage();
                return true;
            }).catch(error => {
                console.error('Cart merge failed:', error);
                this.showToast('Your saved cart could not be synchronized. It remains on this device; try again when the service is available.');
                return false;
            });
        }
        this.updateBadgeCounters();
        this.bindGlobalEvents();
        this.bindNavigationMenu();
        void this.renderNavigation();
        this.bindHeroCarousel();
        this.bindLocationControls();
        this.recordSearchFromCurrentPage();
        this.loadPublicAnnouncement();
        this.loadCustomerNotificationCenter();
        this.loadSupportChat();
        console.log('🛍️ Shopademia Store Initialized');
    },

    loadSupportChat() {
        if (document.querySelector('script[data-support-chat-script]')) return;
        const script = document.createElement('script');
        script.src = '/js/support-chat.js?v=20261113-storefront-final-v2';
        script.dataset.supportChatScript = 'true';
        script.onload = () => window.SupportChat?.init();
        script.onerror = () => console.error('The support chat widget could not be loaded.');
        document.head.append(script);
    },

    loadCustomerNotificationCenter() {
        const actions = document.querySelector('.header-actions');
        const token = this.state.user?.token;
        if (!actions || typeof token !== 'string' || !token) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'customer-notification-center';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'header-action-btn customer-notification-trigger';
        button.setAttribute('aria-label', 'Notifications');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', 'customer-notification-panel');
        const icon = document.createElement('span');
        icon.className = 'icon';
        icon.textContent = '🔔';
        const label = document.createElement('span');
        label.textContent = 'Notifications';
        const badge = document.createElement('span');
        badge.className = 'action-count-badge customer-notification-count';
        badge.hidden = true;
        button.append(icon, label, badge);
        const panel = document.createElement('section');
        panel.id = 'customer-notification-panel';
        panel.className = 'customer-notification-panel';
        panel.setAttribute('aria-label', 'Your notifications');
        panel.hidden = true;
        const heading = document.createElement('h2');
        heading.textContent = 'Notifications';
        const list = document.createElement('div');
        list.className = 'customer-notification-list';
        list.textContent = 'Loading notifications…';
        panel.append(heading, list);
        wrapper.append(button, panel);
        actions.prepend(wrapper);

        const load = async () => {
            try {
                const response = await fetch('/api/notifications.php', {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: AbortSignal.timeout(10000)
                });
                const result = await response.json();
                if (!response.ok || result.status !== 'success' || !Array.isArray(result.data)) {
                    throw new Error(result.error || 'Notification center could not be loaded.');
                }
                const unreadCount = Number(result.unread_count) || 0;
                badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
                badge.hidden = unreadCount < 1;
                list.replaceChildren();
                if (!result.data.length) {
                    list.textContent = 'No notifications yet.';
                    return;
                }
                result.data.forEach(notification => {
                    const item = document.createElement('button');
                    item.type = 'button';
                    item.className = `customer-notification-item${notification.read_at ? '' : ' is-unread'}`;
                    const title = document.createElement('strong');
                    title.textContent = notification.title;
                    const body = document.createElement('span');
                    body.textContent = notification.body;
                    const timestamp = document.createElement('time');
                    timestamp.dateTime = notification.created_at;
                    timestamp.textContent = new Date(notification.created_at).toLocaleString();
                    item.append(title, body, timestamp);
                    item.addEventListener('click', async () => {
                        try {
                            const update = await fetch('/api/notifications.php', {
                                method: 'PUT',
                                headers: {
                                    'Content-Type': 'application/json',
                                    Authorization: `Bearer ${token}`
                                },
                                body: JSON.stringify({ id: Number(notification.id) }),
                                signal: AbortSignal.timeout(10000)
                            });
                            const updateResult = await update.json();
                            if (!update.ok || updateResult.status !== 'success') {
                                throw new Error(updateResult.error || 'Notification could not be marked as read.');
                            }
                            const target = new URL(notification.target_url, window.location.href);
                            if (target.origin !== window.location.origin) {
                                throw new Error('Notification destination is not allowed.');
                            }
                            window.location.assign(target.href);
                        } catch (error) {
                            console.error('Could not open customer notification:', error);
                        }
                    });
                    list.append(item);
                });
            } catch (error) {
                list.textContent = 'Notifications could not be loaded right now.';
                console.error('Customer notification center failed:', error);
            }
        };
        button.addEventListener('click', () => {
            const open = panel.hidden;
            panel.hidden = !open;
            button.setAttribute('aria-expanded', String(open));
            if (open) void load();
        });
        document.addEventListener('click', event => {
            if (!wrapper.contains(event.target) && !panel.hidden) {
                panel.hidden = true;
                button.setAttribute('aria-expanded', 'false');
            }
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !panel.hidden) {
                panel.hidden = true;
                button.setAttribute('aria-expanded', 'false');
                button.focus();
            }
        });
        void load();
        window.setInterval(() => {
            if (!document.hidden) void load();
        }, 60000);
    },

    async loadPublicAnnouncement() {
        const hasStoreContent = document.querySelector('.announcement-marquee-copy, .footer-social-links, #homepage-promo-banner');
        if (!hasStoreContent) return;
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
            const paymentNumbers = {
                bkash: result.data.bkash_number,
                nagad: result.data.nagad_number,
                rocket: result.data.rocket_number
            };
            document.querySelectorAll('[data-payment-wallet]').forEach(badge => {
                badge.hidden = !String(paymentNumbers[badge.dataset.paymentWallet] || '').trim();
            });
            this.applyPublicStoreContent(result.data);
            await this.renderHomepageCarousel();
        } catch (error) {
            console.error('Could not load store announcement:', error);
        }
    },

    applyPublicStoreContent(settings) {
        const social = [
            ['social_instagram_label', 'social_instagram_url', 'Instagram · ShopademiaBD', 'https://www.instagram.com/ShopademiaBD'],
            ['social_x_label', 'social_x_url', 'X · SHOPADEMIA', 'https://x.com/SHOPADEMIA'],
            ['social_facebook_label', 'social_facebook_url', 'Facebook · SHOPADEMIA', 'https://www.facebook.com/SHOPADEMIA']
        ];
        document.querySelectorAll('.footer-social-links').forEach(nav => {
            let heading = nav.querySelector('.footer-social-heading');
            if (!heading) {
                heading = document.createElement('span');
                heading.className = 'footer-social-heading';
                nav.prepend(heading);
            }
            heading.textContent = String(settings.social_heading || 'Follow us').slice(0, 40);
            const links = [...nav.querySelectorAll('a')];
            links.forEach((link, index) => {
                const keys = social[index];
                if (!keys) return;
                const label = String(settings[keys[0]] ?? keys[2]).trim();
                const url = String(settings[keys[1]] ?? keys[3]).trim();
                if (label) link.textContent = label;
                if (this.isSafeHomepageUrl(url)) link.href = url;
                link.hidden = !label || !url;
            });
        });

        const promo = document.getElementById('homepage-promo-banner');
        if (!promo) return;
        const setText = (selector, value, fallback) => {
            const element = promo.querySelector(selector);
            if (element) element.textContent = String(value ?? fallback).slice(0, 240);
        };
        setText('#homepage-promo-eyebrow', settings.homepage_promo_eyebrow, 'Explore the collection');
        setText('#homepage-promo-title', settings.homepage_promo_title, 'Discover Our Latest Collection');
        setText('#homepage-promo-description', settings.homepage_promo_description, 'Explore quality products selected for everyday living.');
        const button = promo.querySelector('#homepage-promo-link');
        const destination = String(settings.homepage_promo_link || 'shop.html').trim();
        if (button && this.isSafeHomepageUrl(destination)) button.href = destination;
        if (button) button.textContent = String(settings.homepage_promo_button_text || 'Shop Collection →').slice(0, 40);
        const image = String(settings.homepage_promo_image || '');
        if (/^assets\/hero\/[a-f0-9]{32}\.jpg$/i.test(image)) {
            promo.style.backgroundImage = `linear-gradient(90deg, rgba(28,24,20,.88), rgba(28,24,20,.3)), url("${image}")`;
            promo.classList.add('has-image');
        } else {
            promo.style.backgroundImage = '';
            promo.classList.remove('has-image');
        }
    },

    readSessionHistory(key) {
        try {
            const value = JSON.parse(sessionStorage.getItem(key) || '[]');
            return Array.isArray(value) ? value : [];
        } catch (error) {
            console.warn(`Could not read local ${key} history.`, error);
            return [];
        }
    },

    recordSearchFromCurrentPage() {
        if (!/\/search\.html$/i.test(window.location.pathname)) return;
        const query = new URLSearchParams(window.location.search).get('q')?.trim().toLowerCase();
        if (!query || query.length > 100) return;
        const searches = this.readSessionHistory('wc_search_history')
            .filter(value => typeof value === 'string' && value !== query);
        searches.unshift(query);
        try {
            sessionStorage.setItem('wc_search_history', JSON.stringify(searches.slice(0, 10)));
        } catch (error) {
            console.warn('Could not save local search history.', error);
        }
    },

    recordProductView(product) {
        const id = Number(product?.id);
        if (!Number.isSafeInteger(id) || id < 1) return;
        const viewed = this.readSessionHistory('wc_product_history')
            .map(Number).filter(value => Number.isSafeInteger(value) && value > 0 && value !== id);
        viewed.unshift(id);
        try {
            sessionStorage.setItem('wc_product_history', JSON.stringify(viewed.slice(0, 20)));
        } catch (error) {
            console.warn('Could not save local browsing history.', error);
        }
    },

    getRecommendedProducts(currentProduct, products, limit = 4) {
        const currentId = Number(currentProduct?.id);
        const categoryId = Number(currentProduct?.category_id);
        const viewedIds = new Set(this.readSessionHistory('wc_product_history').map(Number));
        const searches = this.readSessionHistory('wc_search_history')
            .filter(value => typeof value === 'string')
            .slice(0, 5);
        const queryTokens = new Set(searches.join(' ').split(/[^a-z0-9]+/i).filter(word => word.length > 2));
        const productTokens = product => new Set(
            `${product.name || ''} ${product.category_name || ''} ${product.short_desc || ''} ${product.description || ''}`
                .toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2)
        );
        const browsedProducts = products.filter(product => viewedIds.has(Number(product.id)));
        const browsedCategories = new Set(browsedProducts.map(product => Number(product.category_id)));
        const browsedTokens = new Set(browsedProducts.flatMap(product => [...productTokens(product)]));
        return products
            .filter(product => Number(product.id) !== currentId && Number(product.is_sellable ?? 1) === 1)
            .map(product => {
            const tokens = productTokens(product);
            let score = Number(product.category_id) === categoryId ? 5 : 0;
            if (browsedCategories.has(Number(product.category_id))) score += 3;
            for (const token of browsedTokens) {
                if (tokens.has(token)) score += 1;
            }
            for (const token of queryTokens) {
                if (tokens.has(token)) score += 2;
            }
                return { product, score };
            })
            .filter(entry => entry.score > 0)
            .sort((a, b) => b.score - a.score
                || Number(b.product.stock_quantity || 0) - Number(a.product.stock_quantity || 0)
                || Number(a.product.id) - Number(b.product.id))
            .slice(0, limit)
            .map(entry => entry.product);
    },

    async renderNavigation() {
        const nav = document.querySelector('.site-nav');
        const primary = document.getElementById('nav-links');
        const menu = document.getElementById('nav-menu-links');
        if (!nav || !primary || !menu) return;

        try {
            const [settingsResponse, categoryResponse] = await Promise.all([
                fetch(`${this.API_BASE}/settings?public=1`),
                fetch(`${this.API_BASE}/categories`)
            ]);
            const settings = await settingsResponse.json();
            const categoriesResult = await categoryResponse.json();
            if (!settingsResponse.ok || settings.status !== 'success'
                || !categoryResponse.ok || !Array.isArray(categoriesResult.data)) {
                throw new Error('Navigation links could not be loaded.');
            }
            const categories = categoriesResult.data.filter(category => !Number(category.is_archived));
            const allLinks = [
                ...this.primaryNavigationOptions,
                ...categories.map(category => ({
                    id: `category:${category.slug}`,
                    label: category.name,
                    href: `category.html?cat=${encodeURIComponent(category.slug)}`
                }))
            ];
            let configured = settings.data.primary_nav_links;
            if (typeof configured === 'string') {
                try {
                    configured = JSON.parse(configured);
                } catch (error) {
                    console.error('Primary navigation settings are not valid JSON.', error);
                    configured = [];
                }
            }
            if (!Array.isArray(configured)) configured = [];
            let primaryLinks = configured
                .map(id => allLinks.find(link => link.id === id))
                .filter(Boolean)
                .slice(0, 5);
            if (primaryLinks.length === 0) {
                primaryLinks = ['home', 'shop', 'category:mens-fashion', 'category:womens-fashion', 'contact']
                    .map(id => allLinks.find(link => link.id === id))
                    .filter(Boolean);
            }
            const currentPath = location.pathname.split('/').pop() || 'index.html';
            primary.innerHTML = primaryLinks.map(link => `
              <li><a href="${this.escapeHtml(link.href)}" ${currentPath === link.href.split(/[?#]/)[0] ? 'aria-current="page"' : ''}>${this.escapeHtml(link.label)}</a></li>
            `).join('');
            menu.innerHTML = allLinks.map(link => `
              <a href="${this.escapeHtml(link.href)}" ${currentPath === link.href.split(/[?#]/)[0] ? 'aria-current="page"' : ''}>${this.escapeHtml(link.label)}</a>
            `).join('');
            this.fitPrimaryNavigation();
            if (!this.navigationResizeObserver && 'ResizeObserver' in window) {
                this.navigationResizeObserver = new ResizeObserver(() => this.fitPrimaryNavigation());
                this.navigationResizeObserver.observe(nav.querySelector('.nav-container'));
            } else if (!this.navigationResizeHandler) {
                this.navigationResizeHandler = () => this.fitPrimaryNavigation();
                window.addEventListener('resize', this.navigationResizeHandler);
            }
        } catch (error) {
            console.error('Could not render store navigation.', error);
            primary.replaceChildren();
            menu.innerHTML = this.primaryNavigationOptions.map(link => `
              <a href="${this.escapeHtml(link.href)}">${this.escapeHtml(link.label)}</a>
            `).join('');
            this.fitPrimaryNavigation();
        }
    },

    fitPrimaryNavigation() {
        const container = document.querySelector('.site-nav .nav-container');
        const button = container?.querySelector('.nav-menu-toggle');
        const links = container?.querySelector('.nav-links');
        if (!container || !button || !links) return;

        const style = getComputedStyle(container);
        const itemGap = parseFloat(getComputedStyle(links).columnGap || getComputedStyle(links).gap) || 0;
        const buttonWidth = button.getBoundingClientRect().width || 0;
        const availableWidth = Math.max(0, container.clientWidth - (parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)) - buttonWidth - (parseFloat(style.gap) || 0));

        const items = Array.from(links.children);
        items.forEach(item => item.classList.remove('is-overflow-hidden'));
        if (items.length === 0) return;

        let usedWidth = 0;
        for (const item of items) {
            const width = item.getBoundingClientRect().width || 0;
            const nextWidth = usedWidth + width + (usedWidth === 0 ? 0 : itemGap);
            if (nextWidth <= availableWidth) {
                usedWidth = nextWidth;
                continue;
            }
            item.classList.add('is-overflow-hidden');
        }

        const visibleItems = items.filter(item => !item.classList.contains('is-overflow-hidden'));
        if (visibleItems.length > 5) {
            items.slice(5).forEach(item => item.classList.add('is-overflow-hidden'));
        }
    },

    bindNavigationMenu() {
        const nav = document.querySelector('.site-nav');
        const button = nav?.querySelector('.nav-menu-toggle');
        const panel = nav?.querySelector('.nav-menu-panel');
        const closeButton = nav?.querySelector('.nav-menu-close');
        if (!nav || !button || !panel) return;

        const closeMenu = restoreFocus => {
            panel.hidden = true;
            button.setAttribute('aria-expanded', 'false');
            if (restoreFocus) button.focus();
        };
        button.addEventListener('click', () => {
            panel.hidden = !panel.hidden;
            button.setAttribute('aria-expanded', String(!panel.hidden));
            if (!panel.hidden) {
                panel.querySelector('a')?.focus();
            }
        });
        closeButton?.addEventListener('click', () => closeMenu(true));
        panel.addEventListener('click', event => {
            if (event.target instanceof Element && event.target.closest('a')) closeMenu(false);
        });
        document.addEventListener('click', event => {
            if (!(event.target instanceof Node) || !nav.contains(event.target)) closeMenu(false);
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !panel.hidden) closeMenu(true);
        });
    },

    bindHeroCarousel() {
        const section = document.getElementById('homepage-hero');
        const slides = document.getElementById('hero-slides');
        const dots = document.getElementById('hero-carousel-dots');
        if (!section || !slides || !dots) return;
        let pointerStart = null;
        slides.addEventListener('pointerdown', event => {
            if (event.pointerType === 'touch') pointerStart = event.clientX;
        }, { passive: true });
        slides.addEventListener('pointerup', event => {
            if (pointerStart === null) return;
            const distance = event.clientX - pointerStart;
            pointerStart = null;
            if (Math.abs(distance) < 48) return;
            const buttons = [...dots.querySelectorAll('[data-hero-index]')];
            const activeIndex = [...slides.querySelectorAll('[data-hero-slide]')]
                .findIndex(slide => slide.classList.contains('is-active'));
            const next = (activeIndex + (distance < 0 ? 1 : -1) + buttons.length) % buttons.length;
            buttons[next]?.click();
        }, { passive: true });
    },

    async renderHomepageCarousel() {
        const section = document.getElementById('homepage-hero');
        const slidesContainer = document.getElementById('hero-slides');
        const controls = document.getElementById('hero-carousel-controls');
        const dots = document.getElementById('hero-carousel-dots');
        const status = document.getElementById('hero-carousel-status');
        if (!section || !slidesContainer || !controls || !dots) return;

        if (this.heroCarouselTimer !== null) {
            window.clearInterval(this.heroCarouselTimer);
            this.heroCarouselTimer = null;
        }
        try {
            const response = await fetch(`${this.API_BASE}/hero-slides.php?public=1`);
            const result = await response.json();
            if (!response.ok || result.status !== 'success' || !Array.isArray(result.data)) {
                throw new Error(result.error || 'Hero slides could not be loaded.');
            }
            const activeSlides = result.data.filter(slide =>
                slide && typeof slide.href === 'string' && this.isSafeHomepageUrl(slide.href)
                && this.isSafeProductImage(slide.image_desktop)
                && (!slide.image_mobile || this.isSafeProductImage(slide.image_mobile))
            );
            section.classList.toggle('is-single-slide', activeSlides.length === 1);
            if (activeSlides.length === 0) {
                slidesContainer.replaceChildren();
                controls.hidden = true;
                dots.replaceChildren();
                return;
            }
            slidesContainer.innerHTML = activeSlides.map((slide, index) => {
                const altText = String(slide.alt_text || '').trim();
                const ariaLabel = altText || `View featured offer ${index + 1}`;
                const mobileSource = slide.image_mobile
                    ? `<source media="(max-width: 640px)" srcset="${this.escapeHtml(slide.image_mobile)}">`
                    : '';
                return `<a class="hero-slide ${index === 0 ? 'is-active' : ''}"
                    data-hero-slide href="${this.escapeHtml(slide.href)}" aria-label="${this.escapeHtml(ariaLabel)}"
                    aria-hidden="${index !== 0}" tabindex="${index === 0 ? '0' : '-1'}">
                  <picture>${mobileSource}<img src="${this.escapeHtml(slide.image_desktop)}"
                    alt="${this.escapeHtml(altText)}" loading="${index === 0 ? 'eager' : 'lazy'}"
                    ${index === 0 ? 'fetchpriority="high"' : ''}></picture>
                </a>`;
            }).join('');
            if (activeSlides.length < 2) {
                controls.hidden = true;
                dots.replaceChildren();
                return;
            }
            controls.hidden = false;
            dots.innerHTML = activeSlides.map((slide, index) => `
              <button type="button" class="hero-carousel-dot" data-hero-index="${index}"
                aria-label="Show hero slide ${index + 1}" aria-current="${index === 0 ? 'true' : 'false'}"></button>
            `).join('');

            let activeIndex = 0;
            const renderActive = announce => {
                slidesContainer.querySelectorAll('[data-hero-slide]').forEach((slide, index) => {
                    const active = index === activeIndex;
                    slide.classList.toggle('is-active', active);
                    slide.setAttribute('aria-hidden', String(!active));
                    slide.tabIndex = active ? 0 : -1;
                });
                dots.querySelectorAll('button').forEach((dot, index) => {
                    dot.setAttribute('aria-current', String(index === activeIndex));
                });
                if (announce && status) status.textContent = `Slide ${activeIndex + 1} of ${activeSlides.length}`;
            };
            const showSlide = index => {
                activeIndex = index;
                renderActive(true);
            };
            dots.onclick = event => {
                if (!(event.target instanceof Element)) return;
                const dot = event.target.closest('[data-hero-index]');
                if (dot) showSlide(Number(dot.dataset.heroIndex));
            };
            dots.onkeydown = event => {
                if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
                event.preventDefault();
                const direction = event.key === 'ArrowRight' ? 1 : -1;
                const next = (activeIndex + direction + activeSlides.length) % activeSlides.length;
                showSlide(next);
                dots.querySelector(`[data-hero-index="${next}"]`)?.focus();
            };
            renderActive(false);
            if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                this.heroCarouselTimer = window.setInterval(() => {
                    activeIndex = (activeIndex + 1) % activeSlides.length;
                    renderActive(false);
                }, 5000);
            }
        } catch (error) {
            console.error('Could not render homepage hero slides.', error);
            slidesContainer.replaceChildren();
            controls.hidden = true;
            dots.replaceChildren();
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
            address.state_district,
            address.suburb,
            address.neighbourhood,
            address.quarter,
            address.village
        ].filter(Boolean).join(' ').toLowerCase();
        const isOutsideDhaka = /\b(gazipur|narshingdi|savar|cumilla|chittagong|khulna|rajshahi|bogura|rangpur|sylhet|outside dhaka)\b/.test(dhakaLocation);
        const zone = isOutsideDhaka ? 'outside_dhaka' : 'dhaka';

        return { label, zone };
    },

    loadState() {
        try {
            this.state.user = JSON.parse(sessionStorage.getItem('wc_user') || 'null');
            const accountCartKey = this.getAccountCartKey(this.state.user);
            this.state.cart = JSON.parse(
                (accountCartKey && localStorage.getItem(accountCartKey) !== null
                    ? localStorage.getItem(accountCartKey)
                    : localStorage.getItem('wc_cart')) || '[]'
            );
            this.state.wishlist = JSON.parse(localStorage.getItem('wc_wishlist') || '[]');
            this.state.appliedCoupon = JSON.parse(localStorage.getItem('wc_coupon') || 'null');
            if (localStorage.getItem('wc_user')) {
                localStorage.removeItem('wc_user');
            }
        } catch (e) {
            console.error('Storage error:', e);
            this.showToast('Saved shopping data could not be read from this device.');
        }
    },

    getAccountCartKey(user) {
        const userId = Number(user?.id);
        return Number.isSafeInteger(userId) && userId > 0 ? `wc_cart_account_${userId}` : null;
    },

    saveState() {
        try {
            const serializedCart = JSON.stringify(this.state.cart);
            const accountCartKey = this.getAccountCartKey(this.state.user);
            if (accountCartKey) {
                localStorage.setItem(accountCartKey, serializedCart);
            } else {
                const previousCart = localStorage.getItem('wc_cart');
                if (previousCart !== serializedCart) {
                    const revision = Number(localStorage.getItem('wc_guest_cart_revision') || 0) + 1;
                    localStorage.setItem('wc_guest_cart_revision', String(revision));
                }
                localStorage.setItem('wc_cart', serializedCart);
            }
            localStorage.setItem('wc_wishlist', JSON.stringify(this.state.wishlist));
            localStorage.setItem('wc_coupon', JSON.stringify(this.state.appliedCoupon));
            sessionStorage.setItem('wc_user', JSON.stringify(this.state.user));
            if (localStorage.getItem('wc_user')) {
                localStorage.removeItem('wc_user');
            }
            this.updateBadgeCounters();
        } catch (e) {
            console.error('Save state error:', e);
            this.showToast('Could not save your shopping data on this device.');
        }
    },

    async mergeGuestCartForUser(user) {
        const accountCartKey = this.getAccountCartKey(user);
        if (!accountCartKey) {
            throw new Error('A valid customer account is required to merge carts.');
        }

        const pendingKey = `${accountCartKey}_merge_pending`;
        const mergedRevisionKey = `${accountCartKey}_merged_revision`;
        const pendingText = localStorage.getItem(pendingKey);
        if (pendingText) {
            const pending = JSON.parse(pendingText);
            if (!Array.isArray(pending.cart) || typeof pending.revision !== 'string'
                || typeof pending.guestSnapshot !== 'string') {
                throw new Error('A saved cart merge recovery record is invalid.');
            }
            localStorage.setItem(accountCartKey, JSON.stringify(pending.cart));
            localStorage.setItem(mergedRevisionKey, pending.revision);
            if (localStorage.getItem('wc_cart') === pending.guestSnapshot) {
                localStorage.removeItem('wc_cart');
            }
            localStorage.removeItem(pendingKey);
        }

        const guestSnapshot = localStorage.getItem('wc_cart') || '[]';
        const guestCart = JSON.parse(guestSnapshot);
        const accountCart = JSON.parse(localStorage.getItem(accountCartKey) || '[]');
        if (!Array.isArray(guestCart) || !Array.isArray(accountCart)) {
            throw new Error('A saved cart has an invalid format.');
        }
        if (guestCart.length === 0) {
            return accountCart;
        }

        let revision = localStorage.getItem('wc_guest_cart_revision');
        if (!revision) {
            revision = '1';
            localStorage.setItem('wc_guest_cart_revision', revision);
        }
        if (localStorage.getItem(mergedRevisionKey) === revision) {
            if (localStorage.getItem('wc_cart') === guestSnapshot) {
                localStorage.removeItem('wc_cart');
            }
            return accountCart;
        }

        const quantities = new Map();
        for (const item of [...accountCart, ...guestCart]) {
            const productId = Number(item?.id);
            const quantity = Number(item?.quantity);
            if (!Number.isSafeInteger(productId) || productId < 1
                || !Number.isSafeInteger(quantity) || quantity < 1) {
                throw new Error('A saved cart item has invalid product or quantity data.');
            }
            if (item.variant_id !== undefined && item.variant_id !== null) {
                throw new Error('Variant cart merging is unavailable until variant checkout is supported by the API.');
            }
            quantities.set(productId, (quantities.get(productId) || 0) + quantity);
        }

        const products = new Map();
        for (const productId of [...quantities.keys()].sort((a, b) => a - b)) {
            const response = await fetch(`${this.API_BASE}/products?id=${encodeURIComponent(productId)}`);
            const result = await response.json();
            if (!response.ok || !result.data) {
                throw new Error(result.error || `Could not verify stock for product ${productId}.`);
            }
            products.set(productId, result.data);
        }

        const mergedCart = [];
        for (const [productId, requestedQuantity] of [...quantities.entries()].sort((a, b) => a[0] - b[0])) {
            const product = products.get(productId);
            const stock = Number(product.stock_quantity);
            const available = Number(product.is_sellable) === 1 && Number.isSafeInteger(stock)
                ? Math.max(0, Math.min(stock, 100))
                : 0;
            const quantity = Math.min(requestedQuantity, available);
            if (quantity === 0) {
                continue;
            }
            const price = Number(product.sale_price || product.regular_price);
            if (!Number.isFinite(price) || price <= 0) {
                throw new Error(`Could not verify the current price for product ${productId}.`);
            }
            mergedCart.push({
                id: productId,
                name: product.name,
                price,
                regular_price: Number(product.regular_price),
                image: this.productImage(product),
                quantity,
                stock_quantity: available,
                slug: product.slug
            });
        }

        const pending = JSON.stringify({ cart: mergedCart, revision, guestSnapshot });
        localStorage.setItem(pendingKey, pending);
        localStorage.setItem(accountCartKey, JSON.stringify(mergedCart));
        localStorage.setItem(mergedRevisionKey, revision);
        if (localStorage.getItem('wc_cart') === guestSnapshot) {
            localStorage.removeItem('wc_cart');
        }
        localStorage.removeItem(pendingKey);
        return mergedCart;
    },

    logoutLocal() {
        this.state.user = null;
        try {
            this.state.cart = JSON.parse(localStorage.getItem('wc_cart') || '[]');
        } catch (error) {
            console.error('Guest cart could not be restored after logout:', error);
            this.state.cart = [];
            this.showToast('The guest cart could not be restored on this device.');
        }
        this.saveState();
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

    isSafeHomepageUrl(url) {
        if (typeof url !== 'string') return false;
        const value = url.trim();
        if (!value || value.length > 500 || /[\u0000-\u0020\u007f\\]/.test(value)) return false;
        if (/^https?:\/\//i.test(value)) {
            try {
                return ['http:', 'https:'].includes(new URL(value).protocol);
            } catch (error) {
                return false;
            }
        }
        return !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value);
    },

    isPlaceholderProduct(product) {
        const candidate = String(product?.name || '').trim().toLowerCase();
        if (!candidate) return false;
        return /(?:^|[^a-z0-9])(?:gshhs|hahahh|bahahs|bshshs|dummy product|sample product|placeholder|test item|qa product|lorem ipsum)(?:$|[^a-z0-9])/i.test(candidate);
    },

    filterPublicProducts(products) {
        if (!Array.isArray(products)) return [];
        return products.filter(product => !this.isPlaceholderProduct(product));
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
        if (Number(product.is_sellable) !== 1) {
            this.showToast('This product is not available for sale.');
            return false;
        }
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
            this.drawerReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            drawer.setAttribute('role', 'dialog');
            drawer.setAttribute('aria-modal', 'true');
            drawer.setAttribute('aria-label', 'Shopping cart');
            drawer.tabIndex = -1;
            overlay.classList.add('active');
            drawer.classList.add('active');
            document.body.style.overflow = 'hidden';
            const firstControl = drawer.querySelector('button, a, input, select, textarea');
            (firstControl instanceof HTMLElement ? firstControl : drawer).focus();
        }
    },

    closeDrawerCart() {
        const overlay = document.querySelector('.cart-drawer-overlay');
        const drawer = document.querySelector('.cart-drawer');
        if (overlay && drawer) {
            overlay.classList.remove('active');
            drawer.classList.remove('active');
            document.body.style.overflow = '';
            if (this.drawerReturnFocus instanceof HTMLElement) {
                this.drawerReturnFocus.focus();
            }
        }
    },

    renderDrawerCart() {
        const body = document.querySelector('.cart-drawer .drawer-body');
        const footer = document.querySelector('.cart-drawer .drawer-footer');
        if (!body || !footer) return;

        if (this.state.cart.length === 0) {
            body.innerHTML = `
                <div style="text-align: center; padding: 48px 16px; color: #70695f;">
                    <div style="font-size: 3rem; margin-bottom: 12px;">🛍️</div>
                    <p style="font-weight: 700; color: #302d28; font-size: 1.1rem;">Your shopping cart is empty</p>
                    <p style="font-size: 0.88rem; margin: 8px 0 20px;">Explore our curated collection and fill it with style.</p>
                    <a href="shop.html" class="btn-primary" style="display: inline-block; padding: 10px 20px; font-size: 0.88rem;" data-csp-click="closeDrawerCart">Browse Shop</a>
                </div>
            `;
            footer.innerHTML = '';
            return;
        }

        let itemsHtml = '';
        this.state.cart.forEach(item => {
            itemsHtml += `
                <div class="drawer-cart-item">
                    <img src="${this.escapeHtml(this.productImage(item))}" alt="${this.escapeHtml(item.name)}" class="drawer-cart-img" data-image-fallback="assets/product-placeholder.svg">
                    <div style="flex: 1;">
                        <a href="product.html?id=${Number(item.id)}" class="drawer-item-title" style="color: #26231f;">${this.escapeHtml(item.name)}</a>
                        <div class="drawer-item-price">${this.formatBDT(item.price)}</div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                            <div style="display: flex; align-items: center; border: 1px solid #d6cec1; border-radius: 6px; overflow: hidden; background: #fff;">
                                <button data-csp-click="updateCartQuantity" data-product-id="${Number(item.id)}" data-quantity-delta="-1" style="border: none; background: #f7f4ee; padding: 4px 10px; cursor: pointer; font-weight: bold;">-</button>
                                <span style="padding: 0 10px; font-size: 0.85rem; font-weight: 700;">${Number(item.quantity)}</span>
                                <button data-csp-click="updateCartQuantity" data-product-id="${Number(item.id)}" data-quantity-delta="1" style="border: none; background: #f7f4ee; padding: 4px 10px; cursor: pointer; font-weight: bold;">+</button>
                            </div>
                            <button data-csp-click="removeFromCart" data-product-id="${Number(item.id)}" style="border: none; background: none; color: #ef4444; font-size: 0.8rem; cursor: pointer;">Remove</button>
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
                <span style="color: #302d28;">${this.formatBDT(subtotal)}</span>
            </div>
            <p style="font-size: 0.78rem; color: #69645b; margin-bottom: 14px;">🚚 Delivery options and estimates are shown at checkout.</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <a href="cart.html" class="btn-secondary" style="color: #26231f; border-color: #d6cec1; justify-content: center; text-align: center; padding: 12px;" data-csp-click="closeDrawerCart">View Cart</a>
                <a href="checkout.html" class="btn-primary" style="justify-content: center; text-align: center; padding: 12px;" data-csp-click="closeDrawerCart">Checkout</a>
            </div>
        `;
    },

    bindGlobalEvents() {
        const clickActions = {
            closeDrawerCart: () => this.closeDrawerCart(),
            updateCartQuantity: element => this.updateCartQuantity(
                Number(element.dataset.productId),
                Number(element.dataset.quantityDelta)
            ),
            removeFromCart: element => this.removeFromCart(Number(element.dataset.productId)),
            applyCartCoupon: () => window.applyCartCoupon(),
            adjustDetailQty: element => window.adjustDetailQty(Number(element.dataset.quantityDelta)),
            addCurrentProductToCart: () => window.addCurrentProductToCart(),
            switchAuthTab: element => window.switchAuthTab(element.dataset.cspValue),
            logoutCustomer: () => window.logoutCustomer(),
            deleteCustomerAccount: () => window.deleteCustomerAccount(),
            filterCategory: element => window.filterCategory('', element)
        };
        const submitActions = new Set([
            'handlePlaceOrder',
            'handleContactSubmit',
            'handleForgot',
            'handleLogin',
            'handleRegister',
            'handleSaveProfile',
            'handleTrack'
        ]);
        const changeActions = {
            handleProductImageSelection: (element, event) => window.handleProductImageSelection(event),
            onSortChange: element => window.onSortChange(element.value)
        };

        document.addEventListener('click', event => {
            const element = event.target instanceof Element
                ? event.target.closest('[data-csp-click]')
                : null;
            if (!element) return;
            const actionName = element.dataset.cspClick;
            if (Object.prototype.hasOwnProperty.call(clickActions, actionName)) {
                clickActions[actionName](element);
            } else {
                console.error(`Unknown store click action: ${actionName}`);
            }
        });
        document.addEventListener('submit', event => {
            const form = event.target;
            if (!(form instanceof HTMLFormElement) || !submitActions.has(form.dataset.cspSubmit)) return;
            event.preventDefault();
            const handler = window[form.dataset.cspSubmit];
            if (typeof handler !== 'function') {
                console.error(`Missing checkout form handler: ${form.dataset.cspSubmit}`);
                return;
            }
            handler(event);
        });
        document.addEventListener('change', event => {
            const element = event.target instanceof Element
                ? event.target.closest('[data-csp-change]')
                : null;
            if (!element) return;
            const actionName = element.dataset.cspChange;
            if (Object.prototype.hasOwnProperty.call(changeActions, actionName)) {
                changeActions[actionName](element, event);
            } else {
                console.error(`Unknown store change action: ${actionName}`);
            }
        });
        document.addEventListener('error', event => {
            const image = event.target;
            if (!(image instanceof HTMLImageElement) || image.dataset.fallbackApplied) return;
            const fallback = image.dataset.imageFallback;
            if (!fallback) return;
            image.dataset.fallbackApplied = 'true';
            image.src = fallback;
        }, true);

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
        document.addEventListener('keydown', event => {
            const drawer = document.querySelector('.cart-drawer.active');
            if (!drawer) return;
            if (event.key === 'Escape') {
                this.closeDrawerCart();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = Array.from(drawer.querySelectorAll('button, a, input, select, textarea'))
                .filter(element => element instanceof HTMLElement && !element.hasAttribute('disabled'));
            if (focusable.length === 0) {
                event.preventDefault();
                drawer.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
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
            return this.filterPublicProducts(json.data);
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
            if (res.status === 404) return null;
            if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`);
            const product = json.data || null;
            if (product && this.isPlaceholderProduct(product)) {
                return null;
            }
            return product;
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

    async trackOrder(orderOrCode, phone, qrTrackingCode) {
        try {
            const res = await fetch(`${this.API_BASE}/track`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    order: orderOrCode,
                    phone: phone || '',
                    ...(qrTrackingCode ? { qr_tracking_code: qrTrackingCode } : {})
                })
            });
            return await res.json();
        } catch (e) {
            return { error: 'Tracking service unreachable' };
        }
    }
};

document.addEventListener('DOMContentLoaded', () => Store.init());
