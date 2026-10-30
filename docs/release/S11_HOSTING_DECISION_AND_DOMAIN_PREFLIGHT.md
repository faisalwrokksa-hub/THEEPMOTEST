# S11 — The EPMO hosting decision and domain/TLS acceptance (review only)

**Status: NOT PROVISIONED, NOT DEPLOYED, NO PUBLIC ENDPOINT ACCEPTED.**
Prepared 2026-10-31 for the 12-hour P0 release sprint. This is a decision and
operator checklist, not evidence of ownership, paid resources, DNS propagation,
Saudi data residency, working HTTPS, restored backups or customer acceptance.

## Hosting decision — choose by actual data residency

| Provider | Suitable role | Critical limitation before launch |
| --- | --- | --- |
| Servitro | Disposable development/staging after a reliability trial | Unmanaged Frankfurt VPS; published terms say customer owns backups. Not Saudi data residency. |
| DigitalOcean | Operationally simpler staging / managed PostgreSQL where permitted | Verify actual region, costs, database access controls, offsite recovery and customer residency requirements. |
| Hetzner | Cost-focused, operator-managed staging | Germany/Finland and other offered locations are not automatically Saudi. Backups, patching and restore rehearsal need ownership. |
| AWS | Enterprise controls where the *selected and available* region meets the contract | Bahrain/UAE are not Saudi residency; the announced AWS Saudi region is not a verified available region as of this document. Independently assess region reliability and failover. |

**Decision:** No provider is selected or purchased. For immediate non-customer
staging, prefer an isolated, reversible managed deployment after approval.
For Saudi customer data, stop until the data-residency requirement and an
actually available in-country region/provider are independently verified.
No provider label, JSON region alias or inventory flag proves physical location.

References (verify again at purchase):
- https://servitro.com/terms (unmanaged Frankfurt hosting, no backups unless expressly included)
- https://www.digitalocean.com/pricing/managed-databases
- https://www.hetzner.com/cloud
- https://www.aboutamazon.com/news/aws/aws-cloud-region-saudi-arabia
- https://www.reuters.com/world/middle-east/amazons-aws-is-unable-restore-access-bahrain-one-uae-cloud-data-zone-after-war-2026-09-15/

## Required DNS / TLS inventory (none of these records is claimed live)

| Service | Host | Acceptance evidence |
| --- | --- | --- |
| Production website | `theepmo.com` and optionally `www.theepmo.com` | Verified ownership, reviewed apex/redirect, HTTPS and production authorization |
| Production API | `api.theepmo.com` | Restricted production ingress, trusted proxy chain, valid public certificate |
| Staging website | `staging.theepmo.com` | Isolated staging origin, exact HTTPS SAN, test-only resources |
| Staging API | `api-staging.theepmo.com` | Exact HTTPS SAN, private API upstream, anonymous auth denied |

The existing staging configuration uses **api-staging.theepmo.com** (hyphen),
not `api.staging.theepmo.com` (dot). Do not create an alternative record
without a coordinated application, OAuth, Stripe and CORS contract change.
Staging TLS must explicitly list both staging DNS SANs; CN-only fallback is
rejected by `infra/staging/preflight.mjs` after S11.

## Read-only operator preflight — run only against authorized endpoints

1. Capture provider account, selected region, verified resource IDs, IP/CNAME
   targets, DNS owner, TLS issuer, certificate expiry and expected origin.
   Redact account identifiers and never copy credentials into GitHub.
2. Compare approved records with DNS using `dig +short A staging.theepmo.com`,
   `dig +short AAAA staging.theepmo.com`, and the same commands for
   `api-staging.theepmo.com`. If using a CDN proxy, compare CDN records to
   the approved edge and separately prove its origin binding. DNS existence
   alone is **not** deployment acceptance.
3. On an authorized staging-preparation machine, use
   `node infra/staging/preflight.mjs --env-file .env.staging` to check
   private-key material and exact staging certificate SANs without network
   access. Run `node scripts/verify-staging-config.mjs --env-file .env.staging`.
4. After separate approval for a running staging endpoint, use
   `openssl s_client -connect staging.theepmo.com:443 -servername staging.theepmo.com -verify_return_error`
   and repeat for `api-staging.theepmo.com`. Inspect the complete verified
   chain, expiry, hostname, TLS version, certificate pinning policy and proxy
   topology; never use `-k` or disable certificate validation as a pass.
5. Run the existing read-only `node infra/staging/health-probe.mjs --once`
   only when external staging probes have been authorized. Check API identity,
   login HTML, anonymous billing denial and exact release SHA separately.
6. Verify PostgreSQL encrypted offsite backup checksum, restore to a separate
   disposable database, RLS tenant-negative tests, application rollback and
   monitoring alert delivery. `verify-backup.sh` checks archive structure
   only; it is not a successful restoration receipt.
7. Preserve redacted evidence for DNS, TLS, staging runtime, Stripe TEST,
   Microsoft two-user OAuth, browser UAT, restore/rollback, support/legal,
   exact SHA CI and security signoff. A missing item is **BLOCKED**, never PASS.

## Release constraints

- No purchase, DNS edit, certificate issuance, production deployment, main
  merge, live Stripe payment, admin consent or customer data access is
  authorized by this document.
- CI success demonstrates source/build tests only. S10 region labels are
  illustrative, not proof of physical Saudi hosting.
- EPMO 5 integration owner must require exact-head CI for S11 and then
  revalidate any later integration SHA. Until external receipts exist:
  **THE EPMO production launch is NO-GO.**
