# S33 — Fail-closed staging service-name resolution (review only, 2026-10-31)

**Status: review-only; no provisioning, DNS/TLS change, deployment, secrets or customer data.** Based on Q40 PR #176 exact CI-green SHA `6e17a578fb320c6b94afa11148edc26d2cbb169a`. Servitro Frankfurt remains **synthetic-data staging only**; `app.theepmo.com` and the existing registrar/authoritative DNS remain untouched.

## Threat model and fix

The S30/S31 resolved-Compose guard checks that `DATABASE_URL` and `REDIS_URL` use Docker service hostnames `postgres` and `redis`. This alone is insufficient: a Compose `extra_hosts` entry can put a different address for `postgres` in `/etc/hosts`, which takes precedence over Docker DNS, while the original URL still looks safe. Per-service `dns`, `dns_search`, `dns_opt`, `links`, `external_links`, and network `aliases` also create unnecessary resolver ambiguity. A custom `env_file` may inject connection overrides; the API's `PGHOST`/`PGHOSTADDR` and related libpq variables can alter PostgreSQL connection behavior.

The read-only `infra/staging/verify-resolved-compose.mjs` now rejects all those overrides, service hostname/container-name overrides and non-empty network attachment options. It also rejects the API's PG* connection variables. It **does not change runtime Compose, build images, bind a port, connect to a database, or touch DNS**.

## Verification

- `node --test scripts/verify-resolved-staging-compose.test.mjs`
- `node --test scripts/staging-network-isolation.test.mjs` (Docker-backed case only if Docker is installed)
- `node infra/hosting/verify-servitro-plan.mjs`
- Final exact-SHA GitHub Actions source, integration, build and dependency audit; do not transfer a green result from a parent SHA.

New regression tests assert rejection of 10 per-service resolver/identity fields on all five approved services, three network-attachment override types, and nine PostgreSQL connection variables on API. Tests also retain the safe fixture.

## Separate approvals and blockers

No hosting purchase, VPS provisioning, public TLS ingress, certificate issuance, DNS record change, production migration or Saudi customer data. Before any real staging acceptance: independently verify the resolved Compose model, synthetic fixtures, TLS/HTTPS, PostgreSQL RLS negative tests, encrypted **off-host** backups and isolated restore, browser Arabic/RTL UAT, Microsoft two-user test, Stripe TEST and legal/support gates. Servitro's published terms §3.5 do **not** promise backups unless expressly included: https://servitro.com/terms . Saudi shared SaaS requires independently verified Saudi infrastructure. Dedicated agencies require separate runtime, stores, identities, keys and backups.

**Launch decision remains NO-GO; this is a defensive source change, not a staging acceptance receipt.**
