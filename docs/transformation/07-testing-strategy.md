# Test Strategy and Evidence

**Executed in the packaging environment:** `node scripts/dict.mjs` (774 unique translation entries, no duplicates), `node scripts/shadow.mjs` (no shadowed calls).

**Not executed here:** full pnpm build, TypeScript check, database-backed tests, full browser E2E, PDF/Office render checks, penetration testing, deployment validation. Missing installed workspace dependencies and backing services prevent treating static checks as proof of functionality.

Suggested CI sequence: `corepack pnpm install --frozen-lockfile`, `pnpm check:dict`, `pnpm check:shadow`, `pnpm typecheck`, `pnpm build`, `pnpm test`; run database-required suites against a disposable configured PostgreSQL environment. Review failure logs rather than disabling tests.

Manual review: login, navigation, tenant switcher, module licensing, CRUD operations, approvals, exported documents, notifications, Microsoft configuration help, Arabic UI/RTL, desktop/mobile, fallback states.
