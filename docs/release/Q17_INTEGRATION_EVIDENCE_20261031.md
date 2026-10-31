# Q17 independent integration evidence — 2026-10-31

**THE EPMO / theepmo.com — RELEASE NO-GO.** This review-only candidate does not authorize a merge to main, DNS change, hosting purchase, live payment, production deployment, production secrets, or Entra admin consent.

## Exact source provenance and completed GitHub Actions

| Component | PR | Exact source SHA | Completed workflow |
| --- | --- | --- | --- |
| Integrated Q16 base | #67 | `4948bc9ff738fb7e920643099e1d48018a88b35e` | [41146665374](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41146665374) — success, 4/4 jobs |
| Engineering E17 | #68 | `d9f06a44f2963ba635102aeb405514ee1be29c9b` | [41148082548](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41148082548) — success, 4/4 jobs |
| Frontend F16 + F17 | #69 + #70 | `846138020afa29ec736b52caa15bda2a58407871` | [41149145222](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41149145222) — success, 4/4 jobs |
| Commercial C14 | #71 | `85789d823448e92ca396b9d9c969360ff4bece64` | [41150319639](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41150319639) — success, 4/4 jobs |
| Hosting S15 — **EXCLUDED** | #72 | `ecb628d86271b6d1dc89288a7f800da86f8d3d16` | [41151417958](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41151417958) — **FAILURE** |

Q17 starts from the Q16 tree and copies **13 precise blob paths** from three disjoint source areas (E17: 3, F16/F17: 7, C14: 3), preserving the Q16 integration elsewhere. Source PRs remain draft. The Q17 commit has its **own** SHA and requires its own complete same-SHA CI; successful source runs cannot be substituted.

## S15 failure diagnosis (not included)

The S15 exact-head workflow's `Dependency-free source checks` job failed: 959/960 offline tests passed. The legacy `scripts/disposable-postgres-restore.test.mjs` mock supplies a fake `pg_restore --list` without TABLE/TABLE DATA, now rejected by S15's legitimate fail-closed archive preflight. Independent QA posted the exact failure and test-fixture remediation to PR #72. The separate dependency-remediation job also failed. Do not integrate S15 until fixed and fully green.

## Nine commercial launch gates (no external receipts)

| Gate | Acceptance status | Required independent evidence |
| --- | --- | --- |
| 1. Dependency security | BLOCKED | Final candidate dependency audit/SBOM, advisory disposition |
| 2. Locked build and CI (P0-01) | PENDING | Q17 exact-SHA complete workflow, critical steps, artifacts |
| 3. PostgreSQL two-tenant RLS (P0-02) | PENDING | Restricted-principal, deployed staging negative read/write and positive visibility |
| 4. Microsoft delegated OAuth (P0-04) | PENDING | Real Entra two-user consent, refresh, revoke, cross-user denial |
| 5. Stripe TEST lifecycle (P0-03) | BLOCKED | Seven real signed provider checkout/webhook/settlement scenarios |
| 6. Browser UAT | PENDING | Real desktop/375px, keyboard, customer flows, English/Arabic RTL |
| 7. Public HTTPS staging (P0-06) | PENDING | Public DNS/TLS, deployed immutable SHA, API/browser receipts |
| 8. Encrypted recovery (P0-05) | PENDING | Isolated encrypted restore, integrity, rollback, RTO/RPO receipts |
| 9. Support/legal | PENDING | Approved pricing, tax/trial, terms/privacy, refunds and staffed support |

CI-local Postgres/restore, API smoke, and source tests are valuable engineering evidence but not provider or public staging acceptance. **Official decision: NO-GO until every gate is independently accepted.** Requested deadline 2026-10-31 12:16 Asia/Riyadh is a sprint target only.

## Next steps

1. Confirm Q17 final exact-SHA four-job CI and critical step evidence, resolve regressions in review-only branch.
2. Revisit S15 once its final SHA is green; avoid duplicate fixes in parallel.
3. Obtain nonproduction provider and public staging receipts; do not invent acceptance or relax tenant, Stripe signature, secret, or recovery controls.
