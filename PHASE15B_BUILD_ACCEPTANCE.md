# The EPMO — Phase 15B build and release artifact acceptance

## What changed

The CI integration job now checks the files actually consumed by the API and
Next.js standalone Docker images. Previously, a successful `pnpm build` was
not followed by a check for the expected deployable paths.

The checks are deliberately read-only and fail closed:

- `node scripts/verify-build-artifacts.mjs --scope packages` after workspace package compilation.
- `node scripts/verify-build-artifacts.mjs --scope api` after the NestJS API build and **before the API process starts**.
- `node scripts/verify-build-artifacts.mjs --scope all` after the production Next.js build.

The full gate checks 8 output paths, including contracts/database JS and type
outputs, `apps/api/dist/main.js`, the **`.next-prod`** build ID,
`apps/web/.next-prod/standalone/apps/web/server.js`, and the nonempty Next
static-assets folder. A leftover developer `.next` directory never qualifies.

## Reproduce in a build-capable environment

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build:packages
node scripts/verify-build-artifacts.mjs --scope packages
pnpm --filter @pmo/api build
node scripts/verify-build-artifacts.mjs --scope api
pnpm --filter @pmo/web build
pnpm verify:build-artifacts
pnpm typecheck
pnpm test
```

For integration acceptance, use a nonproduction PostgreSQL database, apply all
18 migrations via the checked-in SQL ledger, enable tenant RLS, start the API,
and run the Phase 15A billing isolation suite with the explicit CI flag.
Do not use production payment keys or real customer data.

## Verification performed in this isolated environment

- 426/426 dependency-free offline tests passed, including seven new artifact-gate tests.
- 8/8 static release-check groups passed; the 18-file SQL migration chain was consistent.
- 9/9 RC1 configuration checks passed.
- 210 TypeScript/TSX files parsed with the locally available TypeScript parser (no syntax errors).
- The **real build-output gate blocked 0/8** because dependencies were not
  installed, so **no compiled binaries or web bundle were produced or verified**.

## Explicitly NOT completed

- Full dependency-backed NestJS/Next.js build or typecheck.
- PostgreSQL migration execution, RLS isolation, or concurrent-request tests.
- Real Stripe test payment or SES email delivery.
- Deployed browser/RTL and accessibility acceptance.

Those steps remain release blockers; source and simulated tests do not replace them.
