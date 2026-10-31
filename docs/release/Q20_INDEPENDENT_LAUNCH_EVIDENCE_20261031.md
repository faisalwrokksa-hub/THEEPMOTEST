# THE EPMO — Q20 independent integration evidence (2026-10-31)

**Release decision: NO-GO.** Official brand THE EPMO, canonical domain `theepmo.com`. This branch is review-only and is not authorization for production, DNS, paid hosting, real money or Entra admin consent.

## Immutable baseline and independently green source receipts

| Stream | PR | Exact SHA | GitHub Actions | Result | Changed source paths |
| --- | --- | --- | --- | --- | ---: |
| Q19 baseline | [#85](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/85) | `200abdf19fdfe32259c85a249b5d330aed4aff37` | [41161473739](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41161473739) | PASS 4/4 CI only | — |
| Engineering E20 | [#86](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/86) | `fd4bf3f311561f9a9662d2f5ac7c75dfbdb0bbc4` | [41162385789](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41162385789) | PASS 4/4 CI only | 3 |
| Frontend F21+F22 | [#88](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/88) | `5d850a910e7bee97d1de958aeea86054303e92ab` | [41163391284](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41163391284) | PASS 4/4 CI only | 9 |
| Commercial C17+C18 | [#90](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/90) | `7d814527a20b0dd0906333017f96f9748efe5ca6` | [41164040544](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41164040544) | PASS 4/4 CI only | 4 |
| Hosting S19 | [#91](https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/91) | `305fb02e4e4cd09538310eeb73f71520d62402a1` | [41165499290](https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41165499290) | PASS 4/4 CI only | 2 |

Each source run and its four job conclusions was independently inspected. Q20 applies **18 distinct source paths** onto the Q19 baseline using latest descendant snapshots. F21 and C17 intermediate patches are included in F22 and C18 file snapshots. No file-path overlaps between the four streams were observed. This is **not** a Git ancestry merge; new integrated CI is mandatory. A green source run is never a Q20 integrated PASS.

## P0-01..06 release requirements

| Gate | Current verified evidence | Outstanding acceptance |
| --- | --- | --- |
| P0-01 locked build/security | Q19 4/4 CI; Q20 source heads individually 4/4 | Q20 exact-final-SHA CI, full jobs/steps, dependency advisory disposition |
| P0-02 tenant RLS | CI-local PostgreSQL and tenant isolation on Q19 | Independent two-tenant staging restricted-role negative reads/writes and replay |
| P0-03 Stripe TEST | C18 source tests and CI only | Provider-backed TEST subscription checkout, signed webhook, replay, entitlement, failed payment, cancellation, cross-tenant denial: 0/7 accepted |
| P0-04 Microsoft | E20 upload SSRF source guard and CI only | Entra delegated two-user consent/refresh/revoke/cross-user denial receipts |
| P0-05 encrypted recovery | CI-local isolated restore and S19 offline DNS-plan guard | Encrypted isolated staging restore, integrity, rollback, reviewer evidence |
| P0-06 HTTPS staging | S19 offline DNS-plan validator only | Real public DNS/TLS, deployed exact SHA, web/API/browser smoke |

The **nine commercial gates** remain unaccepted: dependency security, CI/build, tenant RLS, Microsoft delegated OAuth, Stripe TEST, frontend journeys, HTTPS staging, backup/restore/rollback, support/legal. Real 375px mobile and desktop, keyboard, Arabic RTL, account recovery, pricing, tax, refunds, privacy, terms and staffed support must be independently accepted. Offline DNS-plan tests are not public DNS evidence.

## Release QA instructions

Run exact-final-SHA GitHub Actions after opening the review-only PR; inspect workflow head SHA, all four completed jobs and critical steps. Do not count queued, in-progress, skipped, partial or failed jobs as passed. Verify Q20 integration at its own SHA before claiming compatibility. Keep `docs/commercial-release-evidence.json` with `candidateSha: null`, nine non-PASS gates and `decision: NO-GO` until independently verified external receipts exist. Do not merge into main, deploy, change DNS, buy hosting, handle live payments, use customer data or approve Entra consent.
