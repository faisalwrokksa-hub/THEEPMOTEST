# THE EPMO — Q26 independent release integration (31 October 2026)

**Canonical brand/domain:** THE EPMO / theepmo.com. **Release decision: NO-GO.** Review-only; no merge to main, production deploy, DNS modification, paid provisioning, live payments, customer data or Entra admin consent.

## Verified baseline and independent source receipts
Q25 [PR #123](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/123), exact SHA `b7bf8726f9a22bdd11a48f873c84588b2778caf8`, [workflow 41185952580](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41185952580): **SUCCESS 4/4 jobs, 85/85 steps**. CI-local PostgreSQL, tests, builds and smoke only; not external acceptance.

| Owner | PR / exact source head | Exact-source CI | Implementation |
|---|---|---|---|
| Hosting S25 | [#121](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/121) `71d8eeef66fa2f1ac92413e0694df03a36108dab` | [41185803183](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41185803183) **SUCCESS 4/4, 85/85 steps** | Keep PostgreSQL restore password/URI off child process argv; validate disposable target and exercise guarded CLI in CI |
| Hosting S26 | [#122](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/122) `44d17b09f71a5a86a9a1979e7612fa0ccfea967a` | [41185992359](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41185992359) **SUCCESS 4/4, 85/85 steps** | Require production NODE_ENV for staging and reject database/Redis URI overrides |

Six source blobs were copied unchanged from the exact green source commits, preserving file modes (all 100644). S25 and S26 are disjoint paths, and Q25's preexisting versions matched Q24's shared baseline before replacement; no source overlap with E25/F30/C24. This is a source-snapshot integration, not a Git ancestry merge.

## Final Q26 CI
**PENDING**: run the full CI on this *exact final integration SHA*. Prior Q25 and source passes cannot be transferred. Require four successful jobs: source checks, dependency audit, full verify/build (PostgreSQL migrations, RLS, tests, API/web/Docker builds and CI-local smoke), and non-deploying dependency remediation. Check 6/6 blob/mode parity and final PR SHA. Queued/running CI is not PASS.

## Six P0 controls and nine commercial gates
| Control | Status | Owner |
|---|---|---|
| P0-01 Q26 exact-SHA CI/build | PENDING | Release QA |
| P0-02 independent two-tenant staging RLS | PENDING | Engineering |
| P0-03 seven real Stripe TEST scenarios | BLOCKED 0/7 | Commercial |
| P0-04 Microsoft Entra two-user delegated OAuth | BLOCKED | Engineering |
| P0-05 encrypted staging restore/rollback | PENDING | Hosting |
| P0-06 public HTTPS staging web/API | BLOCKED | Hosting |

**Commercial acceptance: 0/9 gates; `candidateSha: null`.** CI-only source guards do not verify real provider transactions, independent tenant writes, deployed HTTPS, encrypted recovery, 375px/desktop keyboard and Arabic RTL browser UAT, or pricing/taxes/terms/privacy/refund/support approval. The 12:16 Riyadh sprint deadline is a target, not launch evidence.

**External dependencies:** Staging administrator must provide authorized isolated HTTPS staging, two disposable tenants, restricted Stripe TEST webhook/credentials, two Entra test users and encrypted recovery target; business/legal must approve pricing, terms, privacy, refunds and staffed support. Do not bypass authorization or fabricate receipts.
