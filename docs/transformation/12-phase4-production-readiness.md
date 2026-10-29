# The EPMO — Phase 4 production-readiness review

Date: 2026-10-25

## Scope and changes

1. **CORS production allowlist validation:** `apps/api/src/common/env.ts` now parses each comma-separated `WEB_ORIGIN` item as a URL, rejects blank and `*` entries, refuses non-HTTP(S) URLs and URLs containing a path, query, fragment or non-origin syntax, and requires **every** configured origin to use HTTPS in production. Previously only the beginning of the entire string was checked for `http://`, so e.g. `https://portal.example,http://legacy.example` was not explicitly rejected.
2. **Reverse proxy trust:** Added `TRUST_PROXY_HOPS` with a bounded integer range 0–10 and default `1`. `apps/api/src/main.ts` now uses the value instead of hard-coding a single hop. Operators must configure this based on their actual reverse-proxy topology; wrong trust settings can undermine request-IP-based throttling.
3. **Deployment configuration:** `.env.example` now documents `WEB_ORIGIN` and `TRUST_PROXY_HOPS` and uses the updated product name in explanatory text.
4. **Repeatable static checks:** Added `scripts/verify-production-config.mjs` to ensure security-related configuration guardrails stay present. These tests inspect source and do NOT prove runtime functionality.

## Checks actually run

| Check | Outcome |
| --- | --- |
| `node scripts/dict.mjs` | PASS — 774 translation entries, no duplicate keys reported |
| `node scripts/shadow.mjs` | PASS |
| `node scripts/verify-bilingual-brand.mjs` | PASS — 10/10 source assertions |
| `node scripts/verify-production-config.mjs` | PASS — 7/7 source assertions |
| `node scripts/brand-audit.mjs` | PASS — 0 unclassified; 25 compatibility reference lines retained |
| `node --check scripts/verify-production-config.mjs` | PASS |
| npm package registry connectivity | BLOCKED — DNS `EAI_AGAIN` to registry.npmjs.org |
| `pnpm install`, TS typecheck, frontend/backend build, Vitest | NOT RUN — dependencies unavailable |
| Live PostgreSQL/RLS, authentication, CORS, network and reverse-proxy tests | NOT RUN — no initialized services |
| Browser and RTL visual verification | NOT RUN — no running application |

## Rollout constraints

- **No production deployment or database migration performed.**
- The default proxy trust remains one hop to preserve existing behavior; teams exposing the API directly must set `TRUST_PROXY_HOPS=0`. Validate this against the actual ingress/proxy configuration before production use.
- Production `WEB_ORIGIN` must now contain HTTPS origins only, e.g. `https://epmo.example.com,https://admin.example.com`. Entries with a trailing `/` are not accepted; configure exact origins only.
- With dependencies installed, exercise `loadEnv()` dynamically using test values including mixed HTTPS/HTTP lists, wildcard, empty origin, incorrect path, and multiple valid HTTPS origins.
- Add integration tests for CORS preflight and credentialed cross-origin requests and verify correct request IP under the real reverse proxy.
- Run full `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build`, `pnpm test`, and disposable-database RLS tests.
- Complete browser-based RTL/LTR visual inspection and authentication/tenant isolation testing before production certification.

## Open risks

- Content Security Policy remains disabled in `apps/api/src/main.ts`; assess actual API and web delivery architecture to design a policy without breaking necessary integrations.
- `TRUST_PROXY_HOPS` is topology dependent and cannot be validated from source alone.
- The static source tests are narrow regression guards, not end-to-end guarantees.
