# The EPMO — Checkpoint 25 P0 Commercial Launch Hardening

## Scope and provenance
Based on Checkpoint 24 M6 audited source ZIP. Preserves cumulative M2–M5 application source. No production database or paid service accessed. This is NOT a production-certified release.

## Changes
- Added `scripts/verify-staging-config.mjs`, a fail-closed read-only staging configuration validation tool. It checks deployment environment, loopback binding, HTTPS public origins, distinct origins, non-placeholder PostgreSQL/Redis credentials, Stripe live-key exclusion, and reference-webhook restrictions. It never outputs secrets.
- Added seven offline tests in `scripts/verify-staging-config.test.mjs` covering accepted configuration and unsafe alternatives.
- Added `verify:staging-config` package script and included new tests in the offline test script.
- No existing migration files, business APIs, RLS policies, or customer data were modified.

## Executed verification
| Check | Result | Scope |
|---|---|---|
| Offline regression | PASS 817/817 | Node test runner (includes 7 new tests) |
| Static release | PASS | Existing repository static script |
| Migration integrity | PASS | Ordered migration chain and pinned SHA-256 checks only |
| Pinned package manager | BLOCKED | `corepack pnpm --version` unable to fetch pnpm@10.17.0: DNS EAI_AGAIN registry.npmjs.org |
| Dependency install / build / typecheck | NOT RUN | Cannot install pinned pnpm/packages, so no valid compiler evidence |
| Runtime preflight | BLOCKED 1/5 | Missing pnpm, node_modules, DATABASE_URL, WEB_ORIGIN |
| Staging configuration | BLOCKED | `.env.staging` absent; example file alone is not valid deployment configuration |
| Live PostgreSQL + RLS | NOT RUN | No database service or credentials provided |
| Docker staging & browser / API checks | NOT RUN | Docker unavailable; no deployed service or credentials |
| Stripe and Microsoft live integrations | NOT RUN | Provider accounts/configuration unavailable |
| Recovery rehearsal | NOT RUN | No backup or isolated restore environment |

## P0 blocker decisions
1. **P0-01 BLOCKED:** Install pinned pnpm@10.17.0 in networked isolated CI; `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build`, verify artifacts and Docker images.
2. **P0-02 BLOCKED:** Create disposable PostgreSQL environment, run SQL migrations and seeded negative tenant/role RLS tests; record logs and rollback evidence.
3. **P0-03 BLOCKED:** Stripe test-mode checkout, webhook replay/idempotency, cancellation, and entitlement lifecycle.
4. **P0-04 BLOCKED:** Per-user Microsoft OAuth/permissions provider testing; keep legacy shared-token embedding disabled.
5. **P0-05 BLOCKED:** Encrypted offsite backup and disposable restore rehearsal with measured RPO/RTO.
6. **P0-06 BLOCKED:** Provision staging secret store and TLS origin; run `pnpm verify:staging-config`, approved web/API smoke, security and Arabic RTL browser tests.

## Release decision
**NO-GO for accepting paying customers.** The offline evidence is necessary but not sufficient. Do not enable shared Microsoft token embedding or treat source-level migrations as proof of live RLS.

## Suggested next step
Run the existing GitHub Actions CI on a trusted runner with locked dependencies and ephemeral PostgreSQL. Supply actual runtime evidence without sharing secret values. Continue only after build/typecheck and RLS checks pass.
