# S32 — Servitro-first staging architecture (review only, 2026-10-31)

**Status: NO-GO. No purchase, provisioning, DNS change, deployment or customer-data access.** Source baseline: Q35 PR #161, SHA `0b6901e5a0ffd159273585fc4e99d108c41051e2`. This is a provider-neutral deployment boundary and a Servitro staging option, not a production migration.

## Domain and environments
- `theepmo.com`: retain existing registrar and authoritative DNS; no transfer, nameserver or zone edits.
- `staging.theepmo.com` and `api-staging.theepmo.com`: **first priority**; planned only, with synthetic test data. Staging Compose project `pmo-staging` uses the existing `infra/staging/edge.compose.yml` and read-only resolved-Compose guard. Existing edge binds loopback and must not be made public until separate approval and end-to-end TLS verification.
- `app.theepmo.com`: reserved for production; leave DNS, credentials, traffic and infrastructure untouched.
- Shared Saudi SaaS: **not hosted on Servitro Frankfurt**. Require verified physical Saudi hosting and contractual/privacy review before any Saudi customer data; enforce tenant-bound access, PostgreSQL RLS, restricted roles, negative cross-tenant tests, backups and per-tenant observability.
- Dedicated agencies: provision a **separate environment per agency**, with independent host/account or equivalent approved infrastructure boundary, identity tenant/app registrations, PostgreSQL and Redis stores, encryption keys, backup destination, secrets, monitoring, deployment and restore processes. Never equate a separate Compose project on one shared VPS with dedicated agency isolation.

## Servitro selection
Official catalog `https://my.servitro.com/store/virtual-servers` lists Frankfurt EPYC options (observed 2026-10-31): $12/year 1 vCPU/1 GB/10 GB; Virtual-1 1 vCPU/4 GB/25 GB $44/year list (advertised $20/year coupon, unverified at checkout); Virtual-2 2 vCPU/8 GB/50 GB $8/month. **1 GB/10 GB is unsuitable for the full PostgreSQL + Redis + API + Next.js + TLS stack**. For a single-host synthetic staging proof of concept, 8 GB/50 GB is the safer baseline; validate actual peak memory, storage, CPU, backups, IPv4, renewal terms, snapshots, network and support before purchasing. These are advertised prices, not a purchase quote. Frankfurt is not Saudi Arabia.

## Architecture and security gates
1. First deploy only after separate authorization: hardened Ubuntu LTS VPS, SSH keys and restricted administrative access, firewall, automatic security updates, provider snapshots *plus* independently encrypted off-host PostgreSQL backups; pin container digests and release SHA.
2. Reverse proxy / TLS edge and web on staging-app network; API on staging-app + staging-data; PostgreSQL and Redis on internal staging-data only. Never expose 5432/6379/API to the Internet. Maintain loopback-only published ports until a separately approved public ingress design is reviewed.
3. Use staging-only credentials and Stripe TEST; no live secrets, production customer records or agency data. Keep secrets out of repository and diagnostic logs.
4. Before staging acceptance: independently verify public HTTPS/certificate/hostname, health and browser UX, PostgreSQL two-tenant negative read/write/replay, encrypted backup and isolated restore, Stripe TEST lifecycle, Entra two-user consent/revocation, 375px Arabic RTL and desktop UAT.
5. No DNS record may be applied until the authoritative DNS operator and staging IP are confirmed and separately approved. Certificate issuance is also a separate operational action.
6. Provider migration must not change application tenancy logic: use explicit deployment inventory (environment ID, residency, tenant type, host, identity boundary, database/Redis boundary, keys, backup boundary), fail closed when region/tenant mapping is unverified.

## Verification
`node infra/hosting/verify-servitro-plan.mjs` and `node --test scripts/servitro-hosting-plan.test.mjs` validate the **design**, not a running VPS. Config is `infra/hosting/servitro-plan.json`. No secrets or DNS commands are included. Hand off to EPMO 5 for exact-SHA CI and independent staging acceptance; retain `candidateSha:null` and `NO-GO` until external evidence exists.
