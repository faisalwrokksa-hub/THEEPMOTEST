# Q18 independent integration evidence — 2026-10-31

**THE EPMO · theepmo.com · RELEASE NO-GO.** Review-only candidate. No main merge, production deployment, DNS change, paid provisioning, live payment, production/customer data, secret exposure or Entra admin consent.

## Source and completed CI receipts

| Source | PR | Exact source head | GitHub Actions outcome |
| --- | --- | --- | --- |
| Q17 integrated baseline | #73 | `191556fe846381859f19692d80bc030c8c455ea4` | [41152057802](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41152057802) — 4/4 success |
| Engineering E18 (includes E17) | #74 | `898215a7f5e805f3f3ecae689c39c09bb207ec07` | [41153824219](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41153824219) — 4/4 success |
| Frontend F18 (includes F17) | #75 | `cef83a01a91841ed2ee057fcb0a9ac04530dc3e1` | [41154460792](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41154460792) — 4/4 success |
| Commercial C15 (includes C14) | #76 | `d9e4a2b144e53888773fdc9384f99d706d71ff68` | [41155445875](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41155445875) — 4/4 success |
| Hosting S15 + S16 repair | #77 | `9121fc21d72660668ad2116d44f2f3dfbde758d4` | [41156097644](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41156097644) — 4/4 success |

**Integration method:** created an isolated branch from exact Q17 SHA; copied complete source contents of 13 changed paths from the four latest green descendant heads, including corrected S15 restore preflight and S16 test fixture. Streams' changed paths are disjoint from one another; Q17 overlaps in RLS, Stripe policy and recovery boundary were intentionally superseded by their respective latest descendants. Original PRs remain open/draft; this is a new snapshot and **not** a Git merge of source commit histories.

**Q18 combined CI:** PENDING until GitHub Actions completes on the final head SHA after this evidence report. Never reuse source runs as proof of the combined candidate. Inspect all four jobs and critical steps including PostgreSQL restricted-principal RLS, restore, tests, API/web builds, Docker and CI-local browser/API smoke. Do not count a queued job as a pass.

## Nine release gates and P0 ownership

| Gate | Status | Owner / missing real-world receipt |
| --- | --- | --- |
| 1. Dependency security | BLOCKED | Engineering — final immutable SHA audit, SBOM/advisory disposition |
| 2. Locked CI/build (P0-01) | BLOCKED | Release QA — Q18 exact-SHA completed workflow and full critical steps |
| 3. Two-tenant PostgreSQL RLS (P0-02) | PENDING | Engineering — independent restricted-role staging negative read/write and replay |
| 4. Microsoft two-user delegated OAuth (P0-04) | PENDING | Engineering + Entra administrator — consent/refresh/revoke/cross-user denial |
| 5. Stripe TEST recurring billing (P0-03) | BLOCKED | Commercial — seven real provider subscription, signed webhook, replay, entitlement, failure, cancellation and tenant isolation scenarios |
| 6. Customer browser UAT | PENDING | Frontend — deployed 375px/desktop keyboard, signup/account, English/Arabic RTL |
| 7. Public HTTPS staging (P0-06) | PENDING | Hosting — actual DNS/TLS, immutable deployed SHA, health and API/browser receipts |
| 8. Encrypted restore and rollback (P0-05) | PENDING | Hosting — isolated staging encrypted snapshot restore, integrity, rollback, RTO/RPO |
| 9. Support/legal | PENDING | Business — approved pricing, taxes, trial, terms/privacy/refunds, staffed support |

**Stripe TEST provider scenarios: 0/7 accepted.** The machine-readable manifest keeps `candidateSha: null`, all nine gates non-PASS, and `decision: NO-GO`. A CI-local database restore is not independent encrypted disaster recovery. A green source CI does not prove external provider/browser/staging acceptance.

**Requested sprint deadline:** 2026-10-31 12:16 Asia/Riyadh. Deadline is a target, not a launch signoff. Main branch remains untouched.
