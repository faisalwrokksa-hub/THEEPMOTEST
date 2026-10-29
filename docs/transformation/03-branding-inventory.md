# Branding Inventory and Compatibility Matrix

| Surface | Paths | Action |
| --- | --- | --- |
| Document title and description | `apps/web/src/app/layout.tsx`, `apps/web/src/app/login/page.tsx` | Renamed |
| Application shell | `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/components/Crumbs.tsx` | Bilingual wordmark |
| Platform UI, module notices, Microsoft UI | `apps/web/src` | Updated display copy and matching dictionary keys |
| Translation corpus | `packages/contracts/src/i18n.ts` | Updated old product mentions; Arabic canonical brand entry added |
| AI identity, notification footer | `apps/api/src/askx`, `apps/api/src/notify` | Updated |
| PDF, Word, PowerPoint, Excel exports | `apps/api/src/exports`, `apps/api/src/excel` | Updated default English brand |
| Site icon | `apps/web/public/favicon.svg` | Replaced preliminary icon |
| Demo fixture display name | `packages/db/src/seed.ts` | Updated label only; fixtures unchanged |
| Root manifest | `package.json` | `the-epmo` |
| Microsoft Entra callback URL | `docs/microsoft-setup.md`, environment variables | Unchanged: requires registered endpoint migration |
| Workspace IDs, seed emails/password, internal module keys | `packages/db`, `tests`, runtime references | Unchanged: preserve compatibility |
| Deployment paths and compose volumes | `README.md`, compose, infra | Unchanged to avoid breaking existing environments |
| CSS selectors and theme preference cookie | `apps/web/src/app/globals.css`, layout | Unchanged to preserve stored user preferences |
| Scoped package names (`@pmo/*`) | package manifests and imports | Unchanged pending major version and package-boundary plan |

**Residual technical-brand terms are intentional, not evidence that the customer-facing rebrand is complete at runtime.** Run the supplied search script and manually inspect rendered and exported surfaces before launch.
