# THE EPMO — Q31 independent P0 integration (31 October 2026)

**Decision:** NO-GO. **Brand/domain:** THE EPMO / theepmo.com. **Scope:** review-only, non-deploying.

## Source and branch chain
- Q30 baseline PR #144 SHA `28ee378b4713f99f1820a1df89a2708e552fcffe`, GitHub Actions [41192720926](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41192720926): completed SUCCESS.
- S29 PR #145 SHA `de66859108258d7d74377fed45b56f18eb5b13f1`, exact-SHA Actions [41193900954](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41193900954): completed SUCCESS, four jobs. S29 is two commits ahead of Q30, zero behind; changed `infra/staging/edge.compose.yml` and `scripts/staging-network-isolation.test.mjs`.
- Q31 branch is based directly on the green S29 SHA, preserving all Q30 changes. Adds `scripts/verify-commercial-gates.mjs` and `scripts/verify-commercial-gates.test.mjs`.
- Offline QA regression ran locally: **4/4 tests PASS** against a representative blocked nine-gate manifest. The exact repository manifest and combined SHA must be checked by GitHub Actions after PR creation. This report does not self-attest the Q31 SHA.

## Functional changes
1. Explicit staging Compose network segmentation: PostgreSQL and Redis only on internal `staging-data`; nginx/web only on `staging-app`; API on both for internal DB/cache and external Stripe/Microsoft calls.
2. New read-only commercial evidence verifier: validates all nine gate receipts against the same immutable candidate SHA, HTTPS evidence URL, reviewer, timestamp, and seven Stripe TEST scenario receipts. It refuses to turn complete metadata into a production GO decision.
3. Negative tests for absent candidate, cross-SHA receipts, missing Stripe replay evidence, absent reviewer, untrusted URL, future timestamp and unsupported GO assertion.

## Independent release gates
- P0-01: Q31 combined exact-SHA CI/build **PENDING** at report creation.
- P0-02: staging two-tenant RLS negative read/write **PENDING**.
- P0-03: Stripe TEST subscription lifecycle **BLOCKED, 0/7 accepted**.
- P0-04: Entra two-user delegated authorization **BLOCKED**.
- P0-05: encrypted staging backup/restore/rollback **PENDING**.
- P0-06: public HTTPS staging browser/API acceptance **BLOCKED**.
- Mobile 375px and desktop Arabic RTL browser UAT, pricing/legal/support **PENDING**.

**Nine commercial gates remain 0/9 accepted; `candidateSha: null` and NO-GO.** Source tests, offline metadata validation and successful CI cannot substitute for actual provider, browser, tenant-isolation or restore receipts. No production deploy, main merge, DNS changes, payments, infrastructure purchase, customer data or Entra admin consent.
