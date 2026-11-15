/**
 * Shopademia - Standalone Full Stack Development Server
 * Zero dependencies! Runs with built-in Node.js modules.
 * Serves the local web frontend and development API; customer auth is intentionally disabled.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const net = require('node:net');
const { svgFor: createQrSvg } = require('./web/js/qr-code.js');

if (process.env.NODE_ENV === 'production') {
    console.error('The standalone development server must not run with NODE_ENV=production.');
    process.exit(1);
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 3210;
const HOST = process.env.HOST || '127.0.0.1';
const normalizedHost = HOST.toLowerCase();
const isLoopbackHost = normalizedHost === 'localhost'
    || (net.isIP(HOST) === 4 && Number(HOST.split('.')[0]) === 127)
    || (net.isIP(HOST) === 6 && normalizedHost === '::1');
if (!isLoopbackHost) {
    console.error('The standalone development server may only bind to a loopback address.');
    process.exit(1);
}
const WEB_DIR = path.join(__dirname, 'web');
const DATA_FILE = process.env.DEV_DATA_FILE || path.join(__dirname, 'dev-data.json');
const DEV_ADMIN_USERNAME = process.env.DEV_ADMIN_USERNAME || 'admin';
const DEV_ADMIN_PASSWORD = process.env.DEV_ADMIN_PASSWORD || require('crypto').randomBytes(18).toString('base64url');
const adminTokens = new Map();
const customerTokens = new Map();

function getBearerToken(req) {
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return '';
    return header.slice('Bearer '.length).trim();
}

function getAdminRequestToken(req) {
    if (req.headers['x-wc-admin-client'] === 'web') {
        const cookieHeader = req.headers.cookie || '';
        const match = cookieHeader.match(/(?:^|;\s*)wc_admin_dev=([A-Za-z0-9_-]+)/);
        return match ? match[1] : '';
    }
    return getBearerToken(req);
}

function isValidAdminToken(token) {
    if (!token) return false;
    const record = adminTokens.get(token);
    if (!record || record.expiresAt <= Date.now()) {
        adminTokens.delete(token);
        return false;
    }
    if (Number.isSafeInteger(record.adminId)) {
        const account = Array.isArray(store.adminAccounts)
            ? store.adminAccounts.find(item => Number(item.id) === record.adminId)
            : null;
        if (!account || account.is_active !== true) {
            adminTokens.delete(token);
            return false;
        }
    }
    const candidate = require('crypto').createHash('sha256').update(token).digest();
    const expected = require('crypto').createHash('sha256').update(record.token).digest();
    return require('crypto').timingSafeEqual(candidate, expected);
}

function isAllowedDevelopmentOrigin(origin) {
    if (!origin) return true;
    try {
        const url = new URL(origin);
        return (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
            && (url.protocol === 'http:' || url.protocol === 'https:');
    } catch {
        return false;
    }
}

function isSafeHomepageUrl(value) {
    if (typeof value !== 'string') {
        return false;
    }
    const url = value.trim();
    if (!url || url.length > 500 || /[\u0000-\u0020\u007f\\]/.test(url)) {
        return false;
    }
    if (/^https?:\/\//i.test(url)) {
        try {
            return ['http:', 'https:'].includes(new URL(url).protocol);
        } catch {
            return false;
        }
    }
    return !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url);
}

const HERO_PAGE_HREFS = {
    home: 'index.html',
    shop: 'shop.html',
    search: 'search.html',
    offers: 'shop.html?sort=sale',
    'track-order': 'track-order.html',
    orders: 'orders.html',
    contact: 'contact.html',
    about: 'about.html',
    faq: 'faq.html',
    'shipping-policy': 'shipping-policy.html',
    'refund-policy': 'refund-policy.html',
    privacy: 'privacy.html',
    terms: 'terms.html',
    'cookie-policy': 'cookie-policy.html',
    login: 'login.html',
    'forgot-password': 'forgot-password.html',
    'reset-password': 'reset-password.html',
    'verify-email': 'verify-email.html',
    'resend-verification': 'resend-verification.html',
    profile: 'profile.html',
    wishlist: 'wishlist.html',
    cart: 'cart.html',
    checkout: 'checkout.html',
    'order-success': 'order-success.html'
};

function isSafeHeroUrl(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 1000
        || /[\u0000-\u0020\u007f\\]/.test(value)) return false;
    const url = value.trim();
    if (/^https?:\/\//i.test(url)) {
        try {
            return ['http:', 'https:'].includes(new URL(url).protocol);
        } catch {
            return false;
        }
    }
    return !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url);
}

function isValidHeroDate(value) {
    if (value === null || value === '') return true;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
    const timestamp = Date.parse(`${value}:00Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 16) === value;
}

function resolveHeroSlideHref(slide) {
    if (slide.link_type === 'page') return HERO_PAGE_HREFS[slide.link_value] || null;
    if (slide.link_type === 'url') return isSafeHeroUrl(slide.link_value) ? slide.link_value.trim() : null;
    if (slide.link_type === 'product') {
        const product = store.products.find(item => Number(item.id) === Number(slide.link_value)
            && Number(item.is_archived) !== 1 && Number(item.is_sellable ?? 1) === 1);
        return product ? `product.html?id=${encodeURIComponent(product.id)}` : null;
    }
    if (slide.link_type === 'category') {
        const category = store.categories.find(item => Number(item.id) === Number(slide.link_value)
            && Number(item.is_archived) !== 1);
        return category ? `category.html?cat=${encodeURIComponent(category.slug)}` : null;
    }
    return null;
}

function validateProductPayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return 'Product details must be an object.';
    }
    if (Object.hasOwn(payload, 'name')
        && (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.trim().length > 255)) {
        return 'Product name is required and must be 255 characters or fewer.';
    }
    if (Object.hasOwn(payload, 'category_id')
        && (!/^\d+$/.test(String(payload.category_id)) || !Number.isSafeInteger(Number(payload.category_id))
            || Number(payload.category_id) < 1)) {
        return 'Category ID must be a valid positive integer.';
    }
    if (Object.hasOwn(payload, 'regular_price')
        && (!Number.isFinite(Number(payload.regular_price)) || Number(payload.regular_price) <= 0)) {
        return 'Regular price must be a positive number.';
    }
    if (Object.hasOwn(payload, 'sale_price') && payload.sale_price !== null && payload.sale_price !== ''
        && (!Number.isFinite(Number(payload.sale_price)) || Number(payload.sale_price) <= 0
            || (Object.hasOwn(payload, 'regular_price')
                && Number(payload.sale_price) >= Number(payload.regular_price)))) {
        return 'Sale price must be positive and lower than the regular price.';
    }
    if (Object.hasOwn(payload, 'stock_quantity')
        && (!Number.isSafeInteger(Number(payload.stock_quantity)) || Number(payload.stock_quantity) < 0)) {
        return 'Stock quantity must be a non-negative whole number.';
    }
    if (Object.hasOwn(payload, 'is_sellable')
        && ![true, false, 0, 1, '0', '1'].includes(payload.is_sellable)) {
        return 'is_sellable must be a boolean value.';
    }
    const limits = {
        seo_title: 70,
        meta_description: 160,
        focus_keyword: 100,
        h1: 150,
        alt_text: 200,
        canonical_url: 500
    };
    for (const [field, limit] of Object.entries(limits)) {
        if (!Object.hasOwn(payload, field)) continue;
        const value = payload[field];
        if (value !== null && typeof value !== 'string') return `${field} must be text.`;
        const text = String(value || '').trim();
        if (text.length > limit || /[\u0000-\u001f\u007f]/.test(text)) return `${field} is too long or contains invalid characters.`;
        if (field === 'canonical_url' && text) {
            let url;
            try {
                url = new URL(text);
            } catch {
                return 'Canonical URL must be a valid HTTPS URL on shopademia.store.';
            }
            if (url.protocol !== 'https:' || !['shopademia.store', 'www.shopademia.store'].includes(url.hostname.toLowerCase())) {
                return 'Canonical URL must be a valid HTTPS URL on shopademia.store.';
            }
        }
    }
    if (Object.hasOwn(payload, 'images')
        && (!Array.isArray(payload.images) || payload.images.length > 10
            || payload.images.some(image => typeof image !== 'string' || image.length > 500))) {
        return 'A product can have up to ten valid image paths.';
    }
    return null;
}

function jpegDimensions(bytes) {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset + 3 < bytes.length) {
        if (bytes[offset] !== 0xff) return null;
        while (bytes[offset] === 0xff) offset++;
        const marker = bytes[offset++];
        if (marker === 0xd9 || marker === 0xda) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (offset + 1 >= bytes.length) return null;
        const length = bytes.readUInt16BE(offset);
        if (length < 2 || offset + length > bytes.length) return null;
        if (frameMarkers.has(marker)) {
            if (length < 7) return null;
            return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
        }
        offset += length;
    }
    return null;
}

function webpDimensions(bytes) {
    if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF'
        || bytes.toString('ascii', 8, 12) !== 'WEBP') return null;
    const format = bytes.toString('ascii', 12, 16);
    if (format === 'VP8X') {
        return {
            width: 1 + bytes.readUIntLE(24, 3),
            height: 1 + bytes.readUIntLE(27, 3)
        };
    }
    if (format === 'VP8 ' && bytes.toString('hex', 23, 26) === '9d012a') {
        return {
            width: bytes.readUInt16LE(26) & 0x3fff,
            height: bytes.readUInt16LE(28) & 0x3fff
        };
    }
    return null;
}

function parseMultipartProductImages(buffer, boundary) {
    const sections = buffer.toString('latin1').split(`--${boundary}`);
    const images = [];
    for (const section of sections) {
        const separator = section.indexOf('\r\n\r\n');
        if (separator < 0 || !/content-disposition:[^\r\n]*name="images\[\]"[^\r\n]*filename="/i.test(section.slice(0, separator))) continue;
        const headers = section.slice(0, separator);
        const content = section.slice(separator + 4).replace(/\r\n--?$/, '').replace(/\r\n$/, '');
        const mime = headers.match(/content-type:\s*([^\r\n;]+)/i)?.[1]?.trim().toLowerCase();
        const bytes = Buffer.from(content, 'latin1');
        const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
        if (!extension) throw Object.assign(new Error('Product photos must be JPEG, PNG, or WebP images.'), { statusCode: 422 });
        const validSignature = extension === 'jpg'
            ? bytes[0] === 0xff && bytes[1] === 0xd8
            : extension === 'png'
                ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
                : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
        const dimensions = extension === 'jpg'
            ? jpegDimensions(bytes)
            : extension === 'png' && bytes.length >= 24
                ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
                : extension === 'webp' ? webpDimensions(bytes) : null;
        if (!validSignature || !dimensions || dimensions.width < 1 || dimensions.height < 1
            || dimensions.width > 6000 || dimensions.height > 6000) {
            throw Object.assign(new Error('Product photos must be valid images no larger than 6,000 × 6,000 pixels.'), { statusCode: 422 });
        }
        if (bytes.length < 1 || bytes.length > 1_500_000) {
            throw Object.assign(new Error('Each product image must be smaller than 1.5 MB.'), { statusCode: 413 });
        }
        images.push({ extension, bytes });
    }
    if (images.length < 1 || images.length > 5) {
        throw Object.assign(new Error('Upload between one and five product images per request.'), { statusCode: 422 });
    }
    return images;
}

// Initial seed data
const initialData = {
    settings: {
        store_name: "Shopademia",
        store_moto: "🛍️ Shopademia: Quality products, delivered across Bangladesh. 🇧🇩",
        store_email: "contact@wonderfulcollection.store",
        store_phone: "+880 1560-024777",
        store_address: "Dhaka, Bangladesh",
        currency_symbol: "৳",
        currency_code: "BDT",
        delivery_fee_dhaka: "80",
        delivery_fee_outside_dhaka: "130",
        free_delivery_min_amount: "2000",
        primary_nav_links: '["home","shop","category:mens-fashion","category:womens-fashion","contact"]',
        social_heading: 'Follow us',
        social_instagram_label: 'Instagram · ShopademiaBD',
        social_instagram_url: 'https://www.instagram.com/ShopademiaBD',
        social_x_label: 'X · SHOPADEMIA',
        social_x_url: 'https://x.com/SHOPADEMIA',
        social_facebook_label: 'Facebook · SHOPADEMIA',
        social_facebook_url: 'https://www.facebook.com/SHOPADEMIA',
        homepage_promo_eyebrow: 'Explore the collection',
        homepage_promo_title: 'Discover Our Latest Collection',
        homepage_promo_description: 'Explore quality products selected for everyday living.',
        homepage_promo_button_text: 'Shop Collection →',
        homepage_promo_link: 'shop.html',
        homepage_promo_image: '',
        bkash_number: "01560024777 (Personal)",
        nagad_number: "01560024777 (Personal)",
        rocket_number: "015600247777 (Personal)"
    },
    categories: [
        { id: 1, name: "Men's Fashion", slug: "mens-fashion", description: "Premium Panjabis, shirts, and traditional attire.", image: "assets/category-placeholder.svg", product_count: 1 },
        { id: 2, name: "Women's Fashion", slug: "womens-fashion", description: "Exquisite designer salwar kameez, sarees and kurtis.", image: "assets/category-placeholder.svg", product_count: 2 },
        { id: 3, name: "Perfumes & Attar", slug: "perfumes-attar", description: "Long-lasting Arabian oud, concentrated attars, and luxury fragrances.", image: "assets/category-placeholder.svg", product_count: 1 },
        { id: 4, name: "Gadgets & Electronics", slug: "gadgets-electronics", description: "Smartwatches, wireless earbuds, and lifestyle tech accessories.", image: "assets/category-placeholder.svg", product_count: 1 },
        { id: 5, name: "Leather & Accessories", slug: "leather-accessories", description: "100% Genuine Bangladeshi leather wallets, belts, and luxury bags.", image: "assets/category-placeholder.svg", product_count: 2 },
        { id: 6, name: "Home Decor & Living", slug: "home-decor", description: "Aesthetic scented candles, art pieces, and modern home essentials.", image: "assets/category-placeholder.svg", product_count: 1 }
    ],
    products: [
        {
            id: 1,
            name: "Royal Nawab Premium Cotton Panjabi - Navy Blue",
            slug: "royal-nawab-panjabi-navy",
            category_id: 1,
            category_name: "Men's Fashion",
            category_slug: "mens-fashion",
            regular_price: 2800.0,
            sale_price: 2350.0,
            stock_quantity: 18,
            sku: "WC-PANJ-001",
            short_desc: "Handcrafted semi-fitted 100% organic Egyptian cotton Panjabi with intricate threadwork on collar and placket.",
            description: "Experience exceptional elegance with our flagship Royal Nawab Panjabi. Tailored from 100% breathable organic Egyptian cotton, designed specifically for Dhaka's climate. Hand-embroidered mandarin collar, contrast buttons, and side pockets. Delivery options and estimated times are shown at checkout.",
            images: [
                "assets/product-placeholder.svg",
                "assets/product-placeholder.svg"
            ],
            is_featured: 1,
            is_trending: 1,
            reviews: [
                { id: 1, customer_name: "Fahim Morshed", rating: 5, comment: "Super fast delivery in Dhaka. The fabric is 10/10 quality! Definitely ordering again." },
                { id: 2, customer_name: "Sabbir Hossain", 5: 5, rating: 5, comment: "Fitting is very comfortable for Dhaka weather. Color is exact navy blue as shown in pictures." }
            ]
        },
        {
            id: 2,
            name: "Imperial Golden Oud & Amber Perfume (50ml)",
            slug: "imperial-golden-oud-amber",
            category_id: 3,
            category_name: "Perfumes & Attar",
            category_slug: "perfumes-attar",
            regular_price: 3500.0,
            sale_price: 2990.0,
            stock_quantity: 24,
            sku: "WC-PERF-002",
            short_desc: "Luxurious oriental fragrance featuring aged Cambodian agarwood, Madagascar vanilla, and warm amber.",
            description: "Our signature bestseller. Imperial Golden Oud opens with sparkling bergamot and saffron, blending seamlessly into rich agarwood, Bulgarian rose, and base notes of warm amber. Unmatched projection that lasts 14+ hours.",
            images: [
                "assets/product-placeholder.svg"
            ],
            is_featured: 1,
            is_trending: 1,
            reviews: [
                { id: 3, customer_name: "Dr. Ariful Islam", rating: 5, comment: "The oud projection is unbelievable. Lasts over 12 hours easily. Authentic fragrance!" }
            ]
        },
        {
            id: 3,
            name: "Handcrafted Full-Grain Leather Bi-Fold Wallet",
            slug: "full-grain-leather-wallet-brown",
            category_id: 5,
            category_name: "Leather & Accessories",
            category_slug: "leather-accessories",
            regular_price: 1650.0,
            sale_price: 1350.0,
            stock_quantity: 35,
            sku: "WC-LEATH-003",
            short_desc: "Crafted from authentic Hazaribagh full-grain cowhide leather with RFID blocking technology.",
            description: "Sleek, minimalist, and built for durability. Handcrafted from vegetable-tanned authentic Bangladeshi leather that patinas beautifully over time.",
            images: [
                "assets/product-placeholder.svg"
            ],
            is_featured: 1,
            is_trending: 0,
            reviews: []
        },
        {
            id: 4,
            name: "Blossom Designer Georgette 3-Piece",
            slug: "blossom-georgette-3piece",
            category_id: 2,
            category_name: "Women's Fashion",
            category_slug: "womens-fashion",
            regular_price: 4200.0,
            sale_price: 3650.0,
            stock_quantity: 12,
            sku: "WC-WOM-004",
            short_desc: "Heavy sequin and zari embroidered semi-stitched georgette kameez with digital printed silk dupatta.",
            description: "Turn heads at any festive gathering in Dhaka. Crafted on premium weightless georgette fabric adorned with delicate floral thread embroidery and shimmering sequins.",
            images: [
                "assets/product-placeholder.svg"
            ],
            is_featured: 1,
            is_trending: 1,
            reviews: [
                { id: 4, customer_name: "Sadia Rahman", rating: 5, comment: "Wore this to a family dawat in Dhaka, got so many compliments. Beautiful embroidery work." }
            ]
        },
        {
            id: 5,
            name: "Pro ANC Wireless Earbuds - Matte Obsidian",
            slug: "pro-anc-wireless-earbuds-black",
            category_id: 4,
            category_name: "Gadgets & Electronics",
            category_slug: "gadgets-electronics",
            regular_price: 2900.0,
            sale_price: 2450.0,
            stock_quantity: 40,
            sku: "WC-TECH-005",
            short_desc: "Active Noise Cancelling up to 35dB, Quad-Mic ENC for clear calls on Dhaka streets, 32-hour battery.",
            description: "Equipped with 13mm dynamic drivers for deep punchy bass, Bluetooth 5.3 low-latency connection, IPX5 water resistance, and fast Type-C charging.",
            images: [
                "assets/product-placeholder.svg"
            ],
            is_featured: 1,
            is_trending: 1,
            reviews: []
        },
        {
            id: 6,
            name: "Artisanal Soy Wax Scented Candle - Dhaka Rain",
            slug: "artisanal-candle-dhaka-rain",
            category_id: 6,
            category_name: "Home Decor & Living",
            category_slug: "home-decor",
            regular_price: 950.0,
            sale_price: 790.0,
            stock_quantity: 22,
            sku: "WC-HOME-006",
            short_desc: "Hand-poured 100% natural soy wax candle scented with petrichor, jasmine, and wet earthen sandalwood.",
            description: "Relive the nostalgic beauty of sudden monsoon rain. Poured by hand into reusable amber glass jars using unbleached cotton wicks.",
            images: [
                "assets/product-placeholder.svg"
            ],
            is_featured: 0,
            is_trending: 1,
            reviews: []
        },
        {
            id: 7,
            name: "Executive Chronograph Quartz Watch - Rose Gold",
            slug: "executive-chronograph-watch-rosegold",
            category_id: 5,
            category_name: "Leather & Accessories",
            category_slug: "leather-accessories",
            regular_price: 3800.0,
            sale_price: 3190.0,
            stock_quantity: 15,
            sku: "WC-ACC-007",
            short_desc: "Precision Japanese quartz movement with genuine leather strap and sapphire-coated mineral glass.",
            description: "A statement of refined taste. Clean architectural dial with date window, tachymeter bezel, 30m water resistance, and supple genuine leather strap.",
            images: [
                "assets/product-placeholder.svg"
            ],
            is_featured: 0,
            is_trending: 1,
            reviews: []
        },
        {
            id: 8,
            name: "Ultra-Fine Kashmiri Pashmina Shawl - Ruby Wine",
            slug: "kashmiri-pashmina-shawl-ruby",
            category_id: 2,
            category_name: "Women's Fashion",
            category_slug: "womens-fashion",
            regular_price: 3200.0,
            sale_price: 2750.0,
            stock_quantity: 8,
            sku: "WC-WOM-008",
            short_desc: "Featherlight softness with traditional Sozni needlework border, perfect for Dhaka winter evenings.",
            description: "Woven from finest grade Himalayan wool, exquisitely soft and warm yet effortlessly lightweight. Accented with timeless antique floral borders.",
            images: [
                "assets/product-placeholder.svg"
            ],
            is_featured: 0,
            is_trending: 0,
            reviews: []
        }
    ],
    customers: [
        { id: 1, name: "Tanvir Ahmed", email: "tanvir.dhk@example.com", phone: "01711223344", address: "House 14, Road 8, Dhaka", area: "Dhaka", city: "Dhaka", total_orders: 1, total_spent: 2410.0, is_vip: 0 },
        { id: 2, name: "Nusrat Jahan", email: "nusrat.j@example.com", phone: "01822334455", address: "Apt 4B, Dhaka", area: "Dhaka", city: "Dhaka", total_orders: 1, total_spent: 3345.0, is_vip: 0 },
        { id: 3, name: "Rahim Chowdhury", email: "rahim.chowdhury@example.com", phone: "01933445566", address: "Flat 6C, Gulshan-2, Dhaka", area: "Gulshan", city: "Dhaka", total_orders: 1, total_spent: 5320.0 }
    ],
    orders: [
        {
            id: 1,
            order_number: "WC-10021",
            customer_id: 1,
            customer_name: "Tanvir Ahmed",
            customer_phone: "01711223344",
            customer_email: "tanvir.dhk@example.com",
            delivery_address: "House 14, Road 8, Dhaka",
            delivery_area: "Inside Dhaka",
            delivery_fee: 60.0,
            subtotal: 2350.0,
            discount: 0.0,
            total: 2410.0,
            payment_method: "bKash",
            payment_status: "Paid",
            trx_id: "BKASH9823471",
            order_status: "Processing",
            tracking_code: "TRK-WC-7721",
            notes: "Deliver after 4 PM.",
            created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
            items: [
                { product_id: 1, product_name: "Royal Nawab Premium Cotton Panjabi - Navy Blue", price: 2350.0, quantity: 1, total: 2350.0 }
            ]
        },
        {
            id: 2,
            order_number: "WC-10022",
            customer_id: 2,
            customer_name: "Nusrat Jahan",
            customer_phone: "01822334455",
            customer_email: "nusrat.j@example.com",
            delivery_address: "Apt 4B, Dhaka",
            delivery_area: "Inside Dhaka",
            delivery_fee: 60.0,
            subtotal: 3650.0,
            discount: 365.0,
            total: 3345.0,
            payment_method: "Cash on Delivery",
            payment_status: "Pending",
            trx_id: null,
            order_status: "Pending",
            tracking_code: "TRK-WC-8842",
            notes: "Call before delivery.",
            created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
            items: [
                { product_id: 4, product_name: "Blossom Designer Georgette 3-Piece", price: 3650.0, quantity: 1, total: 3650.0 }
            ]
        },
        {
            id: 3,
            order_number: "WC-10020",
            customer_id: 3,
            customer_name: "Rahim Chowdhury",
            customer_phone: "01933445566",
            customer_email: "rahim.chowdhury@example.com",
            delivery_address: "Flat 6C, Gulshan-2, Dhaka",
            delivery_area: "Gulshan",
            delivery_fee: 80.0,
            subtotal: 5440.0,
            discount: 200.0,
            total: 5320.0,
            payment_method: "Nagad",
            payment_status: "Paid",
            trx_id: "NGD7716298",
            order_status: "Delivered",
            tracking_code: "TRK-WC-6619",
            notes: "Delivered with receipt.",
            created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
            items: [
                { product_id: 2, product_name: "Imperial Golden Oud & Amber Perfume (50ml)", price: 2990.0, quantity: 1, total: 2990.0 },
                { product_id: 5, product_name: "Pro ANC Wireless Earbuds - Matte Obsidian", price: 2450.0, quantity: 1, total: 2450.0 }
            ]
        }
    ],
    coupons: [
        { id: 1, code: "LOCAL10", type: "percentage", value: 10, min_order: 1000, max_discount: 500, expiry_date: "2028-12-31", usage_limit: 500, times_used: 42, is_active: 1 },
        { id: 2, code: "WONDERFUL100", type: "fixed", value: 100, min_order: 1500, max_discount: 100, expiry_date: "2028-12-31", usage_limit: 200, times_used: 19, is_active: 1 },
        { id: 3, code: "EIDSPECIAL", type: "percentage", value: 15, min_order: 2500, max_discount: 750, expiry_date: "2028-12-31", usage_limit: 300, times_used: 8, is_active: 1 }
    ],
    heroSlides: [],
    consentReceipts: []
};

// In-memory data store with file persistence
let store = initialData;
try {
    if (fs.existsSync(DATA_FILE)) {
        store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } else {
        fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
    }
} catch (e) {
    console.error('Data file init error, using memory:', e);
}
if (!store.settings.primary_nav_links) {
    store.settings.primary_nav_links = initialData.settings.primary_nav_links;
}
for (const key of [
    'social_heading', 'social_instagram_label', 'social_instagram_url',
    'social_x_label', 'social_x_url', 'social_facebook_label', 'social_facebook_url',
    'homepage_promo_eyebrow', 'homepage_promo_title', 'homepage_promo_description',
    'homepage_promo_button_text', 'homepage_promo_link', 'homepage_promo_image'
]) {
    if (!Object.hasOwn(store.settings, key)) store.settings[key] = initialData.settings[key];
}
delete store.settings.delivery_fee_local_dhaka;
if (!Array.isArray(store.heroSlides)) store.heroSlides = [];
if (!Array.isArray(store.customerCredentials)) store.customerCredentials = [];
if (!Array.isArray(store.supportChatConversations)) store.supportChatConversations = [];
if (!Array.isArray(store.supportChatMessages)) store.supportChatMessages = [];
if (!Array.isArray(store.supportChatFaq)) store.supportChatFaq = [];
if (!Array.isArray(store.customerFeedback)) store.customerFeedback = [];
if (!Array.isArray(store.notificationLogs)) store.notificationLogs = [];
if (!store.supportChatSettings) {
    store.supportChatSettings = { admin_online: 0, bot_wait_seconds: 60 };
}
if (!Array.isArray(store.adminRoles)) store.adminRoles = [];
if (!Array.isArray(store.adminAccounts)) store.adminAccounts = [];
if (!Array.isArray(store.adminAuditLog)) store.adminAuditLog = [];
if (!Array.isArray(store.consentReceipts)) store.consentReceipts = [];

const DEV_BUILTIN_ROLES = {
    'Super Admin': ['*.*'],
    'Inventory Manager': ['categories.read', 'products.read', 'inventory.read', 'inventory.adjust', 'inventory.set', 'suppliers.read'],
    'Order Manager': ['categories.read', 'products.read', 'orders.read', 'orders.update', 'feedback.read', 'feedback.update', 'support.read', 'support.update', 'customers.read', 'customers.update', 'couriers.read', 'couriers.create', 'reports.read'],
    'Sales Manager': ['categories.read', 'products.read', 'orders.read', 'orders.update', 'feedback.read', 'feedback.update', 'support.read', 'support.update', 'customers.read', 'customers.update', 'sales.read', 'sales.create', 'reports.read'],
    Accountant: ['accounts.read', 'accounts.transactions.read', 'accounts.transactions.create', 'accounts.salaries.read', 'accounts.salaries.pay', 'reports.read', 'sales.read', 'orders.read'],
    Viewer: ['categories.read', 'products.read', 'orders.read', 'customers.read', 'inventory.read', 'sales.read', 'accounts.read', 'accounts.transactions.read', 'suppliers.read', 'couriers.read', 'reports.read']
};
const DEV_ROLE_PERMISSION_CATALOG = new Set([
    'categories.read', 'categories.create', 'categories.update', 'categories.archive',
    'products.read', 'products.create', 'products.update', 'products.archive', 'products.images.upload',
    'orders.read', 'orders.update', 'customers.read', 'customers.update',
    'coupons.read', 'coupons.create', 'coupons.update', 'coupons.archive',
    'inventory.read', 'inventory.adjust', 'inventory.set',
    'reports.read', 'settings.read', 'settings.update', 'support.read', 'support.update',
    'feedback.read', 'feedback.update', 'accounts.read', 'accounts.transactions.read',
    'accounts.transactions.create', 'accounts.salaries.read', 'accounts.salaries.pay',
    'sales.read', 'sales.create', 'suppliers.read', 'suppliers.create', 'couriers.read', 'couriers.create',
    'administration.users.read', 'administration.roles.read'
]);
for (const [name, permissions] of Object.entries(DEV_BUILTIN_ROLES)) {
    if (!store.adminRoles.some(role => role.name === name)) store.adminRoles.push({ name, permissions });
}
if (!store.adminAccounts.some(account => account.username === DEV_ADMIN_USERNAME)) {
    store.adminAccounts.push({
        id: Math.max(0, ...store.adminAccounts.map(account => Number(account.id) || 0)) + 1,
        username: DEV_ADMIN_USERNAME,
        full_name: 'Wonderful Store Manager',
        role: 'Super Admin',
        is_active: true,
        password_hash: null,
        must_change_password: false,
        created_at: new Date().toISOString()
    });
}

function getDevRolePermissions(roleName) {
    if (Object.prototype.hasOwnProperty.call(DEV_BUILTIN_ROLES, roleName)) {
        return DEV_BUILTIN_ROLES[roleName];
    }
    return store.adminRoles.find(role => role.name === roleName)?.permissions || [];
}

function hasDevAdminPermission(roleName, permission) {
    const [module, action] = permission.split('.', 2);
    const grants = getDevRolePermissions(roleName);
    return grants.includes('*.*') || grants.includes(`${module}.*`) || grants.includes(permission);
}

function hashDevAdminPassword(password) {
    const crypto = require('crypto');
    const salt = crypto.randomBytes(16).toString('hex');
    return `${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyDevAdminPassword(password, encoded) {
    if (typeof password !== 'string' || password.length > 72
        || typeof encoded !== 'string' || !encoded.includes('$')) return false;
    const [salt, expectedHex] = encoded.split('$');
    if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(expectedHex || '')) return false;
    const actual = require('crypto').scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    return require('crypto').timingSafeEqual(actual, expected);
}

function normalizeDevBangladeshMobile(value) {
    if (typeof value !== 'string' || value.length > 30 || !/^[+0-9\s()-]+$/.test(value.trim())) return null;
    const digits = value.replace(/\D/g, '');
    if (/^01[3-9]\d{8}$/.test(digits)) return `+88${digits}`;
    if (/^8801[3-9]\d{8}$/.test(digits)) return `+${digits}`;
    return null;
}

function customerTokenFromRequest(req) {
    const header = req.headers.authorization;
    return typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice('Bearer '.length).trim() : '';
}

function getDevCustomerSession(req) {
    const token = customerTokenFromRequest(req);
    const session = customerTokens.get(token);
    if (!session || session.expiresAt <= Date.now()) {
        if (token) customerTokens.delete(token);
        return null;
    }
    const customer = store.customers.find(item => Number(item.id) === Number(session.customerId));
    return customer ? { token, session, customer } : null;
}

function requiredDevPermission(apiRoute, method, action, query) {
    const methodPermission = (read, write, create = write) =>
        method === 'GET' ? read : method === 'POST' ? create : method === 'PUT' ? write : method === 'DELETE' ? `${write.split('.')[0]}.archive` : read;
    const routes = {
        '/api/products': methodPermission('products.read', 'products.update', 'products.create'),
        '/api/product-images': 'products.images.upload',
        '/api/categories': methodPermission('categories.read', 'categories.update', 'categories.create'),
        '/api/orders': methodPermission('orders.read', 'orders.update'),
        '/api/customers': method === 'GET' ? 'customers.read' : 'customers.update',
        '/api/coupons': methodPermission('coupons.read', 'coupons.update', 'coupons.create'),
        '/api/inventory': method === 'GET' ? 'inventory.read' : 'inventory.adjust',
        '/api/reports': 'reports.read',
        '/api/settings': method === 'GET' ? 'settings.read' : 'settings.update',
        '/api/hero-slides': query.public === '1' ? null : 'settings.update',
        '/api/hero-slide-images': 'settings.update',
        '/api/feedback': method === 'GET' ? 'feedback.read' : 'feedback.update',
        '/api/notifications': 'orders.read'
    };
    if (apiRoute === '/api/support-chat') {
        if (['start', 'send', 'poll'].includes(action)) return null;
        if (action === 'admin_delete') return 'super-admin';
        return ['admin_list', 'admin_messages', 'admin_settings', 'admin_faq'].includes(action)
            && method === 'GET' ? 'support.read' : 'support.update';
    }
    if (apiRoute === '/api/consent') return method === 'POST' ? null : 'super-admin';
    if (apiRoute === '/api/receipt' || apiRoute === '/api/track') return null;
    return routes[apiRoute] || null;
}

const devBootstrapAdmin = store.adminAccounts.find(account => account.username === DEV_ADMIN_USERNAME);
if (devBootstrapAdmin) {
    devBootstrapAdmin.is_active = true;
    devBootstrapAdmin.role = 'Super Admin';
}

let persistenceFailed = false;
const supportChatRateLimits = new Map();
const adminPasswordResetRateLimits = new Map();

function saveStore() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
    } catch (error) {
        persistenceFailed = true;
        throw error;
    }
}

function parseIntegerInput(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return NaN;
    if (typeof value === 'string' && value.trim() === '') return NaN;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : NaN;
}

function isCouponAvailable(coupon) {
    if (!coupon || !coupon.is_active) return false;

    const expiryDate = coupon.expiry_date;
    if (expiryDate) {
        if (typeof expiryDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) return false;
        const parsedDate = new Date(`${expiryDate}T00:00:00Z`);
        if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== expiryDate) return false;
        if (expiryDate < new Date().toISOString().slice(0, 10)) return false;
    }

    const usageLimit = Number(coupon.usage_limit || 0);
    const timesUsed = Number(coupon.times_used || 0);
    return Number.isFinite(usageLimit) && Number.isFinite(timesUsed)
        && !(usageLimit > 0 && timesUsed >= usageLimit);
}

function inferCheckoutDeliveryZone(address) {
    if (/\b(gazipur|narshingdi|savar|cumilla|chittagong|khulna|rajshahi|bogura|rangpur|sylhet|outside dhaka)\b/i.test(address)) {
        return 'outside_dhaka';
    }
    return 'dhaka';
}

function canonicalizeOrderRequest(value, isRoot = true) {
    if (Array.isArray(value)) return value.map(entry => canonicalizeOrderRequest(entry, false));
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value)
        .filter(key => !isRoot || (key !== 'idempotency_key' && key !== 'confirmed_server_total'))
        .sort()
        .reduce((result, key) => {
            result[key] = canonicalizeOrderRequest(value[key], false);
            return result;
        }, {});
}

function getOrderRequestFingerprint(body) {
    return require('crypto').createHash('sha256')
        .update(JSON.stringify(canonicalizeOrderRequest(body)))
        .digest('hex');
}

function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function createOrderIdentifiers(orders) {
    for (let attempt = 0; attempt < 5; attempt++) {
        const orderNumber = `WC-${require('crypto').randomBytes(16).toString('hex').toUpperCase()}`;
        const trackingCode = `TRK-WC-${require('crypto').randomBytes(16).toString('hex').toUpperCase()}`;
        if (!orders.some(order => order.order_number === orderNumber || order.tracking_code === trackingCode)) {
            return { orderNumber, trackingCode };
        }
    }
    throw new Error('Could not generate unique order identifiers.');
}

// MIME types dictionary
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
};

const server = http.createServer(async (req, res) => {
    try {
    const origin = req.headers.origin;
    if (isAllowedDevelopmentOrigin(origin)) {
        if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Idempotency-Key, X-WC-Admin-Client, X-Chat-Token');
    }

    if (req.method === 'OPTIONS') {
        if (!isAllowedDevelopmentOrigin(origin)) {
            res.writeHead(403);
            return res.end('Forbidden origin');
        }
        res.writeHead(204);
        return res.end();
    }

    const parsedUrl = new URL(
        req.url.startsWith('//') ? `http://localhost${req.url}` : req.url,
        'http://localhost'
    );
    let pathname = parsedUrl.pathname;
    const query = querystring.parse(parsedUrl.search.slice(1));

    const isMultipartProductUpload = /^\/api\/product-images(?:\.php)?$/.test(pathname)
        && /^multipart\/form-data\b/i.test(String(req.headers['content-type'] || ''));
    const MAX_BODY_BYTES = /^\/api\/hero-slide-images(?:\.php)?$/.test(pathname)
        ? 4_300_000
        : isMultipartProductUpload ? 9_000_000 : 1024 * 1024;
    const readBody = () => new Promise((resolve, reject) => {
        const chunks = [];
        let bodyBytes = 0;
        let failed = false;
        req.on('data', chunk => {
            if (failed) return;
            bodyBytes += chunk.length;
            if (bodyBytes > MAX_BODY_BYTES) {
                failed = true;
                reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (failed) return;
            const body = Buffer.concat(chunks);
            if (isMultipartProductUpload) {
                const boundary = String(req.headers['content-type'] || '').match(/boundary=(?:"([^"]+)"|([^;]+))/i);
                if (!boundary) {
                    reject(Object.assign(new Error('Multipart image boundary is missing.'), { statusCode: 400 }));
                    return;
                }
                resolve({ multipartImages: body, multipartBoundary: (boundary[1] || boundary[2]).trim() });
                return;
            }
            try {
                resolve(body.length ? JSON.parse(body.toString('utf8')) : {});
            } catch (error) {
                reject(Object.assign(new Error('Malformed JSON request body'), { statusCode: 400 }));
            }
        });
        req.on('error', reject);
    });

    const sendJson = (data, code = 200, headers = {}) => {
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
        res.end(JSON.stringify(data, null, 2));
    };

    // Normalize API paths (supports both /api/products and /api/products.php)
    const apiRoute = pathname.replace(/\.php$/, '');

    // --- API ROUTES ---
    if (apiRoute.startsWith('/api/')) {
        if (persistenceFailed) {
            return sendJson({ error: 'Local data storage failed; restart the server before continuing.' }, 503);
        }
        const body = await readBody();
        const action = query.action || body.action || '';
        const customerSession = getDevCustomerSession(req);
        const customerScopedOrderRead = apiRoute === '/api/orders'
            && req.method === 'GET' && Boolean(query.customer_id) && Boolean(customerSession);
        const customerAuthRequest = apiRoute === '/api/auth'
            && req.method === 'POST'
            && ['customer_session', 'customer_update_profile', 'customer_delete_account'].includes(action)
            && Boolean(customerSession);
        const publicRoute = (req.method === 'GET'
            && ['/api/products', '/api/categories', '/api/settings', '/api/track'].includes(apiRoute))
            || (apiRoute === '/api/support-chat'
                && ((req.method === 'POST' && ['start', 'send'].includes(action))
                    || (req.method === 'GET' && action === 'poll')))
            || (apiRoute === '/api/hero-slides' && req.method === 'GET' && query.public === '1')
            || (apiRoute === '/api/receipt' && req.method === 'GET')
            || (apiRoute === '/api/track' && req.method === 'POST')
            || (apiRoute === '/api/orders' && req.method === 'POST')
            || (apiRoute === '/api/coupons' && req.method === 'POST' && action === 'validate')
            || (apiRoute === '/api/consent' && req.method === 'POST')
            || (apiRoute === '/api/auth' && req.method === 'POST'
                && ['admin_login', 'login', 'register', 'customer_logout'].includes(action));
        const adminReadRoute = req.headers['x-wc-admin-client'] === 'web'
            && ['/api/products', '/api/categories', '/api/settings'].includes(apiRoute);
        const requiresAdminSession = !publicRoute && !customerScopedOrderRead && !customerAuthRequest || adminReadRoute;
        const requestToken = getAdminRequestToken(req);
        const requestSession = adminTokens.get(requestToken);
        if (requiresAdminSession && !isValidAdminToken(requestToken)) {
            return sendJson({ error: 'Authentication required' }, 401);
        }
        if (requiresAdminSession) {
            if (requestSession?.mustChangePassword
                && !(apiRoute === '/api/auth' && ['admin_session', 'admin_permissions', 'admin_change_password', 'admin_logout'].includes(action))) {
                return sendJson({ error: 'Change your initial admin password before using the admin panel.' }, 403);
            }
            const permission = requiredDevPermission(apiRoute, req.method, action, query);
            if (permission === 'super-admin' && requestSession?.role !== 'Super Admin') {
                return sendJson({ error: 'Only a Super Admin can access this data.' }, 403);
            }
            if (permission && permission !== 'super-admin'
                && !hasDevAdminPermission(requestSession?.role || '', permission)) {
                return sendJson({ error: 'You are not authorized to perform this operation.' }, 403);
            }
        }

        if (apiRoute === '/api/support-chat') {
            const now = Date.now();
            const clientKey = typeof req.socket.remoteAddress === 'string' ? req.socket.remoteAddress : 'local';
            const applyChatRateLimit = (name, limit, windowMs) => {
                const key = `${clientKey}:${name}`;
                const current = supportChatRateLimits.get(key);
                if (!current || current.resetAt <= now) {
                    supportChatRateLimits.set(key, { count: 1, resetAt: now + windowMs });
                    return true;
                }
                current.count += 1;
                return current.count <= limit;
            };
            const cleanChatMessage = value => {
                if (typeof value !== 'string') return '';
                return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
            };
            const createChatMessage = (conversationId, senderType, message, senderId = null) => {
                const id = Math.max(0, ...store.supportChatMessages.map(item => Number(item.id) || 0)) + 1;
                const record = {
                    id,
                    conversation_id: conversationId,
                    sender_type: senderType,
                    sender_id: senderId,
                    message,
                    read_at: null,
                    created_at: new Date().toISOString()
                };
                store.supportChatMessages.push(record);
                const conversation = store.supportChatConversations.find(item => item.id === conversationId);
                if (conversation) conversation.last_activity_at = record.created_at;
                return record;
            };
            const findChatConversation = () => {
                const chatToken = req.headers['x-chat-token'];
                if (typeof chatToken !== 'string' || !/^[a-f0-9]{64}$/.test(chatToken)) return null;
                const tokenHash = require('crypto').createHash('sha256').update(chatToken).digest('hex');
                return store.supportChatConversations.find(item =>
                    item.chat_token_hash === tokenHash && Date.parse(item.chat_token_expires_at) > now
                ) || null;
            };
            const validMessage = cleanChatMessage(body.message);
            const conversationId = parseIntegerInput(body.conversation_id ?? query.conversation_id);

            if (req.method === 'POST' && action === 'start') {
                if (!applyChatRateLimit('start', 8, 60 * 60 * 1000)) {
                    return sendJson({ error: 'Too many chat sessions started. Please try again later.' }, 429);
                }
                if (!validMessage || validMessage.length > 2000) {
                    return sendJson({ error: 'Enter a message up to 2,000 characters.' }, 422);
                }
                const chatToken = require('crypto').randomBytes(32).toString('hex');
                const conversationId = Math.max(0, ...store.supportChatConversations.map(item => Number(item.id) || 0)) + 1;
                const createdAt = new Date().toISOString();
                store.supportChatConversations.push({
                    id: conversationId,
                    chat_token_hash: require('crypto').createHash('sha256').update(chatToken).digest('hex'),
                    chat_token_expires_at: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    customer_id: null,
                    guest_name: 'Guest',
                    guest_contact: '',
                    status: 'open',
                    assigned_admin_id: null,
                    last_activity_at: createdAt,
                    created_at: createdAt
                });
                createChatMessage(conversationId, 'guest', validMessage);
                saveStore();
                return sendJson({
                    status: 'success',
                    data: { conversation_token: chatToken, conversation_id: conversationId }
                }, 201);
            }

            if (req.method === 'GET' && action === 'poll') {
                const conversation = findChatConversation();
                if (!conversation) return sendJson({ error: 'This chat session was not found. Start a new conversation.' }, 404);
                const conversationMessages = store.supportChatMessages
                    .filter(item => item.conversation_id === conversation.id);
                if (query.read === '1') {
                    for (const item of conversationMessages) {
                        if (['admin', 'bot'].includes(item.sender_type) && !item.read_at) {
                            item.read_at = new Date().toISOString();
                        }
                    }
                    saveStore();
                }
                const chatMessages = store.supportChatMessages
                    .filter(item => item.conversation_id === conversation.id)
                    .slice(-100)
                    .map(item => ({
                        id: item.id,
                        sender_type: item.sender_type,
                        sender_id: item.sender_id,
                        message: item.message,
                        created_at: item.created_at,
                        actor_label: item.sender_type === 'admin'
                            ? 'Support team'
                            : item.sender_type === 'bot' ? 'AI automation' : 'You'
                    }));
                return sendJson({
                    status: 'success',
                    data: {
                        messages: chatMessages,
                        conversation_status: conversation.status,
                        unread_count: conversationMessages.filter(item =>
                            ['admin', 'bot'].includes(item.sender_type) && !item.read_at
                        ).length
                    }
                });
            }

            if (req.method === 'POST' && action === 'send') {
                if (!applyChatRateLimit('message', 12, 60 * 1000)) {
                    return sendJson({ error: 'You are sending messages too quickly. Please wait a moment.' }, 429);
                }
                const conversation = findChatConversation();
                if (!conversation) return sendJson({ error: 'This chat session was not found. Start a new conversation.' }, 404);
                if (conversation.status !== 'open') return sendJson({ error: 'This conversation is closed. Start a new one to continue.' }, 409);
                if (!validMessage || validMessage.length > 2000) {
                    return sendJson({ error: 'Enter a message up to 2,000 characters.' }, 422);
                }
                createChatMessage(conversation.id, 'guest', validMessage);
                saveStore();
                return sendJson({ status: 'success' });
            }

            if (req.method === 'GET' && action === 'admin_list') {
                const conversations = store.supportChatConversations
                    .filter(item => item.status === 'open')
                    .sort((left, right) => Date.parse(right.last_activity_at) - Date.parse(left.last_activity_at))
                    .slice(0, 100)
                    .map(conversation => {
                        const lastMessage = [...store.supportChatMessages].reverse()
                            .find(item => item.conversation_id === conversation.id);
                        return {
                            id: conversation.id,
                            guest_name: 'Guest',
                            guest_contact: 'Hidden',
                            status: conversation.status,
                            assigned_admin_id: conversation.assigned_admin_id,
                            last_activity_at: conversation.last_activity_at,
                            last_message: lastMessage?.message || '',
                            last_sender_type: lastMessage?.sender_type || 'guest',
                            last_sender_id: lastMessage?.sender_id ?? null,
                            unread_count: store.supportChatMessages.filter(item =>
                                item.conversation_id === conversation.id
                                && ['guest', 'customer'].includes(item.sender_type)
                                && !item.read_at
                            ).length
                        };
                    });
                return sendJson({ status: 'success', data: conversations });
            }

            if (req.method === 'GET' && action === 'admin_messages') {
                if (!Number.isSafeInteger(conversationId) || conversationId < 1) {
                    return sendJson({ error: 'A valid conversation is required.' }, 422);
                }
                const conversation = store.supportChatConversations.find(item => item.id === conversationId);
                if (!conversation) return sendJson({ error: 'Conversation not found.' }, 404);
                const chatMessages = store.supportChatMessages.filter(item => item.conversation_id === conversationId);
                for (const item of chatMessages) {
                    if (['guest', 'customer'].includes(item.sender_type) && !item.read_at) item.read_at = new Date().toISOString();
                }
                saveStore();
                return sendJson({
                    status: 'success',
                    data: chatMessages.slice(-200).map(item => ({
                        ...item,
                        actor_label: item.sender_type === 'admin' ? 'Support staff'
                            : item.sender_type === 'bot' ? 'AI automation' : 'Customer'
                    }))
                });
            }

            if (req.method === 'POST' && action === 'admin_reply') {
                if (!Number.isSafeInteger(conversationId) || conversationId < 1) {
                    return sendJson({ error: 'A valid conversation is required.' }, 422);
                }
                const conversation = store.supportChatConversations.find(item => item.id === conversationId && item.status === 'open');
                if (!conversation) return sendJson({ error: 'The conversation is not open.' }, 409);
                if (!validMessage || validMessage.length > 2000) {
                    return sendJson({ error: 'Enter a reply up to 2,000 characters.' }, 422);
                }
                createChatMessage(conversation.id, 'admin', validMessage);
                conversation.assigned_admin_id = 1;
                saveStore();
                return sendJson({ status: 'success' });
            }

            if (req.method === 'POST' && action === 'admin_close') {
                if (!Number.isSafeInteger(conversationId) || conversationId < 1) {
                    return sendJson({ error: 'A valid conversation is required.' }, 422);
                }
                const conversation = store.supportChatConversations.find(item => item.id === conversationId && item.status === 'open');
                if (!conversation) return sendJson({ error: 'The conversation is not open.' }, 409);
                conversation.status = 'closed';
                saveStore();
                return sendJson({ status: 'success' });
            }

            if (req.method === 'POST' && action === 'admin_delete') {
                if (adminTokens.get(getAdminRequestToken(req))?.role !== 'Super Admin') {
                    return sendJson({ error: 'Only a Super Admin can delete support conversations.' }, 403);
                }
                if (!Number.isSafeInteger(conversationId) || conversationId < 1) {
                    return sendJson({ error: 'A valid conversation is required.' }, 422);
                }
                const index = store.supportChatConversations.findIndex(item => item.id === conversationId);
                if (index < 0) return sendJson({ error: 'Conversation not found.' }, 404);
                store.supportChatConversations.splice(index, 1);
                store.supportChatMessages = store.supportChatMessages
                    .filter(item => item.conversation_id !== conversationId);
                store.adminAuditLog.push({
                    id: Math.max(0, ...store.adminAuditLog.map(item => Number(item.id) || 0)) + 1,
                    admin_id: requestSession.adminId,
                    action: 'delete_support_conversation',
                    details: { conversation_id: conversationId },
                    created_at: new Date().toISOString()
                });
                saveStore();
                return sendJson({ status: 'success' });
            }

            if (req.method === 'GET' && action === 'admin_settings') {
                return sendJson({ status: 'success', data: store.supportChatSettings });
            }

            if (req.method === 'POST' && action === 'admin_settings') {
                const wait = parseIntegerInput(body.bot_wait_seconds);
                if (!Number.isSafeInteger(wait) || wait < 10 || wait > 3600) {
                    return sendJson({ error: 'Bot wait must be between 10 and 3,600 seconds.' }, 422);
                }
                store.supportChatSettings.bot_wait_seconds = wait;
                saveStore();
                return sendJson({ status: 'success' });
            }

            if (req.method === 'POST' && action === 'admin_presence') {
                if (typeof body.online !== 'boolean') return sendJson({ error: 'A valid availability status is required.' }, 422);
                store.supportChatSettings.admin_online = body.online ? 1 : 0;
                saveStore();
                return sendJson({ status: 'success' });
            }

            if (req.method === 'GET' && action === 'admin_faq') {
                return sendJson({ status: 'success', data: store.supportChatFaq });
            }

            if (req.method === 'POST' && action === 'faq_save') {
                const question = cleanChatMessage(body.question);
                const answer = cleanChatMessage(body.answer);
                if (!question || question.length > 300 || !answer || answer.length > 4000) {
                    return sendJson({ error: 'Enter a question and answer within the allowed lengths.' }, 422);
                }
                const id = parseIntegerInput(body.id);
                const existing = Number.isSafeInteger(id) && id > 0
                    ? store.supportChatFaq.find(item => item.id === id)
                    : null;
                const faq = {
                    id: existing?.id || Math.max(0, ...store.supportChatFaq.map(item => Number(item.id) || 0)) + 1,
                    question,
                    answer,
                    keywords: cleanChatMessage(body.keywords || '').slice(0, 500),
                    is_active: body.is_active === false ? 0 : 1,
                    sort_order: Math.max(0, parseIntegerInput(body.sort_order) || 0)
                };
                if (existing) Object.assign(existing, faq);
                else store.supportChatFaq.push(faq);
                saveStore();
                return sendJson({ status: 'success' });
            }

            if (req.method === 'POST' && action === 'faq_delete') {
                const faqId = parseIntegerInput(body.id);
                if (!Number.isSafeInteger(faqId) || faqId < 1) return sendJson({ error: 'A valid FAQ item is required.' }, 422);
                store.supportChatFaq = store.supportChatFaq.filter(item => item.id !== faqId);
                saveStore();
                return sendJson({ status: 'success' });
            }

            return sendJson({ error: 'Support chat action not found.' }, 404);
        }

        if (apiRoute === '/api/consent') {
            if (!isAllowedDevelopmentOrigin(req.headers.origin)) {
                return sendJson({ error: 'Origin not allowed' }, 403);
            }
            if (req.method === 'GET') {
                return sendJson({ status: 'success', data: store.consentReceipts.slice(-200).reverse() });
            }
            const validBody = body !== null && typeof body === 'object' && !Array.isArray(body);
            const choices = ['accept_all', 'reject_all', 'custom'];
            const categories = validBody ? body.categories : null;
            const categoryNames = ['analytics', 'marketing', 'sessionReplay'];
            const validCategories = categories && typeof categories === 'object' && !Array.isArray(categories)
                && Object.keys(categories).length === categoryNames.length
                && categoryNames.every(name => typeof categories[name] === 'boolean');
            const validVersion = value => typeof value === 'string' && /^[A-Za-z0-9._-]{1,32}$/.test(value);
            if (!validBody || req.method !== 'POST' || !choices.includes(body.choice)
                || !validCategories
                || !validVersion(body.bannerVersion)
                || !validVersion(body.policyVersion)) {
                return sendJson({ error: 'Invalid consent preferences' }, 400);
            }

            const hasOptionalConsent = categoryNames.some(name => categories[name]);
            if ((body.choice === 'reject_all' && hasOptionalConsent)
                || (body.choice === 'accept_all' && categoryNames.some(name => !categories[name]))
                || (body.choice === 'custom' && !hasOptionalConsent)) {
                return sendJson({ error: 'Consent choice does not match its categories' }, 400);
            }

            const pagePath = typeof body.pagePath === 'string' ? body.pagePath.trim() : '';
            const locale = typeof body.locale === 'string' ? body.locale.trim() : '';
            const timezone = typeof body.timezone === 'string' ? body.timezone.trim() : '';
            if (pagePath.length > 1000 || (pagePath && (!pagePath.startsWith('/') || /[\u0000-\u0020\u007f?#]/.test(pagePath)))) {
                return sendJson({ error: 'Invalid consent page context.' }, 400);
            }
            if (locale.length > 40 || (locale && !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/.test(locale))) {
                return sendJson({ error: 'Invalid consent locale.' }, 400);
            }
            if (timezone.length > 64) return sendJson({ error: 'Invalid consent timezone.' }, 400);
            try {
                if (timezone) new Intl.DateTimeFormat('en-US', { timeZone: timezone });
            } catch {
                return sendJson({ error: 'Invalid consent timezone.' }, 400);
            }
            const userAgent = String(req.headers['user-agent'] || '').slice(0, 1000);
            const deviceType = /\b(iPad|Tablet)\b/i.test(userAgent)
                ? 'Tablet'
                : (/\b(Android|iPhone|iPod|Mobile)\b/i.test(userAgent) ? 'Mobile' : userAgent ? 'Desktop' : 'Unknown');
            const browserName = /Edg\//i.test(userAgent) ? 'Edge'
                : /Firefox\//i.test(userAgent) ? 'Firefox'
                    : /(?:Chrome|CriOS)\//i.test(userAgent) ? 'Chrome'
                        : /Safari\//i.test(userAgent) ? 'Safari' : 'Unknown';
            store.consentReceipts.push({
                id: Math.max(0, ...store.consentReceipts.map(receipt => Number(receipt.id) || 0)) + 1,
                choice: body.choice,
                categories: Object.fromEntries(categoryNames.map(name => [name, categories[name]])),
                banner_version: body.bannerVersion,
                policy_version: body.policyVersion,
                page_path: pagePath,
                locale,
                timezone,
                device_type: deviceType,
                browser_name: browserName,
                created_at: new Date().toISOString()
            });
            saveStore();
            return sendJson({ recorded: true }, 201);
        }

        if (apiRoute === '/api/receipt') {
            const orderNumber = query.order;
            const trackingCode = query.track;
            if (typeof orderNumber !== 'string' || !/^WC-(?:[A-F0-9]{10}|[A-F0-9]{32})$/.test(orderNumber)
                || typeof trackingCode !== 'string' || !/^TRK-WC-(?:[A-F0-9]{10}|[A-F0-9]{32})$/.test(trackingCode)) {
                return sendJson({ error: 'Receipt not found' }, 404);
            }

            const order = store.orders.find(item =>
                item.order_number === orderNumber && item.tracking_code === trackingCode
            );
            if (!order) return sendJson({ error: 'Receipt not found' }, 404);

            const trackingUrl = `http://127.0.0.1:${server.address().port}/track-order.html?order=${encodeURIComponent(orderNumber)}&track=${encodeURIComponent(trackingCode)}`;
            const trackingQrSvg = createQrSvg(trackingUrl);
            const itemsHtml = (Array.isArray(order.items) ? order.items : []).map(item => `
                <tr>
                    <td>${escapeHtml(item.product_name)}</td>
                    <td>${escapeHtml(item.quantity)}</td>
                    <td>BDT ${escapeHtml(Number(item.price).toFixed(2))}</td>
                    <td>BDT ${escapeHtml(Number(item.total).toFixed(2))}</td>
                </tr>`).join('');
            const receiptHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<title>Receipt ${escapeHtml(orderNumber)} | Shopademia</title>
<style>
*{box-sizing:border-box}body{font:15px/1.55 Arial,sans-serif;color:#302d28;margin:0;padding:32px;background:#f4f1eb}
main{max-width:780px;margin:auto;padding:clamp(22px,5vw,44px);background:#fff;border:1px solid #e8e2d8;border-radius:16px;box-shadow:0 12px 35px #302d2812}
.receipt-brand{margin:0 0 6px;color:#8a6a3d;font-size:.78rem;font-weight:800;letter-spacing:.14em}
h1{margin:0;font-size:clamp(1.7rem,4vw,2.2rem);line-height:1.2}
.receipt-intro{margin:8px 0 26px;color:#69645b}
.receipt-section{margin:26px 0 10px;font-size:1rem}
dl{display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;margin:0}
dt{color:#69645b}dd{margin:0;text-align:right;font-weight:700;overflow-wrap:anywhere}
dd.credential{font:600 .84rem/1.5 ui-monospace,Consolas,monospace;letter-spacing:.01em}
table{width:100%;border-collapse:collapse;margin:20px 0}
th,td{text-align:left;padding:12px 8px;border-bottom:1px solid #e8e2d8}
th{font-size:.82rem;color:#69645b;text-transform:uppercase;letter-spacing:.04em}
th:not(:first-child),td:not(:first-child){text-align:right}
.totals{margin-left:auto;max-width:360px}.totals dt,.totals dd{padding:3px 0}
.totals .grand-total{padding-top:10px;margin-top:6px;border-top:1px solid #d6cec1;font-size:1.12rem;color:#171613}
.tracking-card{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:32px;padding:20px;border:1px solid #e8e2d8;border-radius:14px;background:#faf9f6}
.tracking-copy{max-width:480px}.tracking-copy h2{margin:0 0 6px;font-size:1.05rem}.tracking-copy p{margin:0;color:#69645b}
.tracking-code{display:inline-block;margin-top:10px;padding:6px 10px;border-radius:6px;background:#eee8dd;font-weight:700;letter-spacing:.04em}
.tracking-qr{flex:0 0 132px;margin:0;padding:8px;background:#fff;border:1px solid #e8e2d8;border-radius:10px}
.tracking-qr svg{display:block;width:100%;height:auto}.print-help{margin:18px 0 0;color:#69645b;font-size:.85rem}
.receipt-socials{display:flex;justify-content:center;flex-wrap:wrap;gap:12px;margin:28px 0 0;padding:20px;border:1px solid #e8e2d8;border-radius:14px;background:#faf9f6}
.receipt-socials::before{content:"Follow Shopademia";flex:0 0 100%;color:#26231f;font-size:1.05rem;font-weight:800;text-align:center}
.receipt-socials a{display:inline-flex;min-height:44px;align-items:center;justify-content:center;padding:10px 16px;border:1px solid #e8e2d8;border-radius:8px;background:#fff;color:#302d28;font-size:.9rem;font-weight:700;text-decoration:none}
.receipt-socials a:hover,.receipt-socials a:focus-visible{border-color:#b7791f;background:#fff8ed;color:#5b3510}
.receipt-socials a:focus-visible{outline:3px solid #b7791f;outline-offset:3px}
.receipt-socials a[href*="instagram"]::before{content:"IG";margin-right:9px;color:#a83278;font-size:.72rem;font-weight:900}
.receipt-socials a[href*="x.com"]::before{content:"X";margin-right:9px;color:#111;font-weight:900}
.receipt-socials a[href*="facebook"]::before{content:"f";margin-right:9px;color:#1877f2;font-size:1.1rem;font-weight:900}
@media(max-width:520px){body{padding:12px}.tracking-card{align-items:flex-start;flex-direction:column-reverse}.tracking-qr{align-self:center;width:132px}dl{gap:8px 12px}}
@media print{body{padding:0;background:#fff}main{border:0;box-shadow:none;max-width:none;padding:0}.print-help{display:none}.tracking-card{break-inside:avoid}}
</style>
</head>
<body><main>
<p class="receipt-brand">SHOPADEMIA · ORDER RECEIPT</p>
<h1>Thank you for your order</h1>
<p class="receipt-intro">Keep this receipt for your records. Scan the code below anytime to check order progress.</p>
<h2 class="receipt-section">Order details</h2>
<dl>
<dt>Order number</dt><dd class="credential">${escapeHtml(order.order_number)}</dd>
<dt>Tracking code</dt><dd class="credential">${escapeHtml(order.tracking_code)}</dd>
<dt>Order date</dt><dd>${escapeHtml(order.created_at)}</dd>
<dt>Customer</dt><dd>${escapeHtml(order.customer_name)}</dd>
<dt>Phone</dt><dd>${escapeHtml(order.customer_phone)}</dd>
<dt>Delivery address</dt><dd>${escapeHtml(order.delivery_address)}</dd>
</dl>
<h2 class="receipt-section">Items</h2>
<table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${itemsHtml}</tbody></table>
<dl class="totals">
<dt>Subtotal</dt><dd>BDT ${escapeHtml(Number(order.subtotal).toFixed(2))}</dd>
<dt>Discount</dt><dd>BDT ${escapeHtml(Number(order.discount).toFixed(2))}</dd>
<dt>Delivery</dt><dd>BDT ${escapeHtml(Number(order.delivery_fee).toFixed(2))}</dd>
<dt class="grand-total">Total</dt><dd class="grand-total">BDT ${escapeHtml(Number(order.total).toFixed(2))}</dd>
<dt>Payment</dt><dd>${escapeHtml(order.payment_method)} · ${escapeHtml(order.payment_status)}</dd>
</dl>
<section class="tracking-card" aria-labelledby="tracking-title">
<div class="tracking-copy"><h2 id="tracking-title">Track your order</h2><p>Scan this QR code with your phone camera to view the latest order status and delivery progress.</p><span class="tracking-code">${escapeHtml(order.tracking_code)}</span></div>
<a class="tracking-qr" href="${escapeHtml(trackingUrl)}" aria-label="Open live order tracking">${trackingQrSvg}</a>
</section>
<p class="print-help">To keep a digital copy, use your browser’s Print command and select “Save as PDF”.</p>
<nav class="receipt-socials" aria-label="Shopademia social media">
<a href="https://www.instagram.com/ShopademiaBD" target="_blank" rel="noopener noreferrer">Instagram · ShopademiaBD</a>
<a href="https://x.com/SHOPADEMIA" target="_blank" rel="noopener noreferrer">X · SHOPADEMIA</a>
<a href="https://www.facebook.com/SHOPADEMIA" target="_blank" rel="noopener noreferrer">Facebook · SHOPADEMIA</a>
</nav>
</main></body></html>`;
            const download = query.download === '1';
            res.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="receipt-${orderNumber}.html"`,
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
                'X-Robots-Tag': 'noindex, nofollow',
                'Referrer-Policy': 'no-referrer'
            });
            return res.end(receiptHtml);
        }

        if (apiRoute === '/api/hero-slide-images') {
            if (req.method !== 'POST') return sendJson({ error: 'Method not allowed' }, 405);
            if (adminTokens.get(getAdminRequestToken(req))?.role !== 'Super Admin') {
                return sendJson({ error: 'Only a Super Admin can upload hero images.' }, 403);
            }
            if (typeof body.data_url !== 'string'
                || !['desktop', 'mobile'].includes(body.slot)
                || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(body.data_url)) {
                return sendJson({ error: 'Upload a processed JPEG hero image.' }, 422);
            }
            const imageBytes = Buffer.from(body.data_url.slice('data:image/jpeg;base64,'.length), 'base64');
            const expectedSize = body.slot === 'mobile' ? { width: 900, height: 600 } : { width: 1920, height: 680 };
            const dimensions = jpegDimensions(imageBytes);
            if (imageBytes.length < 1 || imageBytes.length > 3_000_000
                || !dimensions || dimensions.width !== expectedSize.width || dimensions.height !== expectedSize.height) {
                return sendJson({ error: 'The processed hero image has invalid dimensions or exceeds 3 MB.' }, 422);
            }
            const directory = path.join(WEB_DIR, 'assets', 'hero');
            fs.mkdirSync(directory, { recursive: true });
            const fileName = `${require('crypto').randomBytes(16).toString('hex')}.jpg`;
            fs.writeFileSync(path.join(directory, fileName), imageBytes, { flag: 'wx', mode: 0o644 });
            return sendJson({ status: 'success', data: { path: `assets/hero/${fileName}` } }, 201);
        }

        if (apiRoute === '/api/category-images') {
            if (req.method !== 'POST') return sendJson({ error: 'Method not allowed' }, 405);
            const session = adminTokens.get(getAdminRequestToken(req));
            if (!session || !hasDevAdminPermission(session.role, 'categories.create')) {
                return sendJson({ error: 'Category creation permission is required to upload a category image.' }, 403);
            }
            if (typeof body.data_url !== 'string'
                || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(body.data_url)) {
                return sendJson({ error: 'Upload a processed JPEG category image.' }, 422);
            }
            const imageBytes = Buffer.from(body.data_url.slice('data:image/jpeg;base64,'.length), 'base64');
            const dimensions = jpegDimensions(imageBytes);
            if (imageBytes.length < 1 || imageBytes.length > 2_000_000
                || !dimensions || dimensions.width > 1200 || dimensions.height > 900) {
                return sendJson({ error: 'The processed category image is invalid or exceeds 1,200 x 900 pixels and 2 MB.' }, 422);
            }
            const directory = path.join(WEB_DIR, 'assets', 'categories');
            fs.mkdirSync(directory, { recursive: true });
            const fileName = `${require('crypto').randomBytes(16).toString('hex')}.jpg`;
            fs.writeFileSync(path.join(directory, fileName), imageBytes, { flag: 'wx', mode: 0o644 });
            return sendJson({ status: 'success', data: { path: `assets/categories/${fileName}` } }, 201);
        }

        if (apiRoute === '/api/hero-slides') {
            if (req.method === 'GET') {
                const now = Date.now();
                const slides = store.heroSlides
                    .filter(slide => query.public !== '1' || (slide.is_enabled
                        && (!slide.starts_at || Date.parse(`${slide.starts_at.slice(0, 16).replace(' ', 'T')}:00Z`) <= now)
                        && (!slide.ends_at || Date.parse(`${slide.ends_at.slice(0, 16).replace(' ', 'T')}:00Z`) > now)))
                    .map(slide => ({ ...slide, href: resolveHeroSlideHref(slide) }))
                    .filter(slide => slide.href
                        && /^assets\/hero\/[a-f0-9]{32}\.jpg$/.test(slide.image_desktop)
                        && fs.existsSync(path.join(WEB_DIR, slide.image_desktop))
                        && (!slide.image_mobile || (/^assets\/hero\/[a-f0-9]{32}\.jpg$/.test(slide.image_mobile)
                            && fs.existsSync(path.join(WEB_DIR, slide.image_mobile)))));
                return sendJson({ status: 'success', data: slides });
            }
            if (!['POST', 'PUT'].includes(req.method)) return sendJson({ error: 'Method not allowed' }, 405);
            if (adminTokens.get(getAdminRequestToken(req))?.role !== 'Super Admin') {
                return sendJson({ error: 'Only a Super Admin can manage hero slides.' }, 403);
            }
            const slides = body.slides;
            if (!Array.isArray(slides) || slides.length < 1 || slides.length > 100) {
                return sendJson({ error: 'Keep between 1 and 100 hero slides.' }, 422);
            }
            const seenIds = new Set();
            const validated = [];
            for (const [index, slide] of slides.entries()) {
                if (!slide || typeof slide !== 'object' || Array.isArray(slide)
                    || typeof slide.is_enabled !== 'boolean'
                    || typeof slide.image_desktop !== 'string'
                    || !/^assets\/hero\/[a-f0-9]{32}\.jpg$/.test(slide.image_desktop)
                    || (slide.image_mobile !== null && slide.image_mobile !== undefined
                        && (typeof slide.image_mobile !== 'string'
                            || !/^assets\/hero\/[a-f0-9]{32}\.jpg$/.test(slide.image_mobile)
                            || !fs.existsSync(path.join(WEB_DIR, slide.image_mobile))))
                    || !fs.existsSync(path.join(WEB_DIR, slide.image_desktop))
                    || !['product', 'category', 'page', 'url'].includes(slide.link_type)
                    || typeof slide.link_value !== 'string' || slide.link_value.length > 1000
                    || typeof slide.alt_text !== 'string' || slide.alt_text.length > 200
                    || !isValidHeroDate(slide.starts_at ?? null) || !isValidHeroDate(slide.ends_at ?? null)
                    || (slide.id !== undefined && (!Number.isSafeInteger(slide.id) || slide.id < 1))) {
                    return sendJson({ error: `Hero slide ${index + 1} has invalid fields.` }, 422);
                }
                if (slide.id !== undefined) {
                    if (seenIds.has(slide.id) || !store.heroSlides.some(item => item.id === slide.id)) {
                        return sendJson({ error: 'A hero slide no longer exists. Reload the editor and try again.' }, 409);
                    }
                    seenIds.add(slide.id);
                }
                if (!resolveHeroSlideHref(slide)) {
                    return sendJson({ error: `Hero slide ${index + 1} has an invalid or unavailable destination.` }, 422);
                }
                const startsAt = slide.starts_at ? `${slide.starts_at.replace('T', ' ')}:00` : null;
                const endsAt = slide.ends_at ? `${slide.ends_at.replace('T', ' ')}:00` : null;
                if (startsAt && endsAt && startsAt >= endsAt) {
                    return sendJson({ error: `Hero slide ${index + 1} must end after it starts.` }, 422);
                }
                validated.push({
                    ...(slide.id === undefined ? {} : { id: slide.id }),
                    image_desktop: slide.image_desktop,
                    image_mobile: slide.image_mobile || null,
                    link_type: slide.link_type,
                    link_value: slide.link_value.trim(),
                    alt_text: slide.alt_text.trim(),
                    starts_at: startsAt,
                    ends_at: endsAt,
                    is_enabled: slide.is_enabled,
                    sort_order: index
                });
            }
            let nextId = Math.max(0, ...store.heroSlides.map(slide => Number(slide.id) || 0)) + 1;
            validated.forEach(slide => {
                if (slide.id === undefined) slide.id = nextId++;
            });
            store.heroSlides = validated;
            saveStore();
            return sendJson({ status: 'success', message: 'Hero slides saved.' });
        }

        if (apiRoute === '/api/product-images') {
            if (req.method !== 'POST') return sendJson({ error: 'Method not allowed' }, 405);
            if (!Buffer.isBuffer(body.multipartImages) || !body.multipartBoundary) {
                return sendJson({ error: 'Select at least one product image.' }, 422);
            }
            let images;
            try {
                images = parseMultipartProductImages(body.multipartImages, body.multipartBoundary);
            } catch (error) {
                return sendJson({ error: error.message || 'The product images could not be validated.' }, error.statusCode || 422);
            }
            const directory = path.join(WEB_DIR, 'assets', 'products');
            const storedPaths = [];
            try {
                fs.mkdirSync(directory, { recursive: true });
                for (const image of images) {
                    const fileName = `${require('crypto').randomBytes(16).toString('hex')}.${image.extension}`;
                    fs.writeFileSync(path.join(directory, fileName), image.bytes, { flag: 'wx', mode: 0o644 });
                    storedPaths.push(`assets/products/${fileName}`);
                }
            } catch (error) {
                for (const storedPath of storedPaths) {
                    try {
                        fs.unlinkSync(path.join(WEB_DIR, storedPath));
                    } catch (cleanupError) {
                        console.error('Could not remove a partial local product image upload.', cleanupError);
                    }
                }
                console.error('Local product image upload failed.', error);
                return sendJson({ error: 'Could not store the uploaded product images.' }, 500);
            }
            return sendJson({ status: 'success', data: { images: storedPaths } }, 201);
        }

        // 1. PRODUCTS
        if (apiRoute === '/api/products') {
            if (req.method === 'GET') {
                if (query.id) {
                    const product = store.products.find(p => p.id == query.id);
                    if (!product) return sendJson({ error: 'Product not found' }, 404);
                    return sendJson({
                        status: 'success',
                        data: { ...product, is_sellable: product.is_sellable === undefined ? 1 : Number(product.is_sellable) }
                    });
                }
                let list = store.products.map(product => ({
                    ...product,
                    is_sellable: product.is_sellable === undefined ? 1 : Number(product.is_sellable)
                }));
                if (query.category) {
                    list = list.filter(p => p.category_slug === query.category || p.category_id == query.category);
                }
                if (query.featured) list = list.filter(p => p.is_featured);
                if (query.trending) list = list.filter(p => p.is_trending);
                if (query.sort === 'sale') {
                    list = list.filter(p => Number(p.sale_price) > 0
                        && Number(p.sale_price) < Number(p.regular_price))
                        .sort((a, b) => (Number(b.regular_price) - Number(b.sale_price))
                            - (Number(a.regular_price) - Number(a.sale_price)));
                }
                if (query.q) {
                    const q = query.q.toLowerCase();
                    list = list.filter(p => p.name.toLowerCase().includes(q) || p.short_desc.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
                }
                if (query.sort === 'price_asc') {
                    list.sort((a, b) => (a.sale_price || a.regular_price) - (b.sale_price || b.regular_price));
                } else if (query.sort === 'price_desc') {
                    list.sort((a, b) => (b.sale_price || b.regular_price) - (a.sale_price || a.regular_price));
                }
                return sendJson({ status: 'success', count: list.length, data: list });
            }

            if (req.method === 'POST') {
                const validationError = validateProductPayload(body);
                if (validationError) return sendJson({ error: validationError }, 422);
                if (!body.name || body.category_id === undefined || body.regular_price === undefined) {
                    return sendJson({ error: 'Product name, category, and regular price are required.' }, 422);
                }
                const cat = store.categories.find(c => c.id == body.category_id);
                if (!cat) return sendJson({ error: 'Category not found.' }, 404);
                if (body.sale_price !== null && body.sale_price !== undefined && body.sale_price !== ''
                    && Number(body.sale_price) >= Number(body.regular_price)) {
                    return sendJson({ error: 'Sale price must be lower than the regular price.' }, 422);
                }
                const newProduct = {
                    id: Date.now(),
                    name: body.name,
                    slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.floor(Math.random() * 900 + 100),
                    category_id: cat.id,
                    category_name: cat.name,
                    category_slug: cat.slug,
                    regular_price: parseFloat(body.regular_price),
                    sale_price: body.sale_price ? parseFloat(body.sale_price) : null,
                    stock_quantity: parseInt(body.stock_quantity || 10),
                    sku: body.sku || 'WC-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
                    short_desc: body.short_desc || '',
                    description: body.description || '',
                    seo_title: body.seo_title || null,
                    meta_description: body.meta_description || null,
                    focus_keyword: body.focus_keyword || null,
                    h1: body.h1 || null,
                    alt_text: body.alt_text || null,
                    canonical_url: body.canonical_url || null,
                    images: Array.isArray(body.images) ? body.images : [body.images || "assets/product-placeholder.svg"],
                    is_featured: body.is_featured ? 1 : 0,
                    is_trending: body.is_trending ? 1 : 0,
                    is_sellable: [false, 0, '0'].includes(body.is_sellable) ? 0 : 1,
                    reviews: []
                };
                store.products.unshift(newProduct);
                saveStore();
                return sendJson({ status: 'success', message: 'Product created', id: newProduct.id }, 201);
            }

            if (req.method === 'PUT') {
                const validationError = validateProductPayload(body);
                if (validationError) return sendJson({ error: validationError }, 422);
                const idx = store.products.findIndex(p => p.id == body.id);
                if (idx === -1) return sendJson({ error: 'Product not found' }, 404);
                const current = store.products[idx];
                const categoryId = body.category_id === undefined ? current.category_id : body.category_id;
                const category = store.categories.find(c => c.id == categoryId);
                if (body.category_id !== undefined && !category) {
                    return sendJson({ error: 'Category not found.' }, 404);
                }
                const regularPrice = body.regular_price === undefined ? Number(current.regular_price) : Number(body.regular_price);
                if (body.sale_price !== undefined && body.sale_price !== null && body.sale_price !== ''
                    && Number(body.sale_price) >= regularPrice) {
                    return sendJson({ error: 'Sale price must be lower than the regular price.' }, 422);
                }
                store.products[idx] = {
                    ...current,
                    ...body,
                    ...(category ? {
                        category_id: category.id,
                        category_name: category.name,
                        category_slug: category.slug
                    } : {})
                };
                saveStore();
                return sendJson({ status: 'success', message: 'Product updated' });
            }

            if (req.method === 'DELETE') {
                const id = query.id || body.id;
                store.products = store.products.filter(p => p.id != id);
                saveStore();
                return sendJson({ status: 'success', message: 'Product deleted' });
            }
        }

        // 2. CATEGORIES
        if (apiRoute === '/api/categories') {
            if (req.method === 'GET') {
                const counts = store.products.reduce((result, product) => {
                    result.set(product.category_id, (result.get(product.category_id) || 0) + 1);
                    return result;
                }, new Map());
                const categories = store.categories.map(category => ({
                    ...category,
                    product_count: counts.get(category.id) || 0
                }));
                return sendJson({ status: 'success', data: categories });
            }
            if (req.method === 'POST') {
                const session = adminTokens.get(getAdminRequestToken(req));
                if (!session || !hasDevAdminPermission(session.role, 'categories.create')) {
                    return sendJson({ error: 'Category creation permission is required.' }, 403);
                }
                const image = body.image || 'assets/category-placeholder.svg';
                if (typeof image !== 'string'
                    || (image !== 'assets/category-placeholder.svg'
                        && (!/^assets\/categories\/[a-f0-9]{32}\.jpg$/i.test(image)
                            || !fs.existsSync(path.join(WEB_DIR, image))))) {
                    return sendJson({ error: 'Upload the category image through the image processor.' }, 422);
                }
                const newCat = {
                    id: Date.now(),
                    name: body.name,
                    slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    description: body.description || '',
                    image,
                    product_count: 0
                };
                store.categories.push(newCat);
                saveStore();
                return sendJson({ status: 'success', message: 'Category added', id: newCat.id }, 201);
            }
        }

        // 3. ORDERS
        if (apiRoute === '/api/orders') {
            if (req.method === 'GET') {
                if (query.id) {
                    const order = store.orders.find(o => o.id == query.id);
                    if (!order) return sendJson({ error: 'Order not found' }, 404);
                    return sendJson({ status: 'success', data: order });
                }
                if (query.customer_id) {
                    const session = getDevCustomerSession(req);
                    if (!session) return sendJson({ error: 'Customer authorization required.' }, 401);
                    if (Number(query.customer_id) !== Number(session.customer.id)) {
                        return sendJson({ error: 'You may only view your own orders.' }, 403);
                    }
                    const userOrders = store.orders.filter(o => Number(o.customer_id) === Number(session.customer.id));
                    return sendJson({ status: 'success', data: userOrders });
                }
                let orders = [...store.orders];
                if (query.status) orders = orders.filter(o => o.order_status === query.status);
                if (query.q) {
                    const q = query.q.toLowerCase();
                    orders = orders.filter(o => o.order_number.toLowerCase().includes(q) || o.customer_name.toLowerCase().includes(q) || o.customer_phone.includes(q));
                }
                return sendJson({ status: 'success', count: orders.length, data: orders });
            }

            if (req.method === 'POST') {
                if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
                    return sendJson({ error: 'Please provide at least one valid order item.' }, 400);
                }

                const idempotencyKey = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
                if (!/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey)) {
                    return sendJson({ error: 'A valid checkout request key is required. Please reload checkout and try again.' }, 422);
                }
                const requestFingerprint = getOrderRequestFingerprint(body);
                if (!store.order_idempotency || typeof store.order_idempotency !== 'object') {
                    store.order_idempotency = Object.create(null);
                } else if (Object.getPrototypeOf(store.order_idempotency) !== null) {
                    const records = Object.create(null);
                    for (const [key, record] of Object.entries(store.order_idempotency)) records[key] = record;
                    store.order_idempotency = records;
                }
                const hasPreviousRequest = Object.prototype.hasOwnProperty.call(store.order_idempotency, idempotencyKey);
                const previousRequest = hasPreviousRequest ? store.order_idempotency[idempotencyKey] : null;
                if (hasPreviousRequest) {
                    if (previousRequest.fingerprint !== requestFingerprint) {
                        return sendJson({ error: 'This checkout request key was already used for a different order.' }, 409);
                    }
                    const existingOrder = store.orders.find(order => order.id == previousRequest.order_id);
                    if (existingOrder) {
                        return sendJson({
                            status: 'success',
                            message: 'This order request was already submitted.',
                            data: {
                                order_id: existingOrder.id,
                                order_number: existingOrder.order_number,
                                tracking_code: existingOrder.tracking_code,
                                total: existingOrder.total
                            }
                        });
                    }
                }

                const hasPreviewTotal = body.preview_total !== null && body.preview_total !== undefined;
                const hasConfirmedTotal = body.confirmed_server_total !== null && body.confirmed_server_total !== undefined;
                const previewTotal = hasPreviewTotal
                    ? Number(body.preview_total)
                    : null;
                const confirmedServerTotal = hasConfirmedTotal
                    ? Number(body.confirmed_server_total)
                    : null;
                const isValidOptionalMoney = value => typeof value === 'number'
                    ? Number.isFinite(value)
                    : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
                if ((hasPreviewTotal && !isValidOptionalMoney(body.preview_total))
                    || (hasConfirmedTotal && !isValidOptionalMoney(body.confirmed_server_total))) {
                    return sendJson({ error: 'Invalid checkout total confirmation.' }, 400);
                }

                const requestedQuantities = new Map();
                const validatedItems = [];
                for (const item of body.items) {
                    if (!item || typeof item !== 'object' || item.product_id === undefined
                        || item.quantity === undefined) {
                        return sendJson({ error: 'Each order item must include a product ID and quantity.' }, 400);
                    }
                    const quantity = parseIntegerInput(item.quantity);
                    const productId = parseIntegerInput(item.product_id);
                    if (!Number.isSafeInteger(productId) || productId <= 0
                        || !Number.isSafeInteger(quantity) || quantity <= 0) {
                        return sendJson({ error: 'Item product IDs and quantities must be positive integers.' }, 400);
                    }
                    const product = store.products.find(p => p.id == productId);
                    if (!product) return sendJson({ error: 'Product not found.' }, 404);

                    const requested = (requestedQuantities.get(product) || 0) + quantity;
                    if (!Number.isSafeInteger(requested) || requested > 100) {
                        return sendJson({ error: 'A product quantity cannot exceed 100.' }, 400);
                    }
                    requestedQuantities.set(product, requested);
                }

                for (const [product, quantity] of requestedQuantities) {
                    const stock = Number(product.stock_quantity);
                    if (!Number.isSafeInteger(stock) || stock < 0) {
                        return sendJson({ error: `Stock is invalid for ${product.name}.` }, 400);
                    }
                    if (quantity > stock) {
                        return sendJson({ error: `Insufficient stock for ${product.name}.` }, 400);
                    }
                }

                let subtotal = 0;
                for (const [product, quantity] of requestedQuantities) {
                    const salePrice = Number(product.sale_price);
                    const regularPrice = Number(product.regular_price);
                    const price = product.sale_price !== null && product.sale_price !== undefined
                        && Number.isFinite(salePrice) && salePrice > 0
                        ? salePrice
                        : regularPrice;
                    if (!Number.isFinite(price) || price < 0) {
                        return sendJson({ error: `Price is invalid for ${product.name}.` }, 400);
                    }
                    const lineTotal = roundMoney(price * quantity);
                    subtotal += lineTotal;
                    validatedItems.push({
                        product,
                        quantity,
                        price,
                        total: lineTotal
                    });
                }
                subtotal = roundMoney(subtotal);

                const deliveryZone = inferCheckoutDeliveryZone(
                    typeof body.delivery_address === 'string' ? body.delivery_address : ''
                );
                const deliveryArea = {
                    dhaka: 'Inside Dhaka',
                    outside_dhaka: 'Outside Dhaka'
                }[deliveryZone];
                const deliverySettingKey = {
                    dhaka: 'delivery_fee_dhaka',
                    outside_dhaka: 'delivery_fee_outside_dhaka'
                }[deliveryZone];
                const defaultDeliveryFee = {
                    dhaka: 80,
                    outside_dhaka: 130
                }[deliveryZone];
                const configuredFee = Object.prototype.hasOwnProperty.call(store.settings, deliverySettingKey)
                    ? Number(store.settings[deliverySettingKey])
                    : defaultDeliveryFee;
                let deliveryFee = Number.isFinite(configuredFee) ? Math.max(0, configuredFee) : 0;
                const freeDeliveryThreshold = Number(store.settings.free_delivery_min_amount);
                if (deliveryZone !== 'outside_dhaka' && Number.isFinite(freeDeliveryThreshold)
                    && freeDeliveryThreshold > 0 && subtotal >= freeDeliveryThreshold) {
                    deliveryFee = 0;
                }

                let appliedCoupon = null;
                let discount = 0;
                const couponCode = typeof body.coupon_code === 'string' ? body.coupon_code.trim().toUpperCase() : '';
                if (couponCode) {
                    appliedCoupon = store.coupons.find(coupon =>
                        String(coupon.code || '').toUpperCase() === couponCode
                    );
                    if (!isCouponAvailable(appliedCoupon)) {
                        return sendJson({ error: 'Invalid or expired coupon code.' }, 404);
                    }
                    const minimumOrder = Number(appliedCoupon.min_order || 0);
                    const couponValue = Number(appliedCoupon.value);
                    if (!Number.isFinite(minimumOrder) || !Number.isFinite(couponValue)) {
                        return sendJson({ error: 'Coupon configuration is invalid.' }, 400);
                    }
                    if (subtotal < minimumOrder) {
                        return sendJson({ error: `Minimum order for this coupon is ৳${appliedCoupon.min_order}` }, 400);
                    }
                    const maxDiscount = Number(appliedCoupon.max_discount);
                    if (appliedCoupon.type === 'percentage') {
                        discount = subtotal * couponValue / 100;
                        if (appliedCoupon.max_discount && Number.isFinite(maxDiscount) && maxDiscount > 0) {
                            discount = Math.min(discount, maxDiscount);
                        }
                    } else {
                        discount = couponValue;
                    }
                    discount = roundMoney(Math.min(discount, subtotal));
                }
                const total = roundMoney(Math.max(0, subtotal - discount + deliveryFee));
                if (confirmedServerTotal !== null && Math.abs(confirmedServerTotal - total) > 0.01) {
                    return sendJson({
                        error: 'The order total changed again. Please review and confirm the updated total.',
                        requires_confirmation: true,
                        server_subtotal: subtotal,
                        server_discount: discount,
                        server_delivery_fee: deliveryFee,
                        server_total: total
                    }, 409);
                }
                if (previewTotal !== null && Math.abs(previewTotal - total) > 0.01
                    && (confirmedServerTotal === null || Math.abs(confirmedServerTotal - total) > 0.01)) {
                    return sendJson({
                        error: 'Prices, discount, or delivery fees changed. Please confirm the updated total.',
                        requires_confirmation: true,
                        preview_total: previewTotal,
                        server_subtotal: subtotal,
                        server_discount: discount,
                        server_delivery_fee: deliveryFee,
                        server_total: total
                    }, 409);
                }

                const { orderNumber: orderNum, trackingCode: trkCode } = createOrderIdentifiers(store.orders);

                const newOrder = {
                    id: Date.now(),
                    order_number: orderNum,
                    customer_id: body.customer_id || null,
                    customer_name: body.customer_name,
                    customer_phone: body.customer_phone,
                    customer_email: body.customer_email || '',
                    delivery_address: body.delivery_address,
                    delivery_area: deliveryArea,
                    delivery_zone: deliveryZone,
                    delivery_fee: deliveryFee,
                    subtotal: subtotal,
                    discount: discount,
                    coupon_id: appliedCoupon ? appliedCoupon.id : null,
                    coupon_code: appliedCoupon ? appliedCoupon.code : null,
                    total: total,
                    payment_method: body.payment_method || 'Cash on Delivery',
                    payment_status: (body.trx_id || ['bKash', 'Nagad', 'Rocket'].includes(body.payment_method)) ? 'Pending Verification' : 'Pending',
                    trx_id: body.trx_id || null,
                    order_status: 'Pending',
                    tracking_code: trkCode,
                    notes: body.notes || '',
                    created_at: new Date().toISOString(),
                    items: validatedItems.map(({ product, quantity, price, total: lineTotal }) => ({
                        product_id: product.id,
                        product_name: product.name,
                        price,
                        quantity,
                        total: lineTotal
                    }))
                };

                for (const [product, quantity] of requestedQuantities) {
                    product.stock_quantity = Number(product.stock_quantity) - quantity;
                }
                store.orders.unshift(newOrder);
                if (appliedCoupon) appliedCoupon.times_used = Number(appliedCoupon.times_used || 0) + 1;
                store.order_idempotency[idempotencyKey] = {
                    fingerprint: requestFingerprint,
                    order_id: newOrder.id
                };
                saveStore();
                return sendJson({
                    status: 'success',
                    message: 'Order placed successfully',
                    data: { order_id: newOrder.id, order_number: orderNum, tracking_code: trkCode, total: total }
                }, 201);
            }

            if (req.method === 'PUT') {
                const ord = store.orders.find(o => o.id == body.id);
                if (!ord) return sendJson({ error: 'Order not found' }, 404);
                const validOrderStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
                const validPaymentStatuses = ['Pending', 'Pending Verification', 'Paid', 'Failed', 'Refunded'];
                if (body.order_status !== undefined && !validOrderStatuses.includes(body.order_status)) {
                    return sendJson({ error: 'Invalid order status value.' }, 400);
                }
                if (body.payment_status !== undefined && !validPaymentStatuses.includes(body.payment_status)) {
                    return sendJson({ error: 'Invalid payment status value.' }, 400);
                }
                if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 2000)) {
                    return sendJson({ error: 'Order notes must be 2,000 characters or fewer.' }, 422);
                }
                if (body.order_status === 'Shipped'
                    && (ord.payment_status === 'Pending Verification'
                        || (['bKash', 'Nagad', 'Rocket'].includes(ord.payment_method)
                            && ord.payment_status !== 'Paid'))) {
                    return sendJson({
                        error: 'Verify the mobile wallet payment before shipping this order.'
                    }, 409);
                }
                if (body.order_status) ord.order_status = body.order_status;
                if (body.payment_status) ord.payment_status = body.payment_status;
                if (body.notes) ord.notes = body.notes;
                saveStore();
                return sendJson({ status: 'success', message: 'Order updated' });
            }
        }

        // 4. CUSTOMERS
        if (apiRoute === '/api/customers') {
            if (req.method === 'GET') {
                return sendJson({
                    status: 'success',
                    count: store.customers.length,
                    data: store.customers.map(customer => ({ ...customer, is_vip: Number(customer.is_vip) === 1 ? 1 : 0 }))
                });
            }
            if (req.method === 'PUT') {
                const customerId = parseIntegerInput(body.id);
                if (!Number.isSafeInteger(customerId) || customerId < 1 || typeof body.is_vip !== 'boolean') {
                    return sendJson({ error: 'A valid customer ID and VIP value are required.' }, 422);
                }
                const customer = store.customers.find(item => Number(item.id) === customerId);
                if (!customer) return sendJson({ error: 'Customer not found.' }, 404);
                const previousValue = Number(customer.is_vip) === 1 ? 1 : 0;
                customer.is_vip = body.is_vip ? 1 : 0;
                store.adminAuditLog.push({
                    id: Math.max(0, ...store.adminAuditLog.map(item => Number(item.id) || 0)) + 1,
                    admin_id: requestSession.adminId,
                    action: 'update_customer_vip',
                    details: {
                        customer_id: customerId,
                        previous_is_vip: previousValue,
                        is_vip: customer.is_vip
                    },
                    created_at: new Date().toISOString()
                });
                saveStore();
                return sendJson({ status: 'success', data: { id: customerId, is_vip: customer.is_vip } });
            }
        }

        // 5. COUPONS
        if (apiRoute === '/api/coupons') {
            if (req.method === 'GET') {
                const paidOrders = store.orders.filter(order =>
                    String(order.payment_status || '').toLowerCase() === 'paid'
                    && String(order.order_status || '').toLowerCase() !== 'cancelled'
                    && Number.isFinite(Number(order.total))
                );
                const totalPaidSales = paidOrders.reduce((sum, order) => sum + Number(order.total), 0);
                const data = store.coupons.map(coupon => {
                    const couponOrders = paidOrders.filter(order => Number(order.coupon_id) === Number(coupon.id));
                    const paidSalesAmount = roundMoney(couponOrders.reduce((sum, order) => sum + Number(order.total), 0));
                    return {
                        ...coupon,
                        tag: coupon.tag || null,
                        paid_sales_amount: paidSalesAmount,
                        paid_order_count: couponOrders.length,
                        paid_sales_share_percent: totalPaidSales > 0
                            ? roundMoney(paidSalesAmount * 100 / totalPaidSales)
                            : 0
                    };
                });
                return sendJson({ status: 'success', data });
            }
            if (req.method === 'POST') {
                if (body.action === 'validate') {
                    const code = typeof body.code === 'string' ? body.code.toUpperCase().trim() : '';
                    const subtotal = parseFloat(body.subtotal || 0);
                    const c = store.coupons.find(cp => String(cp.code || '').toUpperCase() === code);
                    if (!isCouponAvailable(c)) return sendJson({ error: 'Invalid or expired coupon code' }, 404);
                    if (!Number.isFinite(subtotal) || subtotal < 0) {
                        return sendJson({ error: 'A valid order subtotal is required.' }, 400);
                    }
                    if (subtotal < c.min_order) {
                        return sendJson({ error: `Minimum order for this coupon is ৳${c.min_order}` }, 400);
                    }
                    let disc = c.type === 'percentage' ? (subtotal * c.value) / 100 : c.value;
                    if (c.max_discount && disc > c.max_discount) disc = c.max_discount;
                    disc = Math.min(disc, subtotal);
                    return sendJson({ status: 'success', message: 'Coupon applied', data: { code: c.code, discount: disc, type: c.type, value: c.value } });
                }
            }
            if (req.method === 'POST' || req.method === 'PUT') {
                const id = req.method === 'PUT' ? parseIntegerInput(body.id) : null;
                if (req.method === 'PUT' && (!Number.isSafeInteger(id) || id < 1)) {
                    return sendJson({ error: 'A valid coupon ID is required.' }, 422);
                }
                const existing = id === null ? null : store.coupons.find(coupon => Number(coupon.id) === id);
                if (id !== null && !existing) return sendJson({ error: 'Coupon not found.' }, 404);
                const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
                const type = body.type || 'percentage';
                const value = Number(body.value);
                const minOrder = Number(body.min_order ?? 0);
                const maxDiscount = body.max_discount === undefined || body.max_discount === null || body.max_discount === ''
                    ? null : Number(body.max_discount);
                const expiryDate = body.expiry_date || null;
                const usageLimit = parseIntegerInput(body.usage_limit ?? 0);
                const isActive = body.is_active ?? 1;
                if (body.tag !== undefined && typeof body.tag !== 'string') {
                    return sendJson({ error: 'Coupon tag must be text.' }, 422);
                }
                const tag = typeof body.tag === 'string' ? body.tag.trim() : '';
                const parsedExpiryDate = expiryDate === null ? null : new Date(`${expiryDate}T00:00:00Z`);
                if (!/^[A-Z0-9_-]{2,50}$/.test(code)) {
                    return sendJson({ error: 'Coupon code must be 2-50 letters, numbers, hyphens, or underscores.' }, 422);
                }
                if (store.coupons.some(coupon => String(coupon.code).toUpperCase() === code && Number(coupon.id) !== id)) {
                    return sendJson({ error: 'A coupon with this code already exists.' }, 409);
                }
                if (!['percentage', 'fixed'].includes(type) || !Number.isFinite(value) || value <= 0
                    || (type === 'percentage' && value > 100)
                    || !Number.isFinite(minOrder) || minOrder < 0
                    || (maxDiscount !== null && (!Number.isFinite(maxDiscount) || maxDiscount <= 0))
                    || !Number.isSafeInteger(usageLimit) || usageLimit < 0
                    || ![0, 1, false, true].includes(isActive)) {
                    return sendJson({ error: 'Enter valid coupon settings.' }, 422);
                }
                if (expiryDate !== null
                    && (typeof expiryDate !== 'string'
                        || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)
                        || Number.isNaN(parsedExpiryDate.getTime())
                        || parsedExpiryDate.toISOString().slice(0, 10) !== expiryDate)) {
                    return sendJson({ error: 'Enter a valid coupon expiry date.' }, 422);
                }
                if (tag.length > 40 || (tag && !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/.test(tag))) {
                    return sendJson({ error: 'Coupon tag must be 1-40 letters, numbers, spaces, dots, hyphens, or underscores.' }, 422);
                }
                const newCoupon = {
                    ...(existing || {}),
                    id: existing ? id : Math.max(0, ...store.coupons.map(coupon => Number(coupon.id) || 0)) + 1,
                    code,
                    tag: tag || null,
                    type,
                    value,
                    min_order: minOrder,
                    max_discount: maxDiscount,
                    expiry_date: expiryDate,
                    usage_limit: usageLimit,
                    times_used: existing ? Number(existing.times_used) || 0 : 0,
                    is_active: Number(Boolean(isActive))
                };
                if (existing) {
                    Object.assign(existing, newCoupon);
                } else {
                    store.coupons.unshift(newCoupon);
                }
                saveStore();
                return sendJson({
                    status: 'success',
                    message: existing ? 'Coupon updated' : 'Coupon created',
                    id: newCoupon.id
                }, existing ? 200 : 201);
            }
            if (req.method === 'DELETE') {
                const id = parseIntegerInput(query.id);
                if (!Number.isSafeInteger(id) || id < 1) return sendJson({ error: 'A valid coupon ID is required.' }, 422);
                const index = store.coupons.findIndex(coupon => Number(coupon.id) === id);
                if (index < 0) return sendJson({ error: 'Coupon not found.' }, 404);
                store.coupons.splice(index, 1);
                saveStore();
                return sendJson({ status: 'success', message: 'Coupon removed' });
            }
        }

        // 6. INVENTORY
        if (apiRoute === '/api/inventory') {
            if (req.method === 'GET') {
                const inv = store.products.map(p => ({
                    id: p.id,
                    name: p.name,
                    sku: p.sku,
                    stock_quantity: p.stock_quantity,
                    regular_price: p.regular_price,
                    sale_price: p.sale_price,
                    category_name: p.category_name,
                    stock_status: p.stock_quantity === 0 ? 'Out of Stock' : (p.stock_quantity <= 5 ? 'Low Stock' : 'In Stock')
                }));
                const summary = {
                    total_products: inv.length,
                    low_stock_count: inv.filter(i => i.stock_quantity <= 5 && i.stock_quantity > 0).length,
                    out_of_stock_count: inv.filter(i => i.stock_quantity === 0).length
                };
                return sendJson({ status: 'success', summary, data: inv });
            }

            if (req.method === 'POST' || req.method === 'PUT') {
                const prod = store.products.find(p => p.id == body.product_id);
                if (!prod) return sendJson({ error: 'Product not found' }, 404);
                const currentStock = Number(prod.stock_quantity);
                if (!Number.isSafeInteger(currentStock) || currentStock < 0) {
                    return sendJson({ error: 'Current stock is invalid.' }, 400);
                }
                let nextStock;
                if (body.action === 'adjust') {
                    const delta = parseIntegerInput(body.delta);
                    if (!Number.isSafeInteger(delta)) {
                        return sendJson({ error: 'Stock adjustment must be an integer.' }, 400);
                    }
                    nextStock = currentStock + delta;
                } else if (body.stock_quantity !== undefined) {
                    nextStock = parseIntegerInput(body.stock_quantity);
                } else {
                    return sendJson({ error: 'Provide a stock quantity or integer adjustment.' }, 400);
                }
                if (!Number.isSafeInteger(nextStock) || nextStock < 0) {
                    return sendJson({ error: 'Resulting stock must be a nonnegative integer.' }, 400);
                }
                prod.stock_quantity = nextStock;
                saveStore();
                return sendJson({ status: 'success', message: 'Stock updated', data: { id: prod.id, name: prod.name, stock_quantity: prod.stock_quantity } });
            }
        }

        // 7. REPORTS
        if (apiRoute === '/api/reports') {
            const from = query.from;
            const to = query.to;
            let rangeStart = null;
            let rangeEnd = null;
            if (from !== undefined || to !== undefined) {
                const validDate = value => typeof value === 'string'
                    && /^\d{4}-\d{2}-\d{2}$/.test(value)
                    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
                    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
                if (!validDate(from) || !validDate(to) || from > to
                    || (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 > 3660) {
                    return sendJson({ error: 'Enter a valid date range no longer than ten years.' }, 422);
                }
                rangeStart = Date.parse(`${from}T00:00:00+06:00`);
                rangeEnd = Date.parse(`${to}T00:00:00+06:00`) + 86400000;
            }
            const reportOrders = store.orders.filter(order => {
                if (rangeStart === null) return true;
                const createdAt = Date.parse(order.created_at);
                return Number.isFinite(createdAt) && createdAt >= rangeStart && createdAt < rangeEnd;
            });
            const paidOrders = reportOrders.filter(order =>
                order.payment_status === 'Paid' && order.order_status !== 'Cancelled');
            const paidRevenue = paidOrders.reduce((total, order) => total + (Number(order.total) || 0), 0);
            const totalDisc = reportOrders.reduce((total, order) =>
                total + (order.order_status === 'Cancelled' ? 0 : Number(order.discount) || 0), 0);
            const lowStock = store.products.filter(p => p.stock_quantity <= 5).length;

            const statusMap = {};
            reportOrders.forEach(o => {
                if (!statusMap[o.order_status]) statusMap[o.order_status] = { count: 0, order_value: 0 };
                statusMap[o.order_status].count++;
                statusMap[o.order_status].order_value += Number(o.total) || 0;
            });
            const statusBreakdown = Object.keys(statusMap).map(k => ({
                order_status: k,
                count: statusMap[k].count,
                order_value: statusMap[k].order_value
            }));

            return sendJson({
                status: 'success',
                data: {
                    overview: {
                        range: from === undefined ? null : { from, to },
                        paid_order_revenue: paidRevenue,
                        total_orders: reportOrders.length,
                        average_paid_order_value: paidOrders.length ? Math.round((paidRevenue / paidOrders.length) * 100) / 100 : 0,
                        total_discounts: totalDisc,
                        recorded_income: 0,
                        recorded_expenses: 0,
                        pending_orders: store.orders.filter(order =>
                            ['Pending', 'Processing', 'Shipped'].includes(order.order_status)).length,
                        pending_payment_verification: store.orders.filter(order =>
                            order.payment_status === 'Pending Verification').length,
                        total_customers: store.customers.length,
                        low_stock_alerts: lowStock
                    },
                    status_breakdown: statusBreakdown,
                    top_products: (() => {
                        const sales = new Map();
                        for (const order of reportOrders) {
                            if (order.order_status === 'Cancelled') continue;
                            for (const item of (Array.isArray(order.items) ? order.items : [])) {
                                const productId = item.product_id;
                                const quantity = Number(item.quantity);
                                if (productId === undefined || !Number.isSafeInteger(quantity) || quantity <= 0) continue;
                                const product = store.products.find(p => p.id == productId);
                                const productName = item.product_name || item.name || (product && product.name);
                                if (!productName) continue;
                                const itemTotal = Number(item.total);
                                const itemPrice = Number(item.price);
                                const revenue = Number.isFinite(itemTotal)
                                    ? itemTotal
                                    : (Number.isFinite(itemPrice) ? itemPrice * quantity : 0);
                                const sale = sales.get(productId) || {
                                    product_id: productId,
                                    product_name: productName,
                                    total_units_sold: 0,
                                    total_order_value: 0
                                };
                                sale.total_units_sold += quantity;
                                sale.total_order_value += revenue;
                                sales.set(productId, sale);
                            }
                        }
                        return [...sales.values()]
                            .sort((a, b) => b.total_units_sold - a.total_units_sold || b.total_order_value - a.total_order_value)
                            .slice(0, 5);
                    })(),
                    recent_orders: reportOrders.slice().sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 6)
                }
            });
        }

        // 8. SETTINGS
        if (apiRoute === '/api/settings') {
            if (req.method === 'GET') {
                return sendJson({ status: 'success', data: store.settings });
            }
            if (req.method === 'POST' || req.method === 'PUT') {
                if (Object.hasOwn(body, 'delivery_fee_local_dhaka')) {
                    return sendJson({ error: 'The separate Local Dhaka delivery fee has been retired. Update the Inside Dhaka fee instead.' }, 422);
                }
                const promoKeys = [
                    'homepage_promo_eyebrow', 'homepage_promo_title', 'homepage_promo_description',
                    'homepage_promo_button_text', 'homepage_promo_link', 'homepage_promo_image'
                ];
                if (promoKeys.some(key => Object.hasOwn(body, key))
                    && adminTokens.get(getAdminRequestToken(req))?.role !== 'Super Admin') {
                    return sendJson({ error: 'Only a Super Admin can edit the homepage banner.' }, 403);
                }
                const settingsTextLimits = {
                    social_heading: 40,
                    social_instagram_label: 80,
                    social_x_label: 80,
                    social_facebook_label: 80,
                    homepage_promo_eyebrow: 80,
                    homepage_promo_title: 120,
                    homepage_promo_description: 240,
                    homepage_promo_button_text: 40
                };
                for (const [key, limit] of Object.entries(settingsTextLimits)) {
                    if (!Object.hasOwn(body, key)) continue;
                    if (typeof body[key] !== 'string' || body[key].length > limit || /[\u0000-\u001f\u007f]/.test(body[key])) {
                        return sendJson({ error: `${key} must be valid text up to ${limit} characters.` }, 422);
                    }
                    body[key] = body[key].trim();
                }
                for (const key of ['social_instagram_url', 'social_x_url', 'social_facebook_url']) {
                    if (!Object.hasOwn(body, key)) continue;
                    if (typeof body[key] !== 'string' || body[key].length > 500) {
                        return sendJson({ error: `${key} must be a valid HTTPS social profile URL.` }, 422);
                    }
                    body[key] = body[key].trim();
                    if (!body[key]) continue;
                    let url;
                    try {
                        url = new URL(body[key]);
                    } catch {
                        return sendJson({ error: `${key} must be a valid HTTPS social profile URL.` }, 422);
                    }
                    if (url.protocol !== 'https:') {
                        return sendJson({ error: `${key} must be a valid HTTPS social profile URL.` }, 422);
                    }
                }
                if (Object.hasOwn(body, 'homepage_promo_link')
                    && body.homepage_promo_link !== ''
                    && !isSafeHomepageUrl(body.homepage_promo_link)) {
                    return sendJson({ error: 'Homepage banner link must be a safe HTTP(S) or store-relative URL.' }, 422);
                }
                if (Object.hasOwn(body, 'homepage_promo_image')) {
                    const image = body.homepage_promo_image;
                    if (typeof image !== 'string'
                        || (image !== '' && (!/^assets\/hero\/[a-f0-9]{32}\.jpg$/i.test(image)
                            || !fs.existsSync(path.join(WEB_DIR, image))))) {
                        return sendJson({ error: 'Homepage banner image must be uploaded through the image processor.' }, 422);
                    }
                }
                if (Object.hasOwn(body, 'primary_nav_links')) {
                    if (adminTokens.get(getAdminRequestToken(req))?.role !== 'Super Admin') {
                        return sendJson({ error: 'Only a Super Admin can edit the primary navigation.' }, 403);
                    }
                    const links = body.primary_nav_links;
                    const pageIds = new Set(Object.keys(HERO_PAGE_HREFS));
                    const validCategoryLink = value => /^category:[a-z0-9-]{1,150}$/.test(value)
                        && store.categories.some(category => category.slug === value.slice('category:'.length)
                            && Number(category.is_archived) !== 1);
                    if (!Array.isArray(links) || links.length > 5
                        || links.some(link => typeof link !== 'string')
                        || new Set(links).size !== links.length
                        || links.some(link => !pageIds.has(link) && !validCategoryLink(link))) {
                        return sendJson({ error: 'Choose up to five unique, valid navigation links.' }, 422);
                    }
                    body.primary_nav_links = JSON.stringify(links);
                }
                if (Object.hasOwn(body, 'homepage_hero_slides')) {
                    if (adminTokens.get(getAdminRequestToken(req))?.role !== 'Super Admin') {
                        return sendJson({ error: 'Only a Super Admin can edit the homepage carousel.' }, 403);
                    }
                    const slides = body.homepage_hero_slides;
                    if (!Array.isArray(slides) || slides.length < 1 || slides.length > 10
                        || slides.some(slide => !slide || typeof slide !== 'object' || Array.isArray(slide)
                            || !['products', 'categories', 'both'].includes(slide.mode)
                            || typeof slide.eyebrow !== 'string' || slide.eyebrow.length > 80
                            || typeof slide.title !== 'string' || !slide.title.trim() || slide.title.length > 120
                            || typeof slide.description !== 'string' || slide.description.length > 240
                            || typeof slide.button_text !== 'string' || !slide.button_text.trim() || slide.button_text.length > 40
                            || !['shop', 'product', 'category', 'url', 'track'].includes(slide.button_target)
                            || (slide.button_url !== undefined && typeof slide.button_url !== 'string')
                            || (slide.button_url !== undefined && slide.button_url.length > 500)
                            || (slide.button_target === 'url' && !isSafeHomepageUrl(slide.button_url))
                            || typeof slide.enabled !== 'boolean'
                            || !Array.isArray(slide.product_ids) || !Array.isArray(slide.category_ids)
                            || slide.product_ids.length > 3 || slide.category_ids.length > 3
                            || slide.product_ids.some(id => !Number.isSafeInteger(id) || id < 1)
                            || slide.category_ids.some(id => !Number.isSafeInteger(id) || id < 1)
                            || new Set(slide.product_ids).size !== slide.product_ids.length
                            || new Set(slide.category_ids).size !== slide.category_ids.length
                            || (slide.mode !== 'categories' && slide.product_ids.length === 0)
                            || (slide.mode !== 'products' && slide.category_ids.length === 0)
                            || (slide.button_target === 'product'
                                && (slide.mode === 'categories' || slide.product_ids.length === 0))
                            || (slide.button_target === 'category'
                                && (slide.mode === 'products' || slide.category_ids.length === 0)))) {
                        return sendJson({ error: 'Homepage carousel must contain 1–10 valid slides.' }, 422);
                    }
                    const productIds = [...new Set(slides.flatMap(slide => slide.product_ids))];
                    const categoryIds = [...new Set(slides.flatMap(slide => slide.category_ids))];
                    if (productIds.some(id => !store.products.some(product =>
                        Number(product.id) === id && Number(product.is_sellable ?? 1) === 1
                    )) || categoryIds.some(id => !store.categories.some(category => Number(category.id) === id))) {
                        return sendJson({ error: 'A selected homepage product or category is unavailable.' }, 422);
                    }
                }
                store.settings = { ...store.settings, ...body };
                saveStore();
                return sendJson({ status: 'success', message: 'Settings saved' });
            }
        }

        // 9. AUTH
        if (apiRoute === '/api/auth') {
            if (action === 'admin_login') {
                const username = typeof body.username === 'string' ? body.username.trim() : '';
                const account = store.adminAccounts.find(item =>
                    item.username.toLowerCase() === username.toLowerCase() && item.is_active === true);
                const isEnvironmentAdmin = username === DEV_ADMIN_USERNAME && body.password === DEV_ADMIN_PASSWORD;
                const passwordValid = isEnvironmentAdmin
                    || (account && verifyDevAdminPassword(body.password, account.password_hash));
                if (account && passwordValid) {
                    const token = 'wc_adm_' + require('crypto').randomBytes(32).toString('hex');
                    const mustChangePassword = account.must_change_password === true;
                    const expiresAt = Date.now() + (mustChangePassword ? 15 * 60 * 1000 : 12 * 60 * 60 * 1000);
                    adminTokens.set(token, {
                        token,
                        adminId: Number(account.id),
                        username: account.username,
                        role: account.role,
                        mustChangePassword,
                        expiresAt
                    });
                    const isWebClient = req.headers['x-wc-admin-client'] === 'web';
                    const loginData = {
                        admin_id: account.id,
                        username: account.username,
                        full_name: account.full_name,
                        role: account.role,
                        expires_at: new Date(expiresAt).toISOString().slice(0, 19).replace('T', ' '),
                        must_change_password: mustChangePassword
                    };
                    if (!isWebClient) loginData.token = token;
                    return sendJson({
                        status: 'success',
                        message: 'Admin authorized',
                        data: loginData
                    }, 200, isWebClient ? {
                        'Set-Cookie': `wc_admin_dev=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200`
                    } : {});
                }
                return sendJson({ error: 'Invalid admin credentials' }, 401);
            }

            if (action === 'admin_session') {
                const token = getAdminRequestToken(req);
                const session = adminTokens.get(token);
                if (!session || session.expiresAt <= Date.now()) {
                    return sendJson({ error: 'Authentication required' }, 401);
                }
                const account = store.adminAccounts.find(item => Number(item.id) === Number(session.adminId));
                if (!account || account.is_active !== true) return sendJson({ error: 'Authentication required' }, 401);
                return sendJson({
                    status: 'success',
                    data: {
                        username: session.username,
                        full_name: account.full_name,
                        role: account.role,
                        expires_at: new Date(session.expiresAt).toISOString().slice(0, 19).replace('T', ' '),
                        must_change_password: session.mustChangePassword === true
                    }
                });
            }

            if (action === 'admin_permissions') {
                const session = adminTokens.get(getAdminRequestToken(req));
                if (!session || session.expiresAt <= Date.now()) {
                    return sendJson({ error: 'Authentication required' }, 401);
                }
                return sendJson({
                    status: 'success',
                    data: {
                        role: session.role,
                        permissions: getDevRolePermissions(session.role)
                    }
                });
            }

            if (action === 'admin_change_password') {
                const session = adminTokens.get(getAdminRequestToken(req));
                const account = store.adminAccounts.find(item => Number(item.id) === Number(session?.adminId));
                const currentPassword = typeof body.current_password === 'string' ? body.current_password : '';
                const newPassword = typeof body.new_password === 'string' ? body.new_password : '';
                if (!session || !account || !verifyDevAdminPassword(currentPassword, account.password_hash)
                    || newPassword.length < 14 || newPassword.length > 72) {
                    return sendJson({ error: 'Enter the correct current password and a new password between 14 and 72 characters.' }, 422);
                }
                account.password_hash = hashDevAdminPassword(newPassword);
                account.must_change_password = false;
                session.mustChangePassword = false;
                session.expiresAt = Date.now() + 12 * 60 * 60 * 1000;
                for (const [otherToken, otherSession] of adminTokens.entries()) {
                    if (otherToken !== session.token && Number(otherSession.adminId) === Number(account.id)) {
                        adminTokens.delete(otherToken);
                    }
                }
                saveStore();
                const isWebClient = req.headers['x-wc-admin-client'] === 'web';
                return sendJson({ status: 'success', message: 'Admin password updated.' }, 200, isWebClient ? {
                    'Set-Cookie': `wc_admin_dev=${session.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200`
                } : {});
            }

            if (action.startsWith('admin_') && action !== 'admin_login'
                && action !== 'admin_session' && action !== 'admin_permissions'
                && action !== 'admin_change_password' && action !== 'admin_logout') {
                const session = adminTokens.get(getAdminRequestToken(req));
                if (session?.role !== 'Super Admin') {
                    return sendJson({ error: 'Only a Super Admin can manage staff accounts and roles.' }, 403);
                }
                const audit = (event, details) => {
                    store.adminAuditLog.push({
                        id: store.adminAuditLog.length + 1,
                        admin_id: session.adminId,
                        action: event,
                        details,
                        created_at: new Date().toISOString()
                    });
                    saveStore();
                };
                if (action === 'admin_list_users') {
                    return sendJson({
                        status: 'success',
                        data: store.adminAccounts.map(user => ({
                            id: user.id,
                            username: user.username,
                            full_name: user.full_name,
                            role: user.role,
                            is_active: user.is_active ? 1 : 0,
                            is_current: Number(user.id) === Number(session.adminId),
                            created_at: user.created_at
                        }))
                    });
                }
                if (action === 'admin_list_roles') {
                    return sendJson({ status: 'success', data: store.adminRoles });
                }
                if (action === 'admin_reset_user_password') {
                    const adminId = parseIntegerInput(body.admin_id);
                    const currentPassword = typeof body.current_password === 'string' ? body.current_password : '';
                    const temporaryPassword = typeof body.temporary_password === 'string' ? body.temporary_password : '';
                    if (!Number.isSafeInteger(adminId) || adminId < 1 || adminId === Number(session.adminId)
                        || currentPassword === '' || temporaryPassword.length < 14 || temporaryPassword.length > 72) {
                        return sendJson({ error: 'Choose another active administrator and enter your current password and a 14–72 character temporary password.' }, 422);
                    }

                    const resetRateKey = `${req.socket.remoteAddress || 'local'}:${session.adminId}`;
                    const now = Date.now();
                    const currentRate = adminPasswordResetRateLimits.get(resetRateKey);
                    if (currentRate && currentRate.resetAt > now && currentRate.count >= 5) {
                        res.setHeader('Retry-After', String(Math.ceil((currentRate.resetAt - now) / 1000)));
                        return sendJson({ error: 'Too many administrator password resets. Please wait before trying again.' }, 429);
                    }
                    if (!currentRate || currentRate.resetAt <= now) {
                        adminPasswordResetRateLimits.set(resetRateKey, { count: 1, resetAt: now + 15 * 60 * 1000 });
                    } else {
                        currentRate.count += 1;
                    }

                    const actor = store.adminAccounts.find(item => Number(item.id) === Number(session.adminId) && item.is_active);
                    const currentPasswordValid = actor && (
                        (actor.username === DEV_ADMIN_USERNAME && currentPassword === DEV_ADMIN_PASSWORD)
                        || verifyDevAdminPassword(currentPassword, actor.password_hash)
                    );
                    if (!currentPasswordValid) {
                        return sendJson({ error: 'Current password is incorrect.' }, 401);
                    }
                    const target = store.adminAccounts.find(item => Number(item.id) === adminId && item.is_active);
                    if (!target) return sendJson({ error: 'Active administrator not found.' }, 404);

                    target.password_hash = hashDevAdminPassword(temporaryPassword);
                    target.must_change_password = true;
                    for (const [otherToken, otherSession] of adminTokens.entries()) {
                        if (Number(otherSession.adminId) === adminId) adminTokens.delete(otherToken);
                    }
                    audit('reset_admin_password', {
                        admin_id: adminId,
                        username: target.username,
                        password_change_required: true,
                        sessions_revoked: true
                    });
                    return sendJson({
                        status: 'success',
                        message: 'Temporary password set; the administrator must change it at next sign-in.'
                    });
                }
                if (action === 'admin_create_user') {
                    const username = typeof body.username === 'string' ? body.username.trim() : '';
                    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
                    const password = typeof body.password === 'string' ? body.password : '';
                    const role = typeof body.role === 'string' ? body.role.trim() : '';
                    if (!/^[a-zA-Z0-9._-]{3,48}$/.test(username) || !fullName || fullName.length > 120
                        || password.length < 14 || password.length > 72
                        || !store.adminRoles.some(item => item.name === role)) {
                        return sendJson({ error: 'Enter a valid username, name, 14–72 character password, and role.' }, 422);
                    }
                    if (store.adminAccounts.some(item => item.username.toLowerCase() === username.toLowerCase())) {
                        return sendJson({ error: 'That username is already in use.' }, 409);
                    }
                    const user = {
                        id: Math.max(0, ...store.adminAccounts.map(item => Number(item.id) || 0)) + 1,
                        username,
                        full_name: fullName,
                        role,
                        is_active: true,
                        password_hash: hashDevAdminPassword(password),
                        must_change_password: true,
                        created_at: new Date().toISOString()
                    };
                    store.adminAccounts.push(user);
                    audit('create_admin', { username, role });
                    return sendJson({ status: 'success', message: 'Administrator account created.' });
                }
                if (action === 'admin_assign_role') {
                    const adminId = parseIntegerInput(body.admin_id);
                    const role = typeof body.role === 'string' ? body.role.trim() : '';
                    const target = store.adminAccounts.find(item => Number(item.id) === adminId && item.is_active);
                    if (!target || Number(target.id) === Number(session.adminId)
                        || !store.adminRoles.some(item => item.name === role)) {
                        return sendJson({ error: 'Choose a valid active administrator and role.' }, 422);
                    }
                    if (target.role === 'Super Admin' && role !== 'Super Admin'
                        && store.adminAccounts.filter(item => item.is_active && item.role === 'Super Admin').length <= 1) {
                        return sendJson({ error: 'The last active Super Admin cannot be demoted.' }, 409);
                    }
                    const oldRole = target.role;
                    target.role = role;
                    for (const [otherToken, otherSession] of adminTokens.entries()) {
                        if (Number(otherSession.adminId) === adminId) adminTokens.delete(otherToken);
                    }
                    audit('assign_admin_role', { admin_id: adminId, old_role: oldRole, role });
                    return sendJson({ status: 'success', message: 'Administrator role updated.' });
                }
                if (action === 'admin_deactivate_user') {
                    const adminId = parseIntegerInput(body.admin_id);
                    const target = store.adminAccounts.find(item => Number(item.id) === adminId && item.is_active);
                    if (!target || Number(target.id) === Number(session.adminId)) {
                        return sendJson({ error: 'Choose another valid active administrator account.' }, 422);
                    }
                    if (target.role === 'Super Admin'
                        && store.adminAccounts.filter(item => item.is_active && item.role === 'Super Admin').length <= 1) {
                        return sendJson({ error: 'The last active Super Admin cannot be deactivated.' }, 409);
                    }
                    target.is_active = false;
                    for (const [otherToken, otherSession] of adminTokens.entries()) {
                        if (Number(otherSession.adminId) === adminId) adminTokens.delete(otherToken);
                    }
                    audit('deactivate_admin', { admin_id: adminId, username: target.username });
                    return sendJson({ status: 'success', message: 'Administrator account deactivated.' });
                }
                if (action === 'admin_save_role') {
                    const name = typeof body.name === 'string' ? body.name.trim() : '';
                    const permissions = body.permissions;
                    if (!/^[A-Za-z][A-Za-z0-9 _-]{1,39}$/.test(name)
                        || Object.keys(DEV_BUILTIN_ROLES).some(builtIn => builtIn.toLowerCase() === name.toLowerCase())
                        || !Array.isArray(permissions) || permissions.length > 60
                        || permissions.some(permission => typeof permission !== 'string' || !DEV_ROLE_PERMISSION_CATALOG.has(permission))) {
                        return sendJson({ error: 'Enter a custom role name and choose valid permissions.' }, 422);
                    }
                    const role = { name, permissions: [...new Set(permissions)] };
                    const index = store.adminRoles.findIndex(item => item.name === name);
                    if (index >= 0) store.adminRoles[index] = role;
                    else store.adminRoles.push(role);
                    audit('save_admin_role', { role: name, permissions: role.permissions });
                    return sendJson({ status: 'success', message: 'Role saved.' });
                }
                if (action === 'admin_delete_role') {
                    const name = typeof body.name === 'string' ? body.name.trim() : '';
                    if (Object.keys(DEV_BUILTIN_ROLES).some(builtIn => builtIn.toLowerCase() === name.toLowerCase())) {
                        return sendJson({ error: 'Built-in roles cannot be deleted.' }, 422);
                    }
                    if (store.adminAccounts.some(user => user.is_active && user.role === name)) {
                        return sendJson({ error: 'Reassign active staff using this role before deleting it.' }, 409);
                    }
                    const index = store.adminRoles.findIndex(item => item.name === name);
                    if (index < 0) return sendJson({ error: 'Custom role not found.' }, 404);
                    store.adminRoles.splice(index, 1);
                    audit('delete_admin_role', { role: name });
                    return sendJson({ status: 'success', message: 'Role deleted.' });
                }
            }

            if (action === 'admin_logout') {
                adminTokens.delete(getAdminRequestToken(req));
                const isWebClient = req.headers['x-wc-admin-client'] === 'web';
                return sendJson({ status: 'success', message: 'Admin logged out' }, 200, isWebClient ? {
                    'Set-Cookie': 'wc_admin_dev=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
                } : {});
            }

            if (action === 'customer_logout') {
                const token = customerTokenFromRequest(req);
                if (token) customerTokens.delete(token);
                return sendJson({ status: 'success', message: 'Signed out.' });
            }

            if (action === 'customer_session') {
                const session = getDevCustomerSession(req);
                if (!session) return sendJson({ error: 'Customer authorization required.' }, 401);
                const { customer } = session;
                const { password_hash: _passwordHash, ...profile } = customer;
                return sendJson({ status: 'success', data: { ...profile, email_verified: customer.email_verified !== false } });
            }

            if (action === 'customer_update_profile') {
                const session = getDevCustomerSession(req);
                if (!session) return sendJson({ error: 'Customer authorization required.' }, 401);
                const { customer } = session;
                const name = typeof body.name === 'string' ? body.name.trim() : '';
                const phone = typeof body.phone === 'string' ? normalizeDevBangladeshMobile(body.phone) : null;
                const whatsappValue = typeof body.whatsapp_phone === 'string' ? body.whatsapp_phone.trim() : '';
                const whatsapp = whatsappValue ? normalizeDevBangladeshMobile(whatsappValue) : null;
                const area = typeof body.area === 'string' ? body.area.trim() : '';
                const address = typeof body.address === 'string' ? body.address.trim() : '';
                const homeLimits = {
                    home_house_flat: 150, home_road: 150, home_village_area: 150, home_union_ward: 150,
                    home_upazila_thana: 100, home_district: 100, home_division: 100, home_postcode: 20
                };
                const homeValues = {};
                for (const [field, limit] of Object.entries(homeLimits)) {
                    const value = body[field] ?? '';
                    if (typeof value !== 'string' || value.length > limit
                        || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
                        return sendJson({ error: 'One or more home-address fields are invalid or too long.' }, 422);
                    }
                    homeValues[field] = value.trim() || null;
                }
                const preferenceFields = ['notify_email', 'notify_whatsapp', 'notify_website'];
                if (!name || name.length > 150 || !phone || area.length > 100 || address.length > 4000
                    || (whatsappValue && !whatsapp)
                    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(name + area + address)
                    || preferenceFields.some(field => typeof body[field] !== 'boolean')
                    || (body.notify_whatsapp && !whatsapp)) {
                    return sendJson({ error: 'Enter a valid name, phone number, area, address, and notification preferences.' }, 422);
                }
                const phoneTaken = store.customers.some(item =>
                    Number(item.id) !== Number(customer.id)
                    && normalizeDevBangladeshMobile(String(item.phone || '')) === phone
                );
                if (phoneTaken) return sendJson({ error: 'Phone already registered.' }, 409);

                Object.assign(customer, {
                    name,
                    phone,
                    whatsapp_phone: whatsapp,
                    area,
                    address,
                    ...homeValues,
                    notify_email: body.notify_email,
                    notify_whatsapp: body.notify_whatsapp,
                    notify_website: body.notify_website
                });
                saveStore();
                const { password_hash: _passwordHash, ...profile } = customer;
                return sendJson({ status: 'success', message: 'Profile updated successfully.', data: profile });
            }

            if (action === 'customer_delete_account') {
                const session = getDevCustomerSession(req);
                if (!session) return sendJson({ error: 'Customer authorization required.' }, 401);
                const password = typeof body.password === 'string' ? body.password : '';
                const credential = store.customerCredentials.find(account =>
                    Number(account.customer_id) === Number(session.customer.id)
                );
                if (!password || password.length > 72
                    || !credential || !verifyDevAdminPassword(password, credential.password_hash)) {
                    return sendJson({ error: 'Current password is incorrect.' }, 401);
                }
                const customerId = Number(session.customer.id);
                for (const order of store.orders) {
                    if (Number(order.customer_id) !== customerId) continue;
                    Object.assign(order, {
                        customer_id: null,
                        customer_name: 'Deleted customer',
                        customer_phone: '',
                        customer_email: null,
                        delivery_address: 'Deleted',
                        notes: null
                    });
                }
                store.customers = store.customers.filter(customer => Number(customer.id) !== customerId);
                store.customerCredentials = store.customerCredentials.filter(account => Number(account.customer_id) !== customerId);
                store.customerFeedback = store.customerFeedback.filter(item => Number(item.customer_id) !== customerId);
                customerTokens.delete(session.token);
                saveStore();
                return sendJson({ status: 'success', message: 'Your account has been deleted.' });
            }

            if (action === 'register') {
                const name = typeof body.name === 'string' ? body.name.trim() : '';
                const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
                const phone = normalizeDevBangladeshMobile(body.phone);
                const whatsappValue = typeof body.whatsapp_phone === 'string' ? body.whatsapp_phone.trim() : '';
                const whatsapp = whatsappValue ? normalizeDevBangladeshMobile(whatsappValue) : null;
                const password = typeof body.password === 'string' ? body.password : '';
                const preferences = ['notify_email', 'notify_whatsapp', 'notify_website'];
                const homeFields = [
                    'home_house_flat', 'home_road', 'home_village_area', 'home_union_ward',
                    'home_upazila_thana', 'home_district', 'home_division', 'home_postcode'
                ];
                const homeValues = {};
                for (const [field, limit] of Object.entries({
                    home_house_flat: 150, home_road: 150, home_village_area: 150, home_union_ward: 150,
                    home_upazila_thana: 100, home_district: 100, home_division: 100, home_postcode: 20
                })) {
                    const value = body[field] ?? '';
                    if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
                        return sendJson({ error: 'One or more home-address fields are invalid or too long.' }, 422);
                    }
                    homeValues[field] = value.trim();
                }
                if (!name || !email || !phone || !password
                    || name.length > 150 || email.length > 150
                    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(name + body.area)
                    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                    || password.length < 12 || password.length > 72
                    || typeof body.area !== 'string' || body.area.trim().length > 100
                    || (whatsappValue && !whatsapp)
                    || preferences.some(field => typeof body[field] !== 'boolean')
                    || (body.notify_whatsapp && !whatsapp)) {
                    return sendJson({ error: 'Provide a valid name, email, Bangladesh mobile number, password, and notification preferences. Passwords must be 12–72 characters.' }, 422);
                }
                if (store.customers.some(customer =>
                    String(customer.email || '').trim().toLowerCase() === email)
                    || store.customerCredentials.some(account =>
                        String(account.email || '').trim().toLowerCase() === email)) {
                    return sendJson({ error: 'Email already registered.' }, 409);
                }
                if (store.customers.some(customer =>
                    normalizeDevBangladeshMobile(String(customer.phone || '')) === phone)) {
                    return sendJson({ error: 'Phone already registered.' }, 409);
                }
                const address = homeFields.map(field => homeValues[field]).filter(Boolean).join(', ');
                const id = Math.max(0, ...store.customers.map(customer => Number(customer.id) || 0)) + 1;
                store.customers.push({
                    id, name, email, phone, whatsapp_phone: whatsapp,
                    notify_email: body.notify_email, notify_whatsapp: body.notify_whatsapp,
                    notify_website: body.notify_website, area: body.area.trim() || 'Dhaka',
                    city: homeValues.home_district || 'Dhaka', address, ...homeValues,
                    email_verified: true, is_vip: 0, total_orders: 0, total_spent: 0
                });
                store.customerCredentials.push({
                    customer_id: id,
                    email,
                    password_hash: hashDevAdminPassword(password)
                });
                saveStore();
                return sendJson({
                    status: 'success',
                    message: 'Account created. Email verification is skipped by the local development server.',
                    data: { id, email }
                }, 201);
            }

            if (action === 'login') {
                const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
                const password = typeof body.password === 'string' ? body.password : '';
                const credentials = store.customerCredentials.find(account =>
                    String(account.email || '').trim().toLowerCase() === email
                );
                const customer = credentials && store.customers.find(item => Number(item.id) === Number(credentials.customer_id));
                if (!customer || !verifyDevAdminPassword(password, credentials.password_hash)) {
                    return sendJson({ error: 'Invalid email or password.' }, 401);
                }
                const token = `wc_usr_${require('crypto').randomBytes(32).toString('hex')}`;
                const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
                customerTokens.set(token, { customerId: Number(customer.id), expiresAt });
                const { password_hash: _passwordHash, ...profile } = customer;
                return sendJson({
                    status: 'success',
                    message: 'Login successful.',
                    data: {
                        ...profile,
                        id: Number(customer.id),
                        email: String(customer.email || email).trim().toLowerCase(),
                        email_verified: customer.email_verified !== false,
                        token,
                        expires_at: new Date(expiresAt).toISOString()
                    }
                });
            }
            return sendJson({ error: 'Unknown authentication action.' }, 400);
        }

        // 10. TRACK
        if (apiRoute === '/api/feedback') {
            if (req.method === 'GET') {
                if (query.admin !== '1') {
                    return sendJson({ error: 'Admin feedback access is required.' }, 401);
                }
                const status = typeof query.status === 'string' ? query.status : 'pending';
                if (!['pending', 'approved', 'hidden', 'all'].includes(status)) {
                    return sendJson({ error: 'Choose a valid feedback filter.' }, 422);
                }
                const search = typeof query.q === 'string' ? query.q.trim().toLowerCase() : '';
                const feedback = store.customerFeedback
                    .filter(item => {
                        const publicAllowed = Number(item.allow_public) === 1;
                        const approved = Number(item.is_approved) === 1;
                        if (status === 'pending' && (!publicAllowed || approved)) return false;
                        if (status === 'approved' && (!publicAllowed || !approved)) return false;
                        if (status === 'hidden' && approved) return false;
                        if (!search) return true;
                        return [
                            item.order_number,
                            item.customer_name,
                            item.customer_email,
                            item.product_name
                        ].some(value => String(value || '').toLowerCase().includes(search));
                    })
                    .sort((a, b) => Date.parse(b.created_at || '') - Date.parse(a.created_at || ''))
                    .slice(0, 200);
                return sendJson({ status: 'success', data: feedback });
            }
            if (req.method === 'PUT') {
                const feedbackId = parseIntegerInput(body.id);
                const action = body.action;
                if (!Number.isSafeInteger(feedbackId) || feedbackId < 1
                    || !['approve', 'hide', 'reply'].includes(action)) {
                    return sendJson({ error: 'Choose a valid feedback update.' }, 422);
                }
                const feedback = store.customerFeedback.find(item => Number(item.id) === feedbackId);
                if (!feedback) return sendJson({ error: 'Feedback not found.' }, 404);
                if (action === 'approve' || action === 'hide') {
                    if (action === 'approve' && Number(feedback.allow_public) !== 1) {
                        return sendJson({ error: 'This customer did not allow public display.' }, 409);
                    }
                    feedback.is_approved = action === 'approve' ? 1 : 0;
                } else {
                    const reply = typeof body.reply === 'string' ? body.reply.trim() : '';
                    if (!reply || reply.length > 2000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(reply)) {
                        return sendJson({ error: 'Enter an admin reply of 2,000 characters or fewer.' }, 422);
                    }
                    feedback.admin_reply = reply;
                    feedback.replied_at = new Date().toISOString();
                    feedback.replied_by = requestSession.adminId;
                }
                store.adminAuditLog.push({
                    id: Math.max(0, ...store.adminAuditLog.map(item => Number(item.id) || 0)) + 1,
                    admin_id: requestSession.adminId,
                    action: `feedback_${action}`,
                    details: { feedback_id: feedbackId },
                    created_at: new Date().toISOString()
                });
                saveStore();
                return sendJson({ status: 'success', message: 'Feedback updated.' });
            }
            return sendJson({ error: 'Method not allowed.' }, 405, { Allow: 'GET, PUT' });
        }

        if (apiRoute === '/api/notifications') {
            if (req.method !== 'GET' || query.admin !== '1') {
                return sendJson({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
            }
            const notifications = store.notificationLogs
                .slice()
                .sort((a, b) => Date.parse(b.created_at || '') - Date.parse(a.created_at || ''))
                .slice(0, 200);
            return sendJson({ status: 'success', data: notifications });
        }

        if (apiRoute === '/api/track') {
            const rawTerm = query.order || query.tracking_code || body.order || body.tracking_code || '';
            const term = typeof rawTerm === 'string' ? rawTerm.trim().toLowerCase() : '';
            const rawPhone = query.phone ?? body.phone;
            const qrTrackingCode = typeof body.qr_tracking_code === 'string'
                ? body.qr_tracking_code.trim().toUpperCase()
                : '';
            const normalizePhone = value => {
                const digits = String(value).replace(/\D/g, '');
                return digits.startsWith('00880')
                    ? digits.slice(2)
                    : digits.startsWith('880')
                        ? `0${digits.slice(3)}`
                        : digits;
            };
            const phone = typeof rawPhone === 'string' ? normalizePhone(rawPhone) : '';
            if (!term) {
                return sendJson({ error: 'Please provide an order number or tracking code.' }, 400);
            }
            if (qrTrackingCode !== ''
                && (!/^WC-(?:[A-F0-9]{10}|[A-F0-9]{32})$/.test(term.toUpperCase())
                    || !/^TRK-WC-(?:[A-F0-9]{10}|[A-F0-9]{32})$/.test(qrTrackingCode))) {
                return sendJson({ error: 'No order found matching your tracking information.' }, 404);
            }
            if (!phone && qrTrackingCode === '') {
                return sendJson({ error: 'Please provide the phone number used when placing the order.' }, 400);
            }
            if (qrTrackingCode === '' && (phone.length < 8 || phone.length > 15)) {
                return sendJson({ error: 'Please provide a valid phone number.' }, 400);
            }
            const order = store.orders.find(o =>
                (qrTrackingCode !== ''
                    ? o.order_number === term.toUpperCase() && o.tracking_code === qrTrackingCode
                    : (o.order_number.toLowerCase() === term || o.tracking_code.toLowerCase() === term)
                        && normalizePhone(o.customer_phone || '') === phone)
            );
            if (!order) {
                return sendJson({
                    error: 'No order found matching your tracking information. Please verify your order number and phone.'
                }, 404);
            }

            const status = order.order_status;
            const timeline = [
                { title: 'Order Placed', desc: 'Order received and logged in system', time: order.created_at, completed: true },
                { title: 'Order Confirmed', desc: 'Verified by Shopademia', time: ['Processing', 'Shipped', 'Delivered'].includes(status) ? 'Confirmed' : 'Pending', completed: ['Processing', 'Shipped', 'Delivered'].includes(status) },
                { title: 'Packed & Quality Checked', desc: 'Securely packed with warranty and receipt', time: ['Processing', 'Shipped', 'Delivered'].includes(status) ? 'Passed QA' : 'Pending', completed: ['Processing', 'Shipped', 'Delivered'].includes(status) },
                { title: 'Dispatched by Shopademia', desc: `Handed over to delivery rider for ${order.delivery_area}`, time: ['Shipped', 'Delivered'].includes(status) ? 'In Transit' : 'Pending', completed: ['Shipped', 'Delivered'].includes(status) },
                { title: 'Delivered to Customer', desc: `Delivered at ${order.delivery_address}`, time: status === 'Delivered' ? 'Delivered' : 'Delivery estimate provided by courier', completed: status === 'Delivered' }
            ];

            return sendJson({
                status: 'success',
                data: {
                    order_number: order.order_number,
                    tracking_code: order.tracking_code,
                    order_status: order.order_status,
                    customer_name: order.customer_name,
                    delivery_address: order.delivery_address,
                    delivery_area: order.delivery_area,
                    payment_method: order.payment_method,
                    payment_status: order.payment_status,
                    total: order.total,
                    items: order.items,
                    timeline: timeline
                }
            });
        }

        return sendJson({ error: 'API endpoint not recognized' }, 404);
    }

    // --- STATIC ASSET SERVING ---
    let filePath = path.join(WEB_DIR, pathname === '/' ? 'index.html' : pathname);

    // If requested without extension, check for .html
    if (!path.extname(filePath) && fs.existsSync(filePath + '.html')) {
        filePath += '.html';
    }

    fs.stat(filePath, (err, stats) => {
        try {
            if (err && !['ENOENT', 'ENOTDIR'].includes(err.code)) {
                console.error('Static file stat error:', err);
                if (!res.headersSent && !res.writableEnded) {
                    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end('500 Internal Server Error');
                }
                return;
            }
            if (err || !stats.isFile()) {
                // Check custom 404
                const notFoundPage = path.join(WEB_DIR, '404.html');
                if (fs.existsSync(notFoundPage)) {
                    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                    const notFoundStream = fs.createReadStream(notFoundPage);
                    notFoundStream.on('error', streamError => {
                        console.error('Static 404 page read error:', streamError);
                        if (!res.headersSent && !res.writableEnded) {
                            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                            res.end('500 Internal Server Error');
                        } else if (!res.writableEnded && !res.destroyed) {
                            res.end();
                        }
                    });
                    return notFoundStream.pipe(res);
                }
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                return res.end('404 Not Found');
            }

            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';

            res.writeHead(200, { 'Content-Type': contentType });
            const fileStream = fs.createReadStream(filePath);
            fileStream.on('error', streamError => {
                console.error('Static file read error:', streamError);
                if (!res.headersSent && !res.writableEnded) {
                    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end('500 Internal Server Error');
                } else if (!res.writableEnded && !res.destroyed) {
                    res.end();
                }
            });
            fileStream.pipe(res);
        } catch (callbackError) {
            console.error('Static file response error:', callbackError);
            if (!res.headersSent && !res.writableEnded) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('500 Internal Server Error');
            } else if (!res.writableEnded && !res.destroyed) {
                res.end();
            }
        }
    });
    } catch (error) {
        console.error('Request error:', error);
        const statusCode = error && [400, 413].includes(error.statusCode) ? error.statusCode : 500;
        if (!res.headersSent && !res.writableEnded) {
            const message = statusCode === 400
                ? 'Malformed JSON request body'
                : statusCode === 413
                    ? 'Request body too large'
                    : 'Internal server error';
            res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: message }, null, 2));
        } else if (!res.writableEnded) {
            res.end();
        }
    }
});

server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use on ${HOST}. Stop its owner or choose another port with PORT.`);
    } else {
        console.error('Development server failed to start:', error.message);
    }
    process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
    const listeningPort = server.address().port;
    console.log(`=======================================================`);
    console.log(`🛍️  Shopademia Web & API Server Running!`);
    console.log(`📍  Store: Dhaka, Bangladesh`);
    console.log(`🌐  Local URL: http://${HOST}:${listeningPort}`);
    console.log(`📱  Admin Panel Web View: http://${HOST}:${listeningPort}/admin.html`);
    console.log(`📦  Tracking: http://localhost:${listeningPort}/track-order.html`);
    console.log(`🔌  REST API: http://localhost:${listeningPort}/api/products`);
    console.log(`🔐  Development admin username: ${DEV_ADMIN_USERNAME}`);
    if (!process.env.DEV_ADMIN_PASSWORD) {
        console.log(`🔐  Generated development password (store only in your local session): ${DEV_ADMIN_PASSWORD}`);
    }
    console.log(`=======================================================`);
});
