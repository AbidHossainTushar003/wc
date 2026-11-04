# Product image uploads

The fresh production SQL schema starts with empty product, category, coupon, and review tables. Do not copy unverified catalog records or demo photos into a fresh deployment.

## Existing live catalog audit

These are image follow-ups for the current live records. Product IDs may change if the catalog is recreated from the empty production schema:

- Products 1–3 (`Dhanmondi Signature Collection #50/#13/#17`): upload approved photos to replace `assets/product-placeholder.svg`. The name/slug cleanup is separately authorized, but the live records have not yet been changed.
- Product 4 (`kid`): confirm the product identity, then upload its approved photo to replace the shared placeholder.
- Product 5 (`sari`): upload the real product photo and replace both the external Unsplash URL and the Android-only `content://` URI.
- Product 6 (`gshhs`): its existing image files respond successfully; keep them only if they match the confirmed product.

No product photo was invented or downloaded for this audit. Do not rely on third-party hotlinks for critical product imagery.

## Uploading approved images

The storefront includes local placeholders: `assets/product-placeholder.svg` and `assets/category-placeholder.svg`. Upload approved photos under `public_html/assets/products/` or `public_html/assets/categories/`, then set each product's `images` field to a JSON array of relative paths and each category's `image` field to its relative path.

Suggested naming pattern:

- Product gallery: `assets/products/<product-slug>-1.jpg`, `assets/products/<product-slug>-2.jpg`
- Category photo: `assets/categories/<category-slug>.jpg`

Upload only images for products and categories actually offered by the store.
