# P0 paid-customer release handoff — 2026-10-30 (review only)

**Recommendation: NO-GO.** This checklist is a proposed acceptance plan, not a claim that the tests were run. No merge, production deployment, live Stripe activation, customer-data deletion or tenant consent is authorized.

## Freeze and ownership

- **Commercial:** public price/terms/support acceptance, checkout and signup contract, unified `docs/commercial-release-evidence.json`, independent artifact review.
- **Engineering:** authenticated signup/activation API, Stripe **TEST** subscription-mode Checkout, raw-body webhook signature validation, transactional idempotency, tenant-scoped entitlements, payment failure/cancellation, per-user Microsoft OAuth, restricted PostgreSQL RLS and recovery.
- **Frontend:** accessible pricing/signup/activation, billing pending/success/failure/cancel, account access, contact/support, bilingual Arabic RTL and 375px/desktop browser UAT.
- Keep proposed API contract in `docs/COMMERCIAL-RELEASE-CONTRACT.md` as the shared handoff. It is **not proof of implemented endpoints**. Do not edit other teams' source files on the Commercial branch.

## Latest independently observed GitHub Actions (not interchangeable)

| Draft PR | Exact SHA | Run | Verified outcome |
| --- | --- | --- | --- |
| [#9](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/9) Commercial docs | `ecb67fd315e0a0fddc1bc0816c1c8407634fb547` | [41027800383](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41027800383) | 4/4 jobs SUCCESS |
| [#11](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/11) Frontend | `5a4a9d8eab288f69df05596dae61e14ff3a4568f` | [41040612826](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41040612826) | 4/4 jobs SUCCESS |
| [#12](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/12) Engineering refresh CAS | `fa16edac1db635f1cf72e81d6be228befb823261` | [41030149871](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41030149871) | FAILED obsolete source test assertion |
| [#13](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/13) Engineering test correction | `2cdb8e18246c8f863aef0398f6fcf466bce55af6` | [41037707742](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41037707742) | 4/4 jobs SUCCESS; 893/893 source tests reported |

PR #11 and PR #13 are **separate descendants** of PR #10, not one combined tested commit. Do not transfer PASS across branches or treat the documentation-only commit below as already tested.

## Final immutable SHA acceptance checklist

Record **one exact 40-character candidate SHA** and ensure each artifact proves that SHA, staging environment, UTC timestamp, result, and independent reviewer. Do not set `candidateSha` until an integrated candidate is identified and tested.

- [ ] Frozen-lockfile install, source tests, high/critical dependency audit, typecheck, integration, production web/API build and smoke all pass on candidate SHA; disposition any remaining moderate advisories.
- [ ] Real restricted-role PostgreSQL RLS: two disposable tenants; negative cross-tenant reads/writes and webhook replay; no-tenant denial.
- [ ] Real isolated Entra staging app with **two distinct users**: consent, refresh, revoke, admin access revocation, concurrent disconnect and cross-user denial. Source-only tests are insufficient.
- [ ] Public HTTPS staging web/API origins with valid DNS/TLS, test email and health endpoints; record exact deployed candidate SHA.
- [ ] Stripe **TEST** first-customer recurring subscription-mode Checkout using server-owned price and authenticated tenant; success redirect alone never activates entitlements.
- [ ] Stripe raw-body signature verification and negative invalid-signature test; store only redacted event identifiers.
- [ ] Stripe duplicate/replayed event produces exactly one idempotent entitlement/billing transition.
- [ ] Stripe verified subscription activates tenant-scoped entitlement once, including tenant A/B isolation.
- [ ] Stripe failed payment/dunning enforces approved access/grace policy; no silent access extension.
- [ ] Stripe cancellation effective date, customer-visible status, and entitlement expiry match approved policy.
- [ ] Frontend browser UAT: landing/pricing/terms, signup/activation, checkout pending/failure/cancel, account/login/logout, support, 375px keyboard and desktop Arabic RTL; capture sanitized screenshots and outcomes.
- [ ] Independent encrypted staging backup, isolated restore, integrity verification and rollback drill; never use production data.
- [ ] Business/legal approve actual pricing, currency, billing interval, taxes, trial, cancellation/refund, privacy/terms URLs and staffed support contact.
- [ ] Reviewer checks every linked receipt, source SHA, time, environment and negative-case result; run `node scripts/commercial-release-gate.mjs` and document its result. A validator PASS means review-ready only, not deployment approval.

## Exact external dependencies — BLOCKED until provisioned by authorized administrators

1. **Stripe:** restricted `sk_test_` and `whsec_` stored only in staging secret manager, test Price IDs, public HTTPS webhook route and real TEST delivery access; never paste secrets into issues, logs or Git.
2. **Staging:** isolated HTTPS web/API DNS/TLS origins, two disposable customer tenants and identities, test email delivery, restricted database credentials, and observable build SHA.
3. **Microsoft:** isolated Entra app registration, redirect URI, two test identities and authorized nonproduction consent. No external/customer tenant consent.
4. **Recovery:** disposable encrypted snapshot and isolated restore/rollback target.
5. **Business:** approved plan price/tax/trial disclosures, policies and staffed support address/contact route.

**Integration order:** independently review #11 and #13, reconcile their distinct changed files on a new review-only integration branch, include the latest Commercial docs without overwriting any Engineering/Frontend changes, run new exact-SHA CI, then execute real provider/staging/UAT/recovery gates. If any input is missing, leave its gate non-PASS and continue independent safe work.

**Decision log:** Preserve NO-GO and `candidateSha: null`; source/CI success is useful engineering evidence but not paid-customer release acceptance. No credentials, consent, merge or deployment.
