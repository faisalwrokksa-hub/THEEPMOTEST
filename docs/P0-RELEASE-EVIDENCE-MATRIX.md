# EPMO P0 release evidence matrix

Status: **NO-GO — evidence incomplete**. This document is an acceptance checklist, not proof that a test has passed. Never infer success from a queued, skipped, or incomplete workflow.

| Gate | Required evidence | Acceptance criterion | Evidence owner | Status |
| --- | --- | --- | --- | --- |
| P0-01 Dependency security | Current commit's frozen-lockfile installation, `pnpm audit --audit-level high`, SBOM/lockfile diff, compatibility tests | No unresolved critical/high advisories; no audit bypass; tested dependency graph committed | Engineering/Security | BLOCKED |
| P0-02 CI and production build | GitHub Actions verify job: typecheck, API/web production builds, Docker builds, smoke and integration test reports | All required steps green on same candidate commit, including no unexpected skipped tests | Engineering | PENDING |
| P0-03 Database isolation | Executed PostgreSQL migrations, RLS policy tests, tenant-crossing negative tests | All checks pass against real test PostgreSQL; no cross-tenant reads/writes | Backend/Security | PENDING CURRENT-RUN EVIDENCE |
| P0-04 Microsoft per-user auth | Entra test app configuration, user-specific OAuth flow, consent/revoke/refresh, negative tests for tenant and user boundaries | No legacy shared-admin fallback; least privilege and fail-closed behavior; no tokens in logs | Integrations/Security | BLOCKED |
| P0-05 Stripe test mode | Test-mode key and webhook signature verification, replay/idempotency, subscription state transitions, tenant mapping | All positive/negative tests pass with Stripe test events; no live credentials | Billing/Finance | PENDING |
| P0-06 Staging and recovery | Staging deploy smoke, health checks, database backup + restore, rollback rehearsal, evidence timestamps | Independently verified restoration and rollback with recorded outcomes and approved RTO/RPO | Operations | PENDING |
| P0-07 Commercial release decision | Signed acceptance record linking above artifacts and known risks | Explicit owner approval after every mandatory gate passes | Release owner | NO-GO |

## Evidence record template

For each gate record: **commit SHA**, **workflow run URL**, **job/step**, **UTC timestamp**, **environment**, **test data and isolation**, **result**, **artifact URL**, **reviewer**, and **open issues**. Missing evidence is **PENDING**, not PASS.

## Hard-stop rules

- Never merge this repair branch, deploy, or enable live payments on the strength of this document.
- Never disable RLS, webhook signature verification, per-user authorization, audit thresholds, or credential masking to force a green build.
- Keep Microsoft shared-admin report/embed functionality disabled until per-user authorization is implemented and tested.
- Never store Stripe or Microsoft secrets in evidence artifacts or test logs.
- Any failed mandatory gate means **NO-GO**, even if unrelated checks pass.

## Current verified evidence (2026-10-29)

- Run #24: dependency remediation candidate reduced 65 findings (2 critical, 25 high) to 10 (0 critical, 3 high); candidate audit **FAILED** and candidate is not merged.
- Run #26: source checks passed; existing audit failed; candidate build failed due to TypeScript 6 deprecation handling in legacy `moduleResolution=node10`; verify was still running when checked.
- Commit `ef44434fb0798f388b4f51064b9970e4d15a6745` adjusts isolated candidate to TypeScript 5.9; this change requires a fresh CI run before any pass claim.
