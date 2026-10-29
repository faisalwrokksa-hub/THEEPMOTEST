# Phase 9 — Web session boundary and redirect hardening

## Scope

This phase continues from the Phase 8 source archive. Its objective is to close a verified gap between the API's cross-site mutation guard and the Next.js browser-facing routes, without breaking session-cookie forwarding, plain form posts, language switching or tenant selection.

## Confirmed findings and implemented changes

| Finding | Evidence | Action |
|---|---|---|
| Web routes accepted browser POSTs and then forwarded the user's cookie as server-to-server API requests without the original browser Origin. The API guard intentionally permits requests without provenance headers for internal Next.js calls. This leaves the web handlers as an unprotected mutation boundary. | `apps/web/src/app/api/**/route.ts`, `apps/api/src/main.ts` | Added `rejectUnsafeBrowserMutation` before mutating browser-route work, with a pure, independently testable `isTrustedBrowserMutation` helper. Exact allowlisted Origin matching and Fetch Metadata are used. |
| Form-supplied `returnTo` / `back` values checked `startsWith('/')`, which includes protocol-relative paths such as `//evil.example`. Passing those into `new URL(path, base)` can change the redirect destination to an external host. | `apps/web/src/app/api/session/tenant/route.ts`, `.../govern/route.ts`, `.../create/route.ts` | Replaced the prefix check with `safeReturnPath`, rejecting external, protocol-relative and backslash-prefixed redirect tricks. |
| A `publicUrl()` redirect destination was built from arbitrary `Host` / `X-Forwarded-Host` headers. | `apps/web/src/lib/public-url.ts` | Production redirects now derive their origin from the configured `WEB_ORIGIN` list; headers select an origin only when it exactly matches that list. Production fails closed if no allowlist is configured. |
| The production web container did not receive the browser origin allowlist. | `docker-compose.prod.yml` | Added `WEB_ORIGIN` to the web service, matching the API service's setting. Updated `.env` documentation. |
| The dependency-free curl-based page traversal used a form POST without Origin, which is now deliberately rejected. | `scripts/pages.sh` | Sends the local web Origin and same-origin Fetch Metadata on the login POST. |

## Security design and compatibility considerations

- Protection is applied to all 11 mutating `apps/web/src/app/**/route.ts` files found during this phase, including POST and DELETE in the Microsoft integration proxy. The Microsoft GET flow remains unchanged.
- Requests identifying themselves as cross-site are refused. When Origin is present, it must exactly match an approved origin. `Origin: null`, sibling subdomains not on the allowlist and missing provenance are refused. For a request without Origin, explicit `Sec-Fetch-Site: same-origin` is accepted if the allowlist is nonempty.
- Unlike browser calls, server-to-server API requests still use the existing API policy: this is deliberate for the Next.js backend proxy.
- Production must set `WEB_ORIGIN` to the exact external web origin(s), such as `https://epmo.example.com`, on both services. Do not include a path, query, wildcard, trailing slash or HTTP origins in production.
- These checks are defense in depth, not a substitute for a thorough threat model, secure reverse-proxy configuration, CSRF tokens where warranted, or end-to-end penetration testing.

## Validation executed in this environment

1. `node scripts/verify-release-static.mjs` — **7/7 source-check groups passed**, including web-boundary validation.
2. `node --experimental-strip-types scripts/verify-web-boundary.mjs` — **22/22 assertions passed**. These exercise the actual pure policy and URL-building functions, plus route source coverage.
3. TypeScript parser — 14 changed TypeScript source files parsed, **0 syntax errors** (local global TypeScript package; not a substitute for typechecking).
4. `bash -n scripts/pages.sh` — **passed**.
5. Archive integrity — verify after packaging.

## Environment blocker and work still required

The full `pnpm install --frozen-lockfile` / `pnpm typecheck` / `pnpm build` / `pnpm test` workflow **could not run in this environment**. `registry.npmjs.org` does not resolve; the repository has no installed workspace dependencies, Docker, PostgreSQL or running API/web services. This phase does **not** certify working runtime sessions, role permissions, RLS, Arabic/English browser rendering, Microsoft integration, or production deployment.

## Reproducible checks in a connected environment

Run from the repository root with Node 22, pnpm 10.17.0 and provisioned PostgreSQL/Redis:

```bash
node scripts/verify-release-static.mjs
pnpm install --frozen-lockfile
pnpm build:packages
pnpm typecheck
pnpm build
pnpm verify:rls
pnpm test
```

After bringing up the API and web with seeded local data, verify browser operations in both English and Arabic, then:

```bash
# Browser-origin rejection on the WEB route (403 expected).
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/session/logout \
  -H 'Origin: https://unapproved.example' -H 'Sec-Fetch-Site: cross-site'

# Run the existing two-language route walk against the web server.
WEB=http://localhost:3000 pnpm pages
```

Re-run the CI pipeline with `WEB_ORIGIN` configured for the relevant environment and verify legitimate same-origin form and JavaScript submits, sign-in/logout, tenant switching, permission denial, dashboard pages, exports, and Microsoft connection callbacks. Review edge cases for corporate proxies and multiple permitted external web domains before production rollout.

**Release decision: blocked pending runtime and browser integration tests.** No live deployment, DNS, external integration, or database was changed.
