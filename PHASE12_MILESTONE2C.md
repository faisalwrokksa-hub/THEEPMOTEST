# Phase 12 Milestone 2C — API guard enforcement

The NestJS `ModuleGuard` now reads the latest tenant subscription inside `withTenant` and denies commercial module requests when the subscription is missing, inactive, expired, not yet started, or past trial end. Existing module enablement and expiry checks remain in place. `core360` is intentionally exempt to allow recovery and administrative access.

**Migration prerequisite:** Apply `packages/db/migrations/0011_commercial_subscriptions.sql` before deploying the updated API. Existing tenants need explicit subscriptions or commercial module requests will be denied. Verify the chosen subscription precedence and payment state before production; no payment processing or automatic renewal is implemented.

**Validation limitation:** Source patch and archive integrity checked; full TypeScript build, database integration and API integration tests are not verified. This is a fail-closed preliminary implementation, not production certification.
