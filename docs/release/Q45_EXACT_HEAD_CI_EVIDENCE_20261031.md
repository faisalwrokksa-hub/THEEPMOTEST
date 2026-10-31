# Q45 - Exact-head CI and release evidence identity (review only)

Date: 2026-10-31. Base: Q44 PR #185 at commit 5bc5c8183bc0dc5a1d20318b5f1e16e74352673d (parent CI must independently complete).

## P0 defect
On pull_request events GitHub Actions normally checks out a synthetic merge ref and GITHUB_SHA can identify that merge commit rather than the immutable PR head. The four CI jobs used unpinned checkout, while Phase15E receipts and executive CI summary used GITHUB_SHA. A successful run therefore did not independently attest that every job built the exact PR head.

## Fix
Pin all four CI checkouts to github.event.pull_request.head.sha || github.sha and assert git rev-parse HEAD matches EPMO_CANDIDATE_SHA immediately after checkout. Bind receipt recording, verification and summary to the same candidate SHA. Add fail-closed static source checks and negative offline tests for missing pins, missing attestation, malformed SHAs and synthetic merge/head mismatch.

## Boundaries
Only CI checkout identity and evidence integrity; no live staging or external acceptance. Same-SHA completed workflow still required. Nine commercial gates 0/9; Stripe TEST 0/7; Entra two users, independent RLS, public HTTPS, browser mobile/RTL UAT, encrypted restore and legal/support approvals absent. Release NO-GO. No main merge, deployment, DNS, purchase, secrets, customer data, live Stripe or Entra admin consent. Official domain: theepmo.com.
