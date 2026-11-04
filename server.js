/**
 * Wonderful Collection - Standalone Full Stack Development Server
 * Zero dependencies! Runs with built-in Node.js modules.
 * Serves static web frontend and full REST API for Website and Android App.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const WEB_DIR = path.join(__dirname, 'web');
const DATA_FILE = path.join(__dirname, 'dev-data.json');

// Initial seed data
const initialData = {
    settings: {
        store_name: "Wonderful Collection",
        store_moto: "🛍️ Wonderful Collection: Your top online shopping service in Dhanmondi, Dhaka. Quality delivered. 🇧🇩",
        store_email: "contact@wonderfulcollection.store",
        store_phone: "+880 1712-345678",
        store_address: "House 42, Road 7/A, Dhanmondi, Dhaka-1209, Bangladesh",
        currency_symbol: "৳",
        currency_code: "BDT",
        delivery_fee_dhanmondi: "60",
        delivery_fee_dhaka: "80",
        delivery_fee_outside_dhaka: "130",
        free_delivery_min_amount: "2000",
        bkash_number: "01712345678 (Merchant / Personal)",
        nagad_number: "01812345678 (Merchant)",
        rocket_number: "01912345678 (Personal)"
    },
    categories: [
        { id: 1, name: "Men's Fashion", slug: "mens-fashion", description: "Premium Panjabis, shirts, and traditional attire.", image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&q=80", product_count: 1 },
        { id: 2, name: "Women's Fashion", slug: "womens-fashion", description: "Exquisite designer salwar kameez, sarees and kurtis.", image: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=500&q=80", product_count: 2 },
        { id: 3, name: "Perfumes & Attar", slug: "perfumes-attar", description: "Long-lasting Arabian oud, concentrated attars, and luxury fragrances.", image: "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=500&q=80", product_count: 1 },
        { id: 4, name: "Gadgets & Electronics", slug: "gadgets-electronics", description: "Smartwatches, wireless earbuds, and lifestyle tech accessories.", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80", product_count: 1 },
        { id: 5, name: "Leather & Accessories", slug: "leather-accessories", description: "100% Genuine Bangladeshi leather wallets, belts, and luxury bags.", image: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=500&q=80", product_count: 2 },
        { id: 6, name: "Home Decor & Living", slug: "home-decor", description: "Aesthetic scented candles, art pieces, and modern home essentials.", image: "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b8?w=500&q=80", product_count: 1 }
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
            description: "Experience exceptional elegance with our flagship Royal Nawab Panjabi. Tailored from 100% breathable organic Egyptian cotton, designed specifically for Dhaka's climate. Hand-embroidered mandarin collar, contrast buttons, and side pockets. Delivered right to your doorstep in Dhanmondi within 2-4 hours.",
            images: [
                "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&q=80",
                "https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?w=800&q=80"
            ],
            is_featured: 1,
            is_trending: 1,
            reviews: [
                { id: 1, customer_name: "Fahim Morshed", rating: 5, comment: "Super fast delivery to Dhanmondi Road 4. The fabric is 10/10 quality! Definitely ordering again." },
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
                "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=800&q=80"
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
                "https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&q=80"
            ],
            is_featured: 1,
            is_trending: 0,
            reviews: []
        },
        {
            id: 4,
            name: "Dhanmondi Blossom Designer Georgette 3-Piece",
            slug: "dhanmondi-blossom-georgette-3piece",
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
                "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800&q=80"
            ],
            is_featured: 1,
            is_trending: 1,
            reviews: [
                { id: 4, customer_name: "Sadia Rahman", rating: 5, comment: "Wore this to a family dawat in Dhanmondi, got so many compliments. Beautiful embroidery work." }
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
                "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&q=80"
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
            description: "Relive the nostalgic beauty of sudden monsoon rain in Dhanmondi lake. Poured by hand into reusable amber glass jars using unbleached cotton wicks.",
            images: [
                "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b8?w=800&q=80"
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
                "https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=800&q=80"
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
                "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800&q=80"
            ],
            is_featured: 0,
            is_trending: 0,
            reviews: []
        }
    ],
    customers: [
        { id: 1, name: "Tanvir Ahmed", email: "tanvir.dhk@example.com", phone: "01711223344", address: "House 14, Road 8, Dhanmondi", area: "Dhanmondi", city: "Dhaka", total_orders: 1, total_spent: 2410.0 },
        { id: 2, name: "Nusrat Jahan", email: "nusrat.j@example.com", phone: "01822334455", address: "Apt 4B, Concord Tower, Dhanmondi 27", area: "Dhanmondi", city: "Dhaka", total_orders: 1, total_spent: 3345.0 },
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
            delivery_address: "House 14, Road 8, Dhanmondi, Dhaka",
            delivery_area: "Dhanmondi",
            delivery_fee: 60.0,
            subtotal: 2350.0,
            discount: 0.0,
            total: 2410.0,
            payment_method: "bKash",
            payment_status: "Paid",
            trx_id: "BKASH9823471",
            order_status: "Processing",
            tracking_code: "TRK-WC-7721",
            notes: "Deliver after 4 PM at Dhanmondi Lake.",
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
            delivery_address: "Apt 4B, Concord Tower, Dhanmondi 27",
            delivery_area: "Dhanmondi",
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
                { product_id: 4, product_name: "Dhanmondi Blossom Designer Georgette 3-Piece", price: 3650.0, quantity: 1, total: 3650.0 }
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
        { id: 1, code: "DHANMONDI10", type: "percentage", value: 10, min_order: 1000, max_discount: 500, expiry_date: "2028-12-31", usage_limit: 500, times_used: 42, is_active: 1 },
        { id: 2, code: "WONDERFUL100", type: "fixed", value: 100, min_order: 1500, max_discount: 100, expiry_date: "2028-12-31", usage_limit: 200, times_used: 19, is_active: 1 },
        { id: 3, code: "EIDSPECIAL", type: "percentage", value: 15, min_order: 2500, max_discount: 750, expiry_date: "2028-12-31", usage_limit: 300, times_used: 8, is_active: 1 }
    ]
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

function saveStore() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
    } catch (e) {
        console.error('Save error:', e);
    }
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
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        return res.end();
    }

    const parsedUrl = url.parse(req.url, true);
    let pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    const readBody = () => new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                resolve({});
            }
        });
    });

    const sendJson = (data, code = 200) => {
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data, null, 2));
    };

    // Normalize API paths (supports both /api/products and /api/products.php)
    const apiRoute = pathname.replace(/\.php$/, '');

    // --- API ROUTES ---
    if (apiRoute.startsWith('/api/')) {
        const body = await readBody();

        // 1. PRODUCTS
        if (apiRoute === '/api/products') {
            if (req.method === 'GET') {
                if (query.id) {
                    const product = store.products.find(p => p.id == query.id);
                    if (!product) return sendJson({ error: 'Product not found' }, 404);
                    return sendJson({ status: 'success', data: product });
                }
                let list = [...store.products];
                if (query.category) {
                    list = list.filter(p => p.category_slug === query.category || p.category_id == query.category);
                }
                if (query.featured) list = list.filter(p => p.is_featured);
                if (query.trending) list = list.filter(p => p.is_trending);
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
                const cat = store.categories.find(c => c.id == body.category_id) || store.categories[0];
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
                    images: Array.isArray(body.images) ? body.images : [body.images || "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=800&q=80"],
                    is_featured: body.is_featured ? 1 : 0,
                    is_trending: body.is_trending ? 1 : 0,
                    reviews: []
                };
                store.products.unshift(newProduct);
                cat.product_count = (cat.product_count || 0) + 1;
                saveStore();
                return sendJson({ status: 'success', message: 'Product created', id: newProduct.id }, 201);
            }

            if (req.method === 'PUT') {
                const idx = store.products.findIndex(p => p.id == body.id);
                if (idx === -1) return sendJson({ error: 'Product not found' }, 404);
                store.products[idx] = { ...store.products[idx], ...body };
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
                return sendJson({ status: 'success', data: store.categories });
            }
            if (req.method === 'POST') {
                const newCat = {
                    id: Date.now(),
                    name: body.name,
                    slug: body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    description: body.description || '',
                    image: body.image || 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&q=80',
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
                    const userOrders = store.orders.filter(o => o.customer_id == query.customer_id);
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
                const orderNum = 'WC-' + Math.floor(Math.random() * 90000 + 10000);
                const trkCode = 'TRK-WC-' + Math.floor(Math.random() * 9000 + 1000);
                const subtotal = parseFloat(body.subtotal || 0);
                const discount = parseFloat(body.discount || 0);
                const deliveryFee = parseFloat(body.delivery_fee || 80);
                const total = Math.max(0, subtotal - discount + deliveryFee);

                const newOrder = {
                    id: Date.now(),
                    order_number: orderNum,
                    customer_id: body.customer_id || null,
                    customer_name: body.customer_name,
                    customer_phone: body.customer_phone,
                    customer_email: body.customer_email || '',
                    delivery_address: body.delivery_address,
                    delivery_area: body.delivery_area || 'Inside Dhaka',
                    delivery_fee: deliveryFee,
                    subtotal: subtotal,
                    discount: discount,
                    total: total,
                    payment_method: body.payment_method || 'Cash on Delivery',
                    payment_status: (body.trx_id || body.payment_method === 'bKash' || body.payment_method === 'Nagad') ? 'Pending Verification' : 'Pending',
                    trx_id: body.trx_id || null,
                    order_status: 'Pending',
                    tracking_code: trkCode,
                    notes: body.notes || '',
                    created_at: new Date().toISOString(),
                    items: body.items || []
                };

                // Deduct stock
                if (Array.isArray(body.items)) {
                    for (const it of body.items) {
                        const prod = store.products.find(p => p.id == it.product_id);
                        if (prod) {
                            prod.stock_quantity = Math.max(0, prod.stock_quantity - (it.quantity || 1));
                        }
                    }
                }

                store.orders.unshift(newOrder);
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
                return sendJson({ status: 'success', count: store.customers.length, data: store.customers });
            }
        }

        // 5. COUPONS
        if (apiRoute === '/api/coupons') {
            if (req.method === 'GET') {
                return sendJson({ status: 'success', data: store.coupons });
            }
            if (req.method === 'POST') {
                if (body.action === 'validate') {
                    const code = (body.code || '').toUpperCase().trim();
                    const subtotal = parseFloat(body.subtotal || 0);
                    const c = store.coupons.find(cp => cp.code.toUpperCase() === code && cp.is_active);
                    if (!c) return sendJson({ error: 'Invalid coupon code' }, 404);
                    if (subtotal < c.min_order) {
                        return sendJson({ error: `Minimum order for this coupon is ৳${c.min_order}` }, 400);
                    }
                    let disc = c.type === 'percentage' ? (subtotal * c.value) / 100 : c.value;
                    if (c.max_discount && disc > c.max_discount) disc = c.max_discount;
                    return sendJson({ status: 'success', message: 'Coupon applied', data: { code: c.code, discount: disc, type: c.type, value: c.value } });
                }

                const newCoupon = {
                    id: Date.now(),
                    code: body.code.toUpperCase().trim(),
                    type: body.type || 'percentage',
                    value: parseFloat(body.value),
                    min_order: parseFloat(body.min_order || 0),
                    max_discount: body.max_discount ? parseFloat(body.max_discount) : null,
                    expiry_date: body.expiry_date || '2028-12-31',
                    usage_limit: parseInt(body.usage_limit || 100),
                    times_used: 0,
                    is_active: 1
                };
                store.coupons.unshift(newCoupon);
                saveStore();
                return sendJson({ status: 'success', message: 'Coupon created', id: newCoupon.id }, 201);
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
                if (body.action === 'adjust') {
                    prod.stock_quantity = Math.max(0, prod.stock_quantity + parseInt(body.delta || 0));
                } else if (body.stock_quantity !== undefined) {
                    prod.stock_quantity = Math.max(0, parseInt(body.stock_quantity));
                }
                saveStore();
                return sendJson({ status: 'success', message: 'Stock updated', data: { id: prod.id, name: prod.name, stock_quantity: prod.stock_quantity } });
            }
        }

        // 7. REPORTS
        if (apiRoute === '/api/reports') {
            const grossRev = store.orders.reduce((acc, o) => acc + o.total, 0);
            const totalDisc = store.orders.reduce((acc, o) => acc + o.discount, 0);
            const aov = store.orders.length ? grossRev / store.orders.length : 0;
            const lowStock = store.products.filter(p => p.stock_quantity <= 5).length;

            const statusMap = {};
            store.orders.forEach(o => {
                if (!statusMap[o.order_status]) statusMap[o.order_status] = { count: 0, revenue: 0 };
                statusMap[o.order_status].count++;
                statusMap[o.order_status].revenue += o.total;
            });
            const statusBreakdown = Object.keys(statusMap).map(k => ({ order_status: k, count: statusMap[k].count, revenue: statusMap[k].revenue }));

            return sendJson({
                status: 'success',
                data: {
                    overview: {
                        gross_revenue: grossRev,
                        total_orders: store.orders.length,
                        average_order_value: Math.round(aov),
                        total_discounts: totalDisc,
                        total_customers: store.customers.length,
                        low_stock_alerts: lowStock
                    },
                    status_breakdown: statusBreakdown,
                    top_products: store.products.slice(0, 5).map(p => ({ product_id: p.id, product_name: p.name, total_units_sold: 15, total_revenue: (p.sale_price || p.regular_price) * 15 })),
                    recent_orders: store.orders.slice(0, 6)
                }
            });
        }

        // 8. SETTINGS
        if (apiRoute === '/api/settings') {
            if (req.method === 'GET') {
                return sendJson({ status: 'success', data: store.settings });
            }
            if (req.method === 'POST' || req.method === 'PUT') {
                store.settings = { ...store.settings, ...body };
                saveStore();
                return sendJson({ status: 'success', message: 'Settings saved' });
            }
        }

        // 9. AUTH
        if (apiRoute === '/api/auth') {
            const action = query.action || body.action || 'login';
            if (action === 'admin_login') {
                if (body.username === 'admin' && (body.password === 'admin123' || body.password === 'admin')) {
                    return sendJson({
                        status: 'success',
                        message: 'Admin authorized',
                        data: { token: 'wc_adm_' + Math.random().toString(36).substring(2), username: 'admin', full_name: 'Wonderful Store Manager', role: 'Super Admin' }
                    });
                }
                return sendJson({ error: 'Invalid admin credentials. Use admin / admin123' }, 401);
            }

            if (action === 'register') {
                const newCust = {
                    id: Date.now(),
                    name: body.name,
                    email: body.email,
                    phone: body.phone,
                    address: body.address || 'Dhanmondi',
                    area: body.area || 'Dhanmondi',
                    city: 'Dhaka',
                    total_orders: 0,
                    total_spent: 0
                };
                store.customers.push(newCust);
                saveStore();
                return sendJson({ status: 'success', message: 'Registered successfully', data: { ...newCust, token: 'wc_usr_' + Date.now() } }, 201);
            }

            // Customer login
            const cust = store.customers.find(c => c.email === body.email);
            if (cust) {
                return sendJson({ status: 'success', message: 'Welcome back ' + cust.name, data: { ...cust, token: 'wc_usr_' + Date.now() } });
            }
            return sendJson({ error: 'Customer not found. You can register in seconds!' }, 404);
        }

        // 10. TRACK
        if (apiRoute === '/api/track') {
            const term = (query.order || query.tracking_code || '').trim().toLowerCase();
            const order = store.orders.find(o => o.order_number.toLowerCase() === term || o.tracking_code.toLowerCase() === term);
            if (!order) return sendJson({ error: 'No order found with code: ' + term }, 404);

            const status = order.order_status;
            const timeline = [
                { title: 'Order Placed', desc: 'Order received and logged in system', time: order.created_at, completed: true },
                { title: 'Order Confirmed', desc: 'Verified by Wonderful Collection Dhanmondi Hub', time: ['Processing', 'Shipped', 'Delivered'].includes(status) ? 'Confirmed' : 'Pending', completed: ['Processing', 'Shipped', 'Delivered'].includes(status) },
                { title: 'Packed & Quality Checked', desc: 'Securely packed with warranty and receipt', time: ['Processing', 'Shipped', 'Delivered'].includes(status) ? 'Passed QA' : 'Pending', completed: ['Processing', 'Shipped', 'Delivered'].includes(status) },
                { title: 'Dispatched from Dhanmondi Hub', desc: `Handed over to delivery rider for ${order.delivery_area}`, time: ['Shipped', 'Delivered'].includes(status) ? 'In Transit' : 'Pending', completed: ['Shipped', 'Delivered'].includes(status) },
                { title: 'Delivered to Customer', desc: `Delivered at ${order.delivery_address}`, time: status === 'Delivered' ? 'Delivered' : 'Estimated 2-4 hrs for Dhanmondi / 24 hrs Dhaka', completed: status === 'Delivered' }
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
        if (err || !stats.isFile()) {
            // Check custom 404
            const notFoundPage = path.join(WEB_DIR, '404.html');
            if (fs.existsSync(notFoundPage)) {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                return fs.createReadStream(notFoundPage).pipe(res);
            }
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('404 Not Found');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🛍️  Wonderful Collection Web & API Server Running!`);
    console.log(`📍  Store: Dhanmondi, Dhaka, Bangladesh`);
    console.log(`🌐  Local URL: http://localhost:${PORT}`);
    console.log(`📱  Admin Panel Web View: http://localhost:${PORT}/admin.html`);
    console.log(`📦  Tracking: http://localhost:${PORT}/track-order.html`);
    console.log(`🔌  REST API: http://localhost:${PORT}/api/products`);
    console.log(`=======================================================`);
});
