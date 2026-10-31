# THE EPMO — Q25 independent release integration (31 October 2026)

**Canonical brand/domain:** THE EPMO / theepmo.com. **Decision:** **NO-GO**. Review-only; no production merge, deployment, DNS changes, paid provisioning, real payments, customer data or Entra admin consent.

## Verified baseline
Q24 [PR #115](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/115), exact SHA `49ddc2c0df9ab53cdb94d54fc5aa31e0b584c9e1`, [workflow 41182378680](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41182378680): **SUCCESS 4/4 jobs (53+11+10+11 = 85 steps)**. CI-local source/audit, PostgreSQL, build and smoke only.

## New source integration
| Stream | PR and head | Exact-head CI | P0 implementation |
|---|---|---|---|
| Engineering E25 | [#116](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/116) `bf3f380c748742a4c6e0fde72c285e6a7606c76f` | [41182967853](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41182967853) SUCCESS 4/4 | Reject permissive tenant RLS COALESCE/wrapper bypass |
| Frontend F29/F30 | [#117](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/117) + [#118](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/118) `e4ecee8c578ac466689be8f4e3bed50869c3a2f6` | [41183764266](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41183764266) SUCCESS 4/4 | Request-cached bounded session and 16 MiB authenticated JSON limit |
| Commercial C23/C24 | [#119](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/119) + [#120](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/120) `cf3e71dfd32398db4f708e3aa1ccba2b3a500dd6` | [41184607941](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41184607941) SUCCESS 4/4 | Provider-check cached Stripe Checkout; bound Stripe JSON to 256 KiB |

All 11 source blobs are sourced from exact green head commits. F30 includes F29, C24 includes C23, so each chain is integrated once. No cross-stream file-path overlap. The four preexisting modified files were compared against their source-parent blobs and matched Q24 before replacement, preventing silent rollback. This is a **source snapshot**, not a history merge.

**Hosting S25 [PR #121](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/121)** at `71d8eeef66fa2f1ac92413e0694df03a36108dab` was **excluded** because [workflow 41185803183](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41185803183) was still in progress at decision time. Never count queued/running CI as PASS. Integrate separately only after complete exact-head success.

## Q25 final-SHA verification
**PENDING**: a new GitHub Actions run for the final integration commit must complete successfully, with four jobs and exact SHA verified. Prior source and Q24 CI passes do not transfer to Q25. Verify source blob parity, executable modes, migration/RLS, regression tests, API/web and Docker builds, and CI-local runtime smoke. Publish exact final-SHA receipt separately without rewriting tested commit.

## P0 and nine commercial gates
| P0 | Status | Owner |
|---|---|---|
| 01 exact-SHA integrated CI/build | PENDING Q25 workflow | Release QA |
| 02 independent two-tenant staging RLS negative read/write | PENDING | Engineering |
| 03 seven real Stripe TEST subscription/webhook/entitlement scenarios | BLOCKED 0/7 | Commercial |
| 04 Microsoft Entra two-user consent/refresh/revoke | BLOCKED | Engineering |
| 05 encrypted staging backup/restore/rollback | PENDING | Hosting |
| 06 public HTTPS staging web/API | BLOCKED | Hosting |

Nine commercial gates: **0/9 accepted**; commercial `candidateSha: null`. Customer journey, 375px and desktop keyboard/Arabic RTL browser UAT, real provider receipts and pricing/terms/refund/privacy/staffed support signoff remain unverified. The 12:16 Riyadh target is not a release pass.

**Escalation:** Staging administrator must provide approved isolated HTTPS web/API, test identities, restricted Stripe TEST credentials/webhook and Entra two-user consent environment, plus encrypted restore target; business/legal owner must approve pricing, taxes, terms/privacy/refunds and staffed support. No credentials or production operations authorized in this branch.
