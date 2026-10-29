# Phase 13F — Commercial customer experience: offline verification

Baseline: `the-epmo-phase13e-executive-governance-reporting.zip`.

## Changed source

- `apps/web/src/app/(app)/billing/page.tsx`: subscription overview, trial display, plan comparison, billing guidance, cancellation controls.
- `apps/web/src/app/(app)/getting-started/page.tsx`: trial and expiration guidance for authorized workspace administrators.
- `apps/web/src/app/api/billing/subscription/route.ts`: authenticated, same-origin POST proxy for schedule/resume cancellation. Tenant identity is derived only from server session.
- `apps/web/src/lib/api.ts`: typed subscription and plan reads.
- `apps/web/src/lib/subscription-display.mjs` and `.d.mts`: read-only display/status/price/date helpers.
- `apps/api/src/platform/subscription.service.ts`: includes published plan price/name/interval in current subscription response.
- `docs/customer/billing-guide.en.md` and `docs/customer/billing-guide.ar.md`: end-user billing instructions.
- `apps/web/src/lib/subscription-display.test.mjs` and `tests/phase13f-commercial-experience.test.mjs`: focused regression/security checks.
- `PHASE13F_COMMERCIAL_EXPERIENCE.md`: milestone scope and boundaries.

## Verified offline

- `npm run test:offline`: **322 / 322 tests passed** (including 33 new focused tests).
- `npm run verify:static`: **8 / 8 check groups passed**.
- `npm run verify:migrations`: **17 ordered SQL migrations match the journal**. No new SQL migration is needed for this UI milestone.
- TypeScript compiler's syntax-only transpilation: **5 / 5 changed `.ts`/`.tsx` files passed**.
- The ZIP is tested for CRC errors after packaging.

## Still outstanding

A full dependency-backed Next.js/NestJS build and typecheck, live PostgreSQL migrations and row-level security, Stripe test-mode payment/webhook acceptance, SES email delivery, browser-based Arabic RTL/accessibility testing, and staging/production deployment. These **have not been run** here; no production-readiness claim is made.
