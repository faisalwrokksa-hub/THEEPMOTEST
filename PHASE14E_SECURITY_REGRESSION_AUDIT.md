# Phase 14E — Security Regression & Audit Integrity

## Scope

Source baseline: Phase 14D data-consistency/recovery archive. No new SQL migration.

### 1. Separate tenant billing from vendor-wide platform administration

Previously, the customer-facing billing page and tenant-scoped billing/renewal API methods required `pmoa_platform`, a vendor-only capability. As a result, ordinary workspace administrators could not manage their own subscription even though the application offered self-service controls.

Now tenant billing **reads and writes** (invoice listing, payment listing, reconciliation, invoice issuance, Stripe Checkout initiation, subscription history/events, cancellation/resumption) require `pmoa_admin`. The browser billing page, onboarding trial guidance, and navigation use the same capability.

**Important authorization boundary:** Vendor-wide subscription/plan CRUD and platform module controls **still** require `pmoa_platform`; the vendor flag is revalidated against the global user record by `SuperAdminService`. Tenant services continue to derive the tenant from the authenticated request and run database queries inside `withTenant` transactions. This change does not enable customer administrators to manage other customers' plans or subscriptions.

### 2. Audit-event accuracy / replay resilience

- Repeated `cancelAtPeriodEnd`/`resume` calls that request the already-stored preference now return `unchanged: true` without an UPDATE or duplicate `subscription_events` row.
- Repeated workspace member role/status updates similarly avoid a database rewrite or duplicate `audit_events` row. Real changes log before/after values rather than dumping the entire request body. The existing active-owner protection, advisory lock, and tenant scope remain.

### 3. Governance readiness validation

The `gates/:id/readiness` endpoint now checks that the gate exists and is visible under tenant RLS before calculating blockers. Missing or other-tenant gate IDs return 404 rather than an erroneous `mayPass: true` response.

## Verification in this environment

- `node --experimental-strip-types --test apps/api/src/platform/*.test.mjs apps/api/src/onboarding/*.test.mjs apps/api/src/creates/*.test.mjs apps/web/src/lib/*.test.mjs packages/db/src/*.test.mjs scripts/*.test.mjs tests/*.test.mjs`: **408/408 passed**, including **9 new Phase 14E source regression checks**.
- `node scripts/verify-release-static.mjs`: **8/8 passed**.
- `node scripts/verify-migration-chain.mjs`: **18 SQL migrations consistent** with journal.
- Changed TypeScript syntax inspected using Node's type stripping; TSX syntax parsed using the installed TypeScript parser.

These are **source-level** security regression checks, not proof of tenant RLS on a real database or end-to-end authorization. CI must still run a dependency-backed TypeScript build, PostgreSQL-backed authorization/audit tests, Stripe test payments and browser acceptance tests before production. No staging system or payment provider was accessed during this milestone.

## Suggested live acceptance cases

1. Workspace owner or client_admin opens `/billing`, views only their tenant's invoices and can request renewal and change cancellation preference.
2. Workspace viewer receives HTTP 403 from cancellation, billing invoice and Stripe Checkout routes. Forged tenant/invoice IDs cannot access another tenant's billing.
3. Platform-admin-only endpoints still reject ordinary workspace admins; vendor-admin flag revocation takes effect on the next call.
4. Repeat a cancellation and membership change: exactly one corresponding audit entry is created; changed entries show before/after values.
5. Unknown and other-tenant stage gate IDs return HTTP 404 from readiness.
