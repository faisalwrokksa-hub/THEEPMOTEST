# The EPMO — P0 Checkpoint 18: Financial privacy and per-user Ask X conversations

Baseline: `the-epmo-p0-tenant-analytics-authorization-checkpoint17.zip`.

## Confirmed issues and fixes

1. **General dashboard / analytics / trends:** The executive overview returned monetary totals, Analytics360 returned per-project budgets/actuals, and trend S-curves contained spending amounts to all module-licensed workspace members. The API now returns `money: null`, `spendByProject: []`, and `sCurve: []` for users without `pmoa_view_financials`. Project health, gate activity, and other nonfinancial analytics remain available. SQL financial queries are skipped for these users. The overview UI omits its spending tile instead of falsely reporting zero.
2. **Project listing and detail:** Project records contain `budgetAmount`. The API now returns `budgetAmount: null` for users without financial-viewing permission; it does not require them to have the financial module just to see ordinary projects.
3. **Activity audit diffs:** General activity could return JSON audit changes containing costs and financial figures. The `diff` payload is now SQL-redacted for nonfinancial roles; nonsensitive event metadata remains visible.
4. **Ask X:** The AI grounding includes project budgets, actuals, forecasts, and benefit targets. Until a separate scrubbed grounding implementation is available, all financial-capable Ask X operations require `pmoa_view_financials`. The widget is hidden for users who cannot use it. The historical conversation endpoint and list filter by **authenticated user ID as well as tenant RLS**; arbitrary or other-user thread references return a 404 and cannot be used for prompt context. Malformed conversation references fail validation before SQL.
5. **Board packs and Excel:** All generated board packs are financial documents and require financial-viewing permission at the shared export service boundary. Full project Excel downloads have the same requirement. Excel import can rewrite cost lines, budgets and benefits, so it now requires **both** project management and financial-write permission.
6. **Project creation with approved budget:** Creating projects without budget remains a project management action; supplying an approved budget additionally requires `pmoa_manage_finance` because it creates a cost ledger entry.

## Verification performed

- `npm run test:offline`: **778 passed, 0 failed** (16 new financial/Ask X source boundary regression tests).
- `node scripts/verify-release-static.mjs`: **8/8 groups passed**.
- `node scripts/rc1-release-gate.mjs`: **9/9 preflight checks passed**.
- `node scripts/verify-migration-chain.mjs`: **20 migration SQL definitions consistent**.
- TypeScript/TSX parser checks for **10/10 modified/new TS/TSX files** passed; these are **not** a dependency-backed typecheck or build.
- A new Vitest live integration suite is supplied at `tests/p0-financial-ai-privacy.test.ts`, requiring API and disposable PostgreSQL; it was **not run** here.
- ZIP CRC verified when packaging.

## Operational changes and known remaining risks

- Users without finance access no longer see Ask X, including nonfinancial questions. A future segregated nonfinancial assistant can be added after ensuring existing chat histories do not expose prior privileged content.
- Project-manager-only accounts can no longer import workbooks that rewrite financial records or create approved project budgets. Grant a separately reviewed finance-write capability to permitted staff; do not restore global financial write access.
- Continue reviewing other downstream routes, attachments, PDF print contexts and imported documents for embedded financial content. Permissions on a financial API do not automatically protect a document whose content was copied elsewhere.
- **Still blocked for paying-customer launch:** full compiled application and Docker builds, actual PostgreSQL migrations/RLS and role tests, browser integration, SES recovery/invites, real test-mode payments/webhooks, tenant isolation, backups/restore and operational/commercial approval. No live CI or provider validation was performed in this checkpoint.

**Status:** Source-level fixes implemented and offline-tested; **not production certified**.
