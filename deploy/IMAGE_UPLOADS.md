# Product image uploads

The production SQL intentionally starts with empty product, category, coupon, and review tables because no real catalog was provided. Therefore there are no product or category image filenames to enumerate yet, and no demo photos are bundled or hotlinked.

The storefront includes local placeholders: `assets/product-placeholder.svg` and `assets/category-placeholder.svg`. After adding the real catalog, upload the corresponding photos under `public_html/assets/products/` or `public_html/assets/categories/`, then set each product's `images` field to a JSON array of relative paths and each category's `image` field to its relative path.

Suggested naming pattern:

- Product gallery: `assets/products/<product-slug>-1.jpg`, `assets/products/<product-slug>-2.jpg`
- Category photo: `assets/categories/<category-slug>.jpg`

Upload only images for products and categories actually offered by the store.
