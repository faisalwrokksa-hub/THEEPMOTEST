# The EPMO — Phase 13B: First Workspace Experience

## Scope of this source milestone

This release builds on Phase 13A's organization profile, secure invitations and five-step checklist.

- Server-derived onboarding status now exposes `nextStep` to recommend **portfolio → programme → project → teammate**. Existing completion counts and links remain backward-compatible; no database migration was needed.
- The bilingual **Getting Started** page highlights the next recommended action, explains the ordering, and exposes an accessible progress indicator.
- First-run deep links open the relevant existing create form: `/portfolios?new=portfolio`, `/portfolios?new=program`, and `/projects?new=project`.
- If a programme link is opened before any portfolio exists, the portfolio form opens instead, rather than displaying an unavailable programme form.
- Creating a portfolio, programme or project is offered only to users with project-management permission **and** an enabled PMO module. Backend authorization still applies independently.
- Empty states and first-project guidance now distinguish read-only users and support Arabic/English. Projects can still be created without a programme where the existing API permits this; the UI recommends a governed hierarchy.
- All first-run links use a fixed allowlist of internal destinations, not caller-provided URLs.

## Verification (offline, no staging dependencies)

- `node --experimental-strip-types --test apps/api/src/platform/*.test.mjs apps/api/src/onboarding/*.test.mjs apps/web/src/lib/onboarding-guidance.test.mjs packages/db/src/*.test.mjs scripts/*.test.mjs tests/*.test.mjs`: **237/237** passed.
- `node scripts/verify-release-static.mjs`: **8/8** static release groups passed.
- `node scripts/verify-migration-chain.mjs`: **17** ordered migration files matched the migration journal.
- TypeScript parser: **7** changed `.ts/.tsx` files parsed without diagnostics (syntax-only, not compilation).
- Updated archive was checked with Python `zipfile.testzip()`.

## Still required before release

The full dependency-backed Next.js/NestJS build, real PostgreSQL schema migration, Stripe test payment, SES invitation delivery, browser user acceptance, and cross-tenant runtime tests **have not been run** in this environment. Phase 12 RC1 staging gates remain deferred and are still required before production.

### Manual acceptance walkthrough

1. Sign in to a workspace with one member and no portfolio/programme/project, with PMO enabled and a create-capable role. Visit `/getting-started`; progress is 1/5 and next step is portfolio.
2. Click **Start this step**. The `/portfolios?new=portfolio` link should load with the create form open.
3. Create a portfolio; return to Getting Started and confirm the next step is programme. Repeat to create a programme and then a governed project.
4. Confirm that after creating a project, the remaining recommended step is adding a teammate, unless that was already done.
5. Repeat as a read-only user, and with PMO disabled; paid create forms must not be offered. API authorization still must deny direct unauthorized mutation attempts.
6. Repeat the setup flow with Arabic selected, verifying RTL layout, guidance labels and route behavior.

## Source files touched

- `apps/api/src/onboarding/onboarding-progress.ts` and tests
- `apps/web/src/lib/api.ts`, `apps/web/src/lib/onboarding-guidance.ts` and tests
- `apps/web/src/components/NewRecord.tsx`
- `apps/web/src/app/(app)/getting-started/page.tsx`
- `apps/web/src/app/(app)/portfolios/page.tsx`
- `apps/web/src/app/(app)/projects/page.tsx`
- `scripts/phase13b-onboarding-wiring.test.mjs`
