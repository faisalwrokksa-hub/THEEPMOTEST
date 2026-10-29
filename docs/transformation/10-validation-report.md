# The EPMO — Validation Report (25 October 2026)

## Completed
- Unpacked and inspected the prior rebranded source archive.
- Ran `node scripts/dict.mjs`: PASS (774 phrases; no duplicates).
- Ran `node scripts/shadow.mjs`: PASS (no shadowed translator calls).
- Expanded brand audit to source, infrastructure, scripts and tests, with compatibility references separately classified.
- Replaced a machine-specific workbook path in `apps/api/probe.mjs` with a command-line argument.
- Updated developer smoke-test label to The EPMO.
- Preserved demo user credentials, deployment folders, host variables, and legacy integration endpoints intentionally.

## Blocked / not certified
- Full `pnpm` build, TypeScript type checking, and Vitest suite were **not run**: pnpm 10.17.0 is not installed and Corepack could not reach the npm registry (DNS EAI_AGAIN).
- No local PostgreSQL/Redis or active deployed environment was used; RLS and integration verification remain pending.
- No browser-based Arabic/English visual regression testing was run.
- This package must not be treated as production certified.

## Run in a dependency-enabled environment
```bash
corepack enable
corepack prepare pnpm@10.17.0 --activate
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
node scripts/dict.mjs
node scripts/shadow.mjs
node scripts/brand-audit.mjs
```
For database-backed verification, provision isolated development dependencies and follow the repository setup instructions before `pnpm verify:rls` or any integration smoke tests. Do not use production credentials.

## Compatibility decisions
Legacy `pm@pmoalign.test` and `pmoalign-dev` are seeded test credentials, not production branding; replacing them requires a coordinated migration of fixtures and any existing developer data. `ALIGN360_HOST`, `ALIGN360_KEY`, and `/opt/align360*` are deployment interfaces and must only be changed as a coordinated migration, not as visual rebranding. Never change production endpoints or server names automatically.

The legacy brand term in `scripts/leak.mjs` is intentionally retained as an **outbound content leak detection pattern**, not display branding; the brand audit excludes that validator's own pattern list and its own source to avoid false positives. Final audit: zero unclassified application/infrastructure matches, 25 retained compatibility-reference lines.
