# Wonderful Collection web audit

## Summary

The local storefront and web-admin usability issues addressed in this pass
include a placeholder-heavy homepage hero, unsupported promotional/delivery
wording, weak catalog empty states, missing checkout label associations,
missing authenticator-code input in the web-admin login form, and fabricated
fallback order details. The local browser and isolated API checks recorded in
[`WEB_BEHAVIOR_REPORT.md`](./WEB_BEHAVIOR_REPORT.md) passed for those bounded
flows.

This is not a production sign-off. Production deployment, live host rules,
mail delivery, and physical-device behavior were not verified in this pass.

## Findings and follow-up

| Priority | Finding | Status / next action |
|---|---|---|
| High | Production catalog and imagery require owner review; local fallback artwork is not a substitute for approved product names, stock, and photos. | Owner must verify the live catalog and upload site-hosted images before relying on the storefront. |
| High | Transactional mail delivery is not verified. | Configure a verified sender/provider and test registration, reset, and contact flows using a test inbox. |
| High | Real host behavior is outside local PHP-router testing. | Verify HTTPS redirect, `.htaccess` protections, security headers, API rewrite, and cache behavior on staging/production. |
| Medium | The published return/refund promises may exceed the application's recorded workflow. | Confirm the business process and align policy text or implement an auditable return/refund workflow. |
| Medium | External fonts and optional geocoding depend on third-party availability and CSP/network policy. | Test with production CSP and decide whether to self-host fonts or retain the dependency. |
| Medium | Inline scripts/styles constrain a strict Content Security Policy. | Consider a planned migration to external scripts/styles or CSP nonces/hashes; do not loosen host policy without review. |
| Medium | Visual checks do not establish accessibility with assistive technology or physical devices. | Complete keyboard, screen-reader, zoom, and real-device checks before release. |

## Controls observed in source/local tests

- Admin authentication requires the configured second factor and server-side
  bearer-token validation for protected routes.
- Checkout validates catalog price and available stock on the server.
- Missing order details lead to a recovery state instead of fabricated
  confirmation information.
- Public catalog empty states and loading states have user-facing text.

## Release boundary

The local test server's simulated rewrite and deny behavior is not equivalent to
Apache/LiteSpeed. Do not treat this report as evidence of deployment, production
security, or successful real email/payment processing.
