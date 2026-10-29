# The EPMO — Phase 14B: Form Validation, Accessibility & Error Handling

## Source changes

- `apps/web/src/components/NewRecord.tsx`: preserve entered data after rejection; prevent duplicate submit; client-side cross-field checks; map API Zod issues to fields; move keyboard focus to the first invalid control after rendering the error; connect errors to controls via `aria-invalid` and `aria-describedby`; bilingual summary/fallback messages.
- `apps/web/src/lib/create-form-validation.mjs` with declaration file: independently testable project, scheduling, allocation, risk, stakeholder and finance input rules, with Arabic and English feedback. The API remains authoritative; client checks are for usability.
- `apps/web/src/app/api/create/route.ts`: retain structured Zod issues in the JSON error response so the form can identify the rejected field.
- `apps/web/src/app/globals.css`: style invalid controls and their associated messages.
- Relevant creation pages: HTML field constraints for project codes/budgets, progress, allocation percentage, likelihood/severity, stakeholder ratings, email, currency and decimal amounts.

## Verification (offline only)

- `node --experimental-strip-types --test apps/api/src/platform/*.test.mjs apps/api/src/onboarding/*.test.mjs apps/api/src/creates/*.test.mjs apps/web/src/lib/*.test.mjs packages/db/src/*.test.mjs scripts/*.test.mjs tests/*.test.mjs`: **364/364 passed**.
- New form validation tests: **17/17 passed**.
- New form integration/accessibility static checks: **13/13 passed**.
- `node scripts/verify-release-static.mjs`: **8/8 check groups passed**.
- `node scripts/verify-migration-chain.mjs`: **17 migration definitions verified**; no new migration added.
- TypeScript compiler parser: **11/11 changed TS/TSX/declaration files parsed successfully**. This is not a full typecheck or build.
- ZIP integrity verified after packaging.

## Deferred acceptance checks

- Full `pnpm` dependency-backed typecheck and Next.js/NestJS build.
- Browser and screen-reader review in English/Arabic, including native HTML validation and error focus.
- Integration testing of actual Zod responses and database writes against staging PostgreSQL.
- Phase 12 live Stripe, SES invitation delivery and production deployment checks remain deferred.

**Status:** Source-level Phase 14B increment only; not certified production-ready.
