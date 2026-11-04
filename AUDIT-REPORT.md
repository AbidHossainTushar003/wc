# Wonderful Collection storefront audit

**Date:** 2026-11-04  
**Production site:** https://wonderfulcollection.store

## Executive summary

Local storefront fixes and the owner-approved public contact/location updates are ready for deployment. No production files or records were changed: the live admin and cPanel sessions were signed out when checked. The public HTTP origin still does not redirect to HTTPS, and the live catalog still contains incomplete/test-like records and images that need owner-supplied product photos or details.

No live order, customer, payment, catalog edit, or coupon edit was created. Historical customer/order address data was not altered.

## Confirmed production findings

| Severity | Finding | Evidence / impact |
|---|---|---|
| High | Plain HTTP does not redirect to HTTPS. | HTTP and HTTPS both returned `200 OK`. SSL works, but the redirect rule is not taking effect at the edge/server and needs hosting/CDN follow-up. |
| Medium | Live navigation/category taxonomy does not describe the catalog. | Public APIs return six products and one category (`Electronic`); the catalog also contains fashion and generic entries. |
| Medium | Products 1–4 need owner review and replacement photos. | Products 1–3 have legacy Dhanmondi names/slugs and the shared placeholder image; product 4 is named `kid` and also uses the placeholder. The requested name/slug cleanup is authorized but has not been applied to production. |
| Medium | Product 5 (`sari`) is sold out and has unusable/externally hosted image entries. | Stock is `0`; its image list includes an Unsplash URL and a private Android `content://` URI. Upload a product image to the site and replace both entries. |
| Medium | Product 6 appears to contain test-like data. | Name `gshhs`, regular price `54,548`, sale price `9,996`, and 19 in stock. Its image files respond successfully, but the intended name, description, and pricing are unknown. |
| Medium | The legacy coupon is not redeemable through the public validator. | `DHANMONDI10` returned HTTP 404 for subtotal values 1,000 and 10,000. This does not reveal whether the live record is absent, inactive, expired, or usage-limited; authenticated admin access is needed to verify its stored status. The local fallback seed marks it inactive. |
| Unverified | Signed-in customer and successful-order journeys. | No test account or safe cleanup path was available. Login/profile/order history, payment confirmation, stock decrement, and a real tracking lookup were not exercised in production. |

## Product images to upload

Upload approved product photos and update the corresponding production product records:

- Products 1–3: replace the shared `assets/product-placeholder.svg`.
- Product 4 (`kid`): replace the shared placeholder after confirming the product identity.
- Product 5 (`sari`): replace both the Unsplash URL and Android `content://` URI with a site-hosted image.
- Product 6: keep its currently responding image files only if they match the confirmed product.

The local storefront falls back to its bundled placeholder for invalid device-local image URLs. Do not rely on third-party hotlinks for critical product imagery.

## Owner-confirmed local content changes

- Public contact, bKash, and Nagad number: `01560024777`.
- Rocket number: `015600247777` (owner confirmed the 12-digit number is intentional).
- Public display location: Dhaka, Bangladesh.
- Dhanmondi-specific delivery copy was replaced with neutral delivery wording. Inside/Outside Dhaka checkout options and rates remain unchanged.
- No old `01712345678` or `Wonderful@2026!` value was found in the searched source/data files.
- Public storefront content is neutralized; historical customer/order addresses and internal compatibility identifiers are intentionally preserved.

## Fixes made locally

- Render category navigation and shop filters from the categories API instead of hard-coded categories. A category page without a category opens the first live category, and invalid category links show a recovery link.
- Disable add-to-cart for sold-out products in product cards and product detail; enforce stock limits for cart additions/increments.
- Fall back from unusable device-local/data image URLs to the local product placeholder.
- Escape API/local-storage values in storefront product, cart, and checkout rendering, and validate dynamic product IDs before using them in links/actions.
- Show an error toast when catalog/product/category APIs fail instead of silently presenting an empty catalog.
- Make the cart and checkout layouts responsive; the five-column cart table scrolls within its card on narrow screens.
- Updated the approved contact/payment details and neutral delivery/location copy. Preserved the existing checkout shipping tiers and historical customer/order addresses.

## Verification

- `node --check` passed for `web/js/store.js` and `web/js/admin.js`.
- Inline-script syntax checks passed for all 23 root HTML pages.
- Browser check at a 375px viewport found no horizontal overflow on cart or checkout. An invalid `content://` cart image used the local placeholder; the stock-limited quantity control was disabled; the confirmed Rocket number and neutral delivery copy rendered.
- Earlier focused browser checks confirmed dynamic category navigation, sold-out UI, cart quantity capping, API error toasts, and escaped cart values.
- Production paths `/data.sqlite` and `/database.sql` returned 404; `/api/config.local.php` and `/assets/products/` returned 403.
- PHP CLI is unavailable here, so PHP lint was not run. No production order, customer, product, or payment was created.

## Remaining work / deployment status

- `deploy/wonderful-deploy.zip` was rebuilt from the latest `web/` files and the config template; the build script verified root-level `index.html`, `.htaccess`, and `api/config.local.php` and excluded SQL, SQLite, Markdown, Node/dev, and Android files.
- Production product names/slugs, image URLs, and coupon status remain unchanged until an authenticated session is available.
- The live admin page and cPanel both showed signed-out states. Sign in directly in the browser; do not send passwords or session URLs in chat.
- The HTTP-to-HTTPS redirect remains a hosting/CDN issue.
