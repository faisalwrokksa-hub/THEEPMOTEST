# The EPMO — Phase 13A: Guided Customer Onboarding (Increment 1)

## What has been added

- Authenticated **GET `/api/v1/onboarding/status`** endpoint registered in `OnboardingModule`.
- Tenant-scoped first-run status derived from real membership, portfolio, programme, and project counts.
- Five-step checklist: workspace provisioned, add a colleague, create a portfolio, create a programme, create a project.
- Bilingual English/Arabic `/getting-started` workspace page with a progress indicator and contextual action links.
- Core navigation entry, including capability checks and PMO-module availability checks so links are not offered for actions the current user cannot perform.
- Pure progress logic, regression tests, and CI/offline-test integration. No new database tables or migrations required.

### Important behavior

- **No invite email is sent.** The current Settings page uses administrator-set passwords and explicitly says mail invitations are not supported yet. A safer email invite flow is a separate future milestone.
- Steps represent **recorded data**, not self-reported completion. The workspace step indicates that the authenticated tenant exists; the team step requires at least 2 memberships.
- The endpoint takes the tenant ID from the authenticated request context. It never trusts user-submitted tenant IDs and adds explicit `tenant_id` filters on top of PostgreSQL RLS.
- The page is **readable without a paid PMO license**. Creating portfolios, programmes and projects still needs the existing `pmo360` entitlement and `pmoa_manage_projects` capability.

## How to verify

From the repository root, with Node 22 and dependencies installed for integration tests:

```
npm run test:offline
npm run verify:static
npm run verify:migrations
pnpm typecheck
```

For runtime acceptance with the authenticated staging application:

1. Sign into a newly provisioned workspace and visit `/getting-started`; expect 1/5 complete if it has exactly one member and no project hierarchy.
2. Add one member under `/settings`; refresh and check 2/5.
3. Create portfolio and programme in `/portfolios`, then first project in `/projects`; verify 5/5.
4. Switch to a different organization. Its counts must reflect **only its own data**.
5. Test a read-only user: view progress but do not show privileged action links.
6. Disable the PMO entitlement: the page must still load, while the three project-creation steps explain the disabled module.
7. Exercise the endpoint without a session: it must reject the request.

## Status / preserved release blockers

This is **source implementation**, not a deployed or user-accepted feature. Phase 12 RC1 deployment remains paused: full dependency-backed build, live PostgreSQL migration and tenant-isolation execution, real Stripe test payment, bilingual UAT and production approval are still outstanding. Return to those gates before launch.

## Suggested next Phase 13A increment

A secure organization-profile editor and **tokenized invitation flow** with email delivery, expiration, one-time acceptance, and audit logging. Do not email passwords.
