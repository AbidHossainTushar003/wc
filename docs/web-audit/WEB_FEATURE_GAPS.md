# Wonderful Collection web feature gaps

This list distinguishes what the storefront can represent from work that still
needs implementation, owner input, or host verification.

## Customer storefront

- **Catalog readiness:** product names, categories, prices, stock, and
  owner-approved product photos must be reviewed and maintained. Fallback
  artwork supports missing images but is not production catalog content.
- **Search and browsing:** verify empty, error, and stale-data behavior against
  the real catalog and database; this local report used only fake test records.
- **Checkout:** production order confirmation, retry/idempotency behavior, and
  stock/coupon restoration require staging validation against the actual schema.
- **Delivery estimates:** estimates and zone selection should remain accurate
  and clearly labeled; a browser location result is not proof of address or
  serviceability.
- **Payments:** bKash/Nagad/Rocket/COD instructions are not a payment-gateway
  integration. Staff must verify transfers and record their outcome.
- **Customer communications:** registration/reset/contact email delivery and
  order notifications need verified provider configuration and delivery tests.
- **Returns/refunds:** the published policy needs an operational case, approval,
  and refund-recording process if the stated promises are to be fulfilled.

## Web administration

- **Authentication setup:** each production administrator needs a working
  authenticator and a safe recovery procedure; the local MFA test does not
  enroll production users.
- **Authorization:** confirm route permissions match administrator roles before
  adding staff roles or sharing accounts.
- **Auditability:** check the deployment schema and retention policy for audit
  events, error records, and admin changes.
- **Operational modules:** validate account, sales, supplier, CMS, courier, and
  reporting workflows against a restored staging database, including export and
  error states.

## Hosting and operations

- **Server configuration:** verify real HTTPS redirect, protected paths,
  rewrite rules, security headers, cache policy, PHP extensions, and file
  permissions on the target host.
- **Database:** verify the final schema and additive migrations on a backup-
  restored staging copy before further production schema changes.
- **Monitoring/backups:** configure offsite backup scheduling, restore drills,
  and actionable alerting for PHP/API failures.
- **Performance/privacy:** measure real mobile Core Web Vitals and review
  consent/CSP behavior after deployment; local viewport checks do not measure
  production network latency.
