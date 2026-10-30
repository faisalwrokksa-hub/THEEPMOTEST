# Q06 — Independent release evidence (30 October 2026)

Candidate base SHA: `8d10b9eb1f41b040f38c930ac563abdc33449431`
Source: https://github.com/faisalwrokksa-hub/THEEPMOTEST/pull/21
CI: https://github.com/faisalwrokksa-hub/THEEPMOTEST/actions/runs/41057732192

## Verified from GitHub API

- `main`: `5c37382bbf42459ca5752ed5685b731dafba947f`.
- 20 open draft PRs (#2–#21); PR #21 targets `integration/p0-e05-f05-c05-q05-20261030`, not main.
- PR #21 run 41057732192: four successful jobs (source guards, audit, verify, dependency remediation candidate). Exact CI SHA is the base SHA above.
- `.github/workflows/ci.yml` triggers on pull requests and main pushes, has `contents: read`, and runs disposable PostgreSQL/Redis tests and API/web Docker builds.
- `.github/workflows/import-epmo.yml` has `contents: write` and can push to main when triggered; do not dispatch or modify this workflow in routine batches.

## Mandatory gates — fail closed

| Gate | Current evidence | Status | Next unblock |
|---|---|---|---|
| P0-01 build/security | CI run 41057732192, base SHA above | CI PASS; final release SHA pending | Re-run exact consolidated release candidate |
| P0-02 tenant/user RLS | Disposable PostgreSQL restricted-role and tenant tests in same CI run | CI PASS; staging unverified | Independently test two users and two tenants in authorized staging |
| P0-03 Stripe TEST | No independently verified provider receipt | BLOCKED | Authorized HTTPS staging, signed webhook, test checkout and cancellation receipts |
| P0-04 Entra | No real two-user consent/refresh/revoke receipt | BLOCKED | Authorized two-user test tenant |
| P0-05 recovery | Isolated CI restore passed | PARTIAL | Independently provisioned staging restore and rollback |
| P0-06 customer/operations | Compiled Next.js smoke passed in CI; no verified external browser, domain, email, legal/support acceptance | BLOCKED | Approved staging/browser and business acceptance |

No gate above is a production-launch PASS. NO-GO until all independent receipts and owner approval. No production actions authorized.

## Branch isolation

Q06 owns this evidence file only. E06, F06 and C06 must use separate review branches and avoid overlapping edits. Revalidate all SHAs and statuses before release integration.
