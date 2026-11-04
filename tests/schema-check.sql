-- Run this read-only schema check after selecting the staging/live database.
-- It reports missing API tables/columns, missing unique indexes, duplicate
-- mobile-payment references that would block the index, and the order-item FK rule.

CREATE TEMPORARY TABLE wc_expected_api_columns (
  table_name VARCHAR(64) NOT NULL,
  column_name VARCHAR(64) NOT NULL,
  PRIMARY KEY (table_name, column_name)
) ENGINE=MEMORY;

INSERT INTO wc_expected_api_columns (table_name, column_name) VALUES
('settings','id'),('settings','key_name'),('settings','value_data'),('settings','updated_at'),
('categories','id'),('categories','name'),('categories','slug'),('categories','description'),('categories','image'),('categories','is_archived'),('categories','created_at'),
('products','id'),('products','name'),('products','slug'),('products','category_id'),('products','regular_price'),('products','sale_price'),('products','stock_quantity'),('products','sku'),('products','short_desc'),('products','description'),('products','images'),('products','is_featured'),('products','is_trending'),('products','is_archived'),('products','created_at'),
('customers','id'),('customers','name'),('customers','email'),('customers','phone'),('customers','password_hash'),('customers','address'),('customers','area'),('customers','city'),('customers','created_at'),
('customer_tokens','id'),('customer_tokens','token_hash'),('customer_tokens','customer_id'),('customer_tokens','expires_at'),('customer_tokens','created_at'),
('customer_email_verifications','customer_id'),('customer_email_verifications','token_hash'),('customer_email_verifications','expires_at'),('customer_email_verifications','verified_at'),('customer_email_verifications','created_at'),
('password_reset_tokens','id'),('password_reset_tokens','customer_id'),('password_reset_tokens','token_hash'),('password_reset_tokens','expires_at'),('password_reset_tokens','created_at'),
('admins','id'),('admins','username'),('admins','password_hash'),('admins','full_name'),('admins','role'),('admins','password_change_required'),('admins','last_totp_counter'),('admins','created_at'),
('admin_tokens','id'),('admin_tokens','token_hash'),('admin_tokens','admin_id'),('admin_tokens','expires_at'),('admin_tokens','created_at'),
('login_attempts','username_hash'),('login_attempts','ip_hash'),('login_attempts','attempt_count'),('login_attempts','window_started_at'),('login_attempts','locked_until'),
('orders','id'),('orders','order_number'),('orders','customer_id'),('orders','customer_name'),('orders','customer_phone'),('orders','customer_email'),('orders','delivery_address'),('orders','delivery_area'),('orders','delivery_zone'),('orders','delivery_fee'),('orders','subtotal'),('orders','discount'),('orders','total'),('orders','payment_method'),('orders','payment_status'),('orders','trx_id'),('orders','order_status'),('orders','tracking_code'),('orders','idempotency_key'),('orders','notes'),('orders','created_at'),
('order_items','id'),('order_items','order_id'),('order_items','product_id'),('order_items','product_name'),('order_items','price'),('order_items','quantity'),('order_items','total'),
('coupons','id'),('coupons','code'),('coupons','type'),('coupons','value'),('coupons','min_order'),('coupons','max_discount'),('coupons','expiry_date'),('coupons','usage_limit'),('coupons','times_used'),('coupons','is_active'),('coupons','created_at'),
('reviews','id'),('reviews','product_id'),('reviews','customer_name'),('reviews','rating'),('reviews','comment'),('reviews','created_at'),
('accounts','id'),('accounts','name'),('accounts','type'),('accounts','balance'),('accounts','created_at'),
('transactions','id'),('transactions','account_id'),('transactions','type'),('transactions','amount'),('transactions','category'),('transactions','notes'),('transactions','created_by'),('transactions','created_at'),
('employee_salaries','id'),('employee_salaries','employee_name'),('employee_salaries','designation'),('employee_salaries','base_salary'),('employee_salaries','advance_paid'),('employee_salaries','deductions'),('employee_salaries','net_paid'),('employee_salaries','month'),('employee_salaries','created_at'),
('office_sales','id'),('office_sales','invoice_number'),('office_sales','customer_name'),('office_sales','customer_phone'),('office_sales','subtotal'),('office_sales','discount'),('office_sales','total'),('office_sales','paid'),('office_sales','due'),('office_sales','payment_method'),('office_sales','created_at'),
('suppliers','id'),('suppliers','name'),('suppliers','contact_person'),('suppliers','phone'),('suppliers','email'),('suppliers','address'),('suppliers','created_at'),
('cms_pages','id'),('cms_pages','slug'),('cms_pages','title'),('cms_pages','content'),('cms_pages','meta_title'),('cms_pages','meta_description'),('cms_pages','created_at'),('cms_pages','updated_at'),
('error_logs','id'),('error_logs','type'),('error_logs','message'),('error_logs','file'),('error_logs','line'),('error_logs','created_at'),
('audit_logs','id'),('audit_logs','admin_id'),('audit_logs','action'),('audit_logs','entity_type'),('audit_logs','entity_id'),('audit_logs','old_values'),('audit_logs','new_values'),('audit_logs','ip_address'),('audit_logs','created_at'),
('courier_parcels','id'),('courier_parcels','order_id'),('courier_parcels','courier_name'),('courier_parcels','tracking_code'),('courier_parcels','cod_amount'),('courier_parcels','status'),('courier_parcels','created_at'),('courier_parcels','updated_at');

-- Result set 1: every missing table/column. An empty result means all listed API schema exists.
SELECT e.table_name, e.column_name AS missing_column
FROM wc_expected_api_columns e
LEFT JOIN information_schema.COLUMNS c
  ON c.TABLE_SCHEMA = DATABASE()
  AND c.TABLE_NAME = e.table_name
  AND c.COLUMN_NAME = e.column_name
WHERE c.COLUMN_NAME IS NULL
ORDER BY e.table_name, e.column_name;

-- Result set 2: inspect unique indexes needed for transaction-reference and retry protection.
SELECT INDEX_NAME,
       GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS indexed_columns,
       MAX(NON_UNIQUE) AS non_unique
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'orders'
  AND NON_UNIQUE = 0
  AND COLUMN_NAME IN ('payment_method', 'trx_id', 'idempotency_key')
GROUP BY INDEX_NAME
ORDER BY INDEX_NAME;

-- Result set 3: duplicates must be reviewed before adding the TrxID unique index.
SELECT payment_method, trx_id, COUNT(*) AS duplicate_count
FROM orders
WHERE trx_id IS NOT NULL AND TRIM(trx_id) <> ''
GROUP BY payment_method, trx_id
HAVING COUNT(*) > 1;

-- Result set 4: preserve order history by keeping the product FK delete rule SET NULL.
SELECT kcu.CONSTRAINT_NAME, rc.DELETE_RULE
FROM information_schema.KEY_COLUMN_USAGE kcu
JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
  ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
  AND rc.TABLE_NAME = kcu.TABLE_NAME
  AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
WHERE kcu.TABLE_SCHEMA = DATABASE()
  AND kcu.TABLE_NAME = 'order_items'
  AND kcu.COLUMN_NAME = 'product_id'
  AND kcu.REFERENCED_TABLE_NAME = 'products';

DROP TEMPORARY TABLE wc_expected_api_columns;
