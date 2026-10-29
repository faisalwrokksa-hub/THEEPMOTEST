# The EPMO — P0 Checkpoint 19: Power BI bearer-token and connector privacy boundary

**Baseline:** Checkpoint 18 (`the-epmo-p0-financial-ai-privacy-checkpoint18.zip`).

## Confirmed exposure and correction

The Power BI integration currently stores a **single Microsoft refresh token per workspace** and refreshes a Microsoft access token from that connector account. Previously any signed-in member with general read permission could:

1. Enumerate reports available to the **connected Microsoft account** (`GET /api/v1/microsoft/reports`).
2. Obtain that connected account's **bearer token** through `GET /api/v1/microsoft/reports/:id/embed`, even when the member had neither finance-view nor workspace-admin permission.

The previous UI/docs incorrectly claimed the token belonged to the *current EPMO user*; it does not. A user with that token might access any provider resources permitted to the connected Microsoft account, not merely the requested report. A client-side role check would not fix this.

**Source changes:**

- Service methods for Power BI report listing and token-bearing embedding now call `requireCapability('pmoa_admin')` **before** retrieving or returning Microsoft tokens.
- `/power-bi` server-rendered page and its navigation require the same workspace-admin permission; these are UX measures, not replacements for service authorization.
- Microsoft connection `status` redacts the connected email, account name, provider tenant ID, consent scopes, folder/drive identifiers, and provider error messages for non-admin roles. Non-admins can still see whether a connection exists and its status.
- The general integrations view no longer exposes provider `last_error` diagnostics to non-admin members.
- Corrected the Power BI UI, bilingual strings and setup documentation to describe the workspace-connector token truthfully and advise granting that account minimum provider privileges.
- Added `tests/p0-microsoft-delegated-token-privacy.test.mjs` and two live integration acceptance cases in `tests/microsoft.test.ts` for 403 denials and sanitized connection details.

## Local verification

- `npm run test:offline` — **790/790 passed**, including 12 new focused checks.
- `node scripts/verify-release-static.mjs` — **8/8 groups passed**.
- `node scripts/rc1-release-gate.mjs` — **9/9 passed**.
- `node scripts/verify-migration-chain.mjs` — **20 migration definitions consistent**.
- TypeScript parser — **9/9 changed TS/TSX files parsed**.
- Release archive CRC check performed during packaging.

## Remaining launch restrictions

- **No real Microsoft/Power BI delegated-token or tenant-consent round trip was performed.** New live tests require API and PostgreSQL, which are not available locally.
- This checkpoint **restricts embedded Power BI to workspace admins** until a true per-user Microsoft OAuth design or a properly scoped service-principal embedding architecture with effective per-user authorization is implemented. Do not relax the permission without changing the token design. Workspace administrators remain capable of retrieving the connected account's delegated access token; ensure the connected account is minimally privileged.
- SharePoint document links and previews may still expose privileged content inside a tenant where users have broad read permissions. Document classification and per-document authorization remain a separate design and acceptance requirement.
- Full application build, PostgreSQL migrations and tenant RLS, Stripe payments/webhooks, SES emails, Docker images, backup restore, staging/browser acceptance and commercial approval **remain unverified**. Connected GitHub currently exposes no repositories, so live CI could not be run.

**Status:** Source-level privacy fix implemented and offline-verified; NOT production-certified.
