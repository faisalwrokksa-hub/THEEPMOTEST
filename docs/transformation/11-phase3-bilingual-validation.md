# The EPMO — Phase 3 bilingual quality and validation

Date: 2026-10-25

## Changes made
- Localized development-only login account guidance, account roles, username placeholder, and the login side-panel statement for Arabic users.
- Explicitly marked the Latin-script compatibility password with `dir="ltr"` so it remains readable in Arabic context.
- Added `scripts/verify-bilingual-brand.mjs`, a dependency-free, read-only smoke check for document language/direction, bilingual metadata, persisted locale selection, accessible language switch, and login branding.

## Checks actually executed
- `node scripts/dict.mjs` — PASS (774 dictionary phrases; no duplicates reported).
- `node scripts/shadow.mjs` — PASS (no shadowed translator calls reported).
- `node scripts/verify-bilingual-brand.mjs` — PASS (10/10 static assertions).
- `node scripts/brand-audit.mjs` — PASS (0 unclassified legacy brand matches; 25 lines retained for compatibility).
- `node --check scripts/verify-bilingual-brand.mjs` — PASS.

## Not verified and release blockers
- `pnpm install`, TypeScript, production build, and automated Vitest suite: **not run**. Corepack could not download pnpm 10.17.0 from npm; no installed node_modules were present.
- Browser-based English/Arabic visual testing at mobile, tablet, and desktop breakpoints: **not run**.
- PostgreSQL tenant isolation, authentication, API integration and email/report export checks: **not run**.
- No production deployment or environment variables were modified.
- Static source assertions are not runtime tests, accessibility audits, or evidence of complete translation coverage.

## Follow-up verification in a dependency-enabled environment
```sh
corepack enable
corepack prepare pnpm@10.17.0 --activate
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
node scripts/dict.mjs
node scripts/shadow.mjs
node scripts/brand-audit.mjs
node scripts/verify-bilingual-brand.mjs
```

Review the login, navigation, portfolio pages, modals, tables, charts, notifications, and exported documents in Arabic and English. Test all supported breakpoints; check keyboard navigation and RTL mixed-language labels. Verify database-backed isolation using disposable development environments only.

## Compatibility
Seeded account values, historical deployment paths and environment variables, and other documented legacy identifiers remain unchanged to avoid breaking existing interfaces. Rename them only as part of a separately verified migration.
