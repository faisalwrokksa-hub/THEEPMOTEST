# Phase 12 Milestone 2D — Step 3

## Implemented
- `packages/db/migrations/0012_subscription_event_tenant_integrity.sql`: audit event's tenant must match the referenced subscription's tenant. Migration stops if preexisting invalid data exists.
- `scripts/verify-subscription-integrity.mjs`: six dependency-free static assertions for the guard and migration.

## Verified in this session
- Subscription integrity static checks: 6/6 passed.
- Subscription lifecycle Node tests: 11/11 passed.
- Existing release static checks: 8/8 groups passed.

## Not verified
- PostgreSQL migration execution and data compatibility.
- API integration, multi-tenant RLS behavior, TypeScript build, browser workflows, payment integration.

## Deployment note
Run this migration against a backed-up staging database first. Resolve any existing mismatched audit events before retrying. Do not run destructive data corrections automatically.
