# Q13 independent integration and launch evidence — 2026-10-31

**Release decision: NO-GO.** This is a review-only branch, not a deployable approval.

## Immutable GitHub checkpoints

| Stream | Draft PR | Exact head SHA | Verified Actions result |
| --- | --- | --- | --- |
| Engineering E12 | [#43](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/43) | `f43bfaa7db7856b831d09b0eff781e6dbf7585b0` | [41088169011](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41088169011): SUCCESS |
| Frontend F12 | [#45](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/45) | `13ba4fd9c7a5e8702b6e6279066161dc0a54ce96` | [41088560225](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41088560225): SUCCESS |
| Commercial C09 | [#44](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/44) | `6988a219569ce4c3a846db751fdb63ca552fa76b` | [41088373006](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41088373006): SUCCESS |
| Staging S10 | [#46](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/46) | `7b9f6544a5cdbfa0aa1b519d66f1ab37d3c43ef2` | [41088738072](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41088738072): SUCCESS |
| Integrated Q12 | [#47](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/47) | `0e03471d5d3bb4c1e8ad355ed8b95544d4c662f2` | [41089023025](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41089023025): SUCCESS, 4/4 jobs |
| QA Q13 | [#48](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/48) | See current PR head; initial guard commit `e92c48054317ab1325af6859fe05d5e38fd08620` | CI requested; **not a PASS until completed at final SHA** |

## What Q12 CI actually establishes

On exact Q12 SHA, all four Actions jobs concluded success: dependency-free source checks, audit, dependency remediation candidate generation, and verify. Verify included actual disposable PostgreSQL migrations/RLS, tenant isolation, database restore, API/web builds, Docker image builds and live CI-local web/API smoke. These are **CI-local tests**. They do not prove independent public staging, Stripe provider delivery, Entra two-user consent, browser UAT, disaster recovery or business/legal acceptance.

## Q13 improvement

The added `scripts/q13-ci-evidence-guard.mjs` checks an exact SHA, completed successful workflow, all four required jobs, critical steps, and rejects skipped/failed/absent/partial or cross-run evidence. Its negative tests run through the existing `scripts/*.test.mjs` offline CI glob. This validator does **not** verify the authenticity of the downloaded JSON or external provider receipts; a human reviewer must fetch GitHub records and independently inspect provider artifacts.

Example usage after downloading the actual GitHub API JSON for a candidate:

```bash
node scripts/q13-ci-evidence-guard.mjs run.json jobs.json <40-character-candidate-SHA>
```

## Nine release gates — evidence manifest state at Q12

| Gate | Current manifest state | Required independent closure |
| --- | --- | --- |
| Dependency security | BLOCKED | Review exact-SHA audit, SBOM and moderate advisory disposition |
| CI/build | BLOCKED in stale manifest; Q12 CI observed success | Reconcile manifest against final immutable candidate and independently review full job receipts |
| Tenant PostgreSQL RLS | PENDING | Two-tenant independent staging negative reads/writes and replay |
| Microsoft delegated OAuth | PENDING | Two-user Entra consent/refresh/revoke/cross-user denial |
| Stripe TEST billing | BLOCKED | Seven real recurring subscription and signed-webhook scenarios |
| Frontend customer journeys | PENDING | Browser acceptance at 375px/desktop, keyboard, English/Arabic RTL |
| HTTPS staging | PENDING | Actual public DNS/TLS and deployed SHA/health receipts |
| Backup/restore/rollback | PENDING | Encrypted isolated staging restore with integrity and rollback proof |
| Support/legal | PENDING | Approved pricing, tax/trial, terms/privacy, refunds and staffed support |

All seven Stripe scenarios remain PENDING in the current manifest. `candidateSha` remains null and the manifest decision remains NO-GO. Do not silently set these to PASS merely because Q12 CI is green.

## Hard blockers and next actions

1. **Operations:** authorize and provision isolated HTTPS staging origins and secrets, disposable PostgreSQL tenants, encrypted backup/restore target and rollback rehearsal. No DNS/hosting changes in this PR.
2. **Commercial:** authorized Stripe TEST account, restricted keys and webhook endpoint, test recurring Price ID, then seven real provider scenarios.
3. **Engineering:** isolated Entra app and two test users with approved staging consent; test refresh/revoke/cross-user denial; independent tenant negative writes.
4. **Frontend:** browser UAT against deployed immutable SHA including Arabic RTL, mobile and customer payment/account recovery.
5. **Release owner/business:** verify support route, approved legal/pricing and explicitly sign acceptance only after every gate is supported.

**Deadline:** 2026-10-31 12:16 Asia/Riyadh is a requested sprint target, not evidence of completion. Main remains `5c37382bbf42459ca5752ed5685b731dafba947f` as observed during this review; no merge or deployment is authorized.
