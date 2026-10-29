# The EPMO — Phase 14A: creation-flow reference validation

## Scope

A source-level QA/hardening increment based on Phase 13F. No database schema or migration change.

- RAID item creation: verify that the project is visible to the authenticated tenant and that an explicitly specified owner belongs to the tenant, before insertion.
- Task creation: verify the project and any explicitly selected assignee before insertion.
- Benefit and document creation: verify explicitly selected owner membership before insertion, in addition to existing optional project validation.
- Update posting: verify any supplied project belongs to the tenant before insertion. Global/project-independent updates remain allowed as before.
- Reuse a tenant-scoped `memberships` lookup, **not** the global `users` table, when validating assigned people.

Existing permissions, RLS, feature-license guards, audit writes, and form contracts are unchanged. The checks take place inside `withTenant` PostgreSQL transactions.

## Verified offline

- `node --experimental-strip-types --test apps/api/src/platform/*.test.mjs apps/api/src/onboarding/*.test.mjs apps/api/src/creates/*.test.mjs apps/web/src/lib/*.test.mjs packages/db/src/*.test.mjs scripts/*.test.mjs tests/*.test.mjs` — 334/334 passed (12 new source-level regression checks).
- `node scripts/verify-release-static.mjs` — 8/8 groups passed.
- `node scripts/verify-migration-chain.mjs` — 17 SQL migrations verified.
- TypeScript parser — changed `creates.service.ts` has no syntax diagnostics.

## Not verified

Full dependency-backed TypeScript build; live PostgreSQL RLS / service integration; deployed browser accessibility; Stripe test-mode payments; SES invitation delivery; real staging deployment. The automated source-level tests confirm that guards exist in the relevant code paths, not that a live database has enforced them. **Not production-ready.**

## Follow-up

On staging, use two real tenant accounts and verify cross-tenant project references and user assignments yield 404, never create dependent records or audit entries, and legitimate same-tenant writes remain successful. Revisit remaining create/edit/import surfaces as part of Phase 14.
