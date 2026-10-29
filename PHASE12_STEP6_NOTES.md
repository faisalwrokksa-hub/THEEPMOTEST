# Phase 12 — next increment: catalogue licensing consistency

The `GET /api/v1/platform/modules` catalogue now reports commercial modules as enabled only if their tenant module entitlement is enabled and unexpired **and** the latest tenant subscription is active within its period or trialing before its trial end. Core modules remain available. This aligns the catalogue with the existing `enabled` endpoint and API module guard.

Verification: `node --test scripts/verify-subscription-catalogue.mjs packages/db/src/subscription-lifecycle.test.mjs` (14 passed). Static source checks are not substitutes for live database/API integration tests.

Still required: full vendor Super Admin management, verified payment callbacks and renewals, full route licensing audit, tenant-isolation integration tests, database migration execution, full dependency-backed TypeScript build, and end-to-end deployment checks. This package is not production-ready.
