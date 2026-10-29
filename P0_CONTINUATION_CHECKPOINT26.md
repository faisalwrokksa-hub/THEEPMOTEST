# The EPMO — Checkpoint 26: P0 Evidence Gate Hardening
Date: 2026-10-29
Decision: **NO-GO for paid production launch**.

## Change
Extended `scripts/phase15e-release-evidence.mjs` launch receipt requirements with three additional explicit live gates:
- `microsoft_per_user_auth_live`: real provider-side per-user access validation
- `staging_deployment_live`: deployed staging HTTPS/API/browser validation
- `disaster_recovery_live`: staged restore/recovery rehearsal

The existing CI evidence gate already includes dependency-backed builds, real PostgreSQL RLS, backup/restore on disposable CI database and integration tests. Existing launch gates include Stripe test payment, invitation delivery, and bilingual browser review. These checks must be **actually run**. Self-reported receipts are not independent proof of successful external processing.

## Verification this turn
- Focused evidence-gate tests: passed (see `P0_TARGETED_TEST_LOG.txt`).
- Static release verifier: passed.
- Migration-chain verifier: passed.
- Full offline suite: attempted, but the run exceeded execution window; no overall PASS claimed (partial log retained).
- Runtime preflight: 1/5, blocked: pinned pnpm unavailable; workspace packages absent; DATABASE_URL absent; WEB_ORIGIN absent.
- Connected GitHub lists only `phone`, not The EPMO; therefore workflow cannot be started against EPMO through the connector.
- Stripe provider test, Microsoft OAuth, real staging RLS/deployment and external restore: NOT executed.

## Pending P0 acceptance
P0-01: Verify dependency-locked build and typecheck in real CI with reproducible run artifacts.
P0-02: Execute live PostgreSQL migrations and negative cross-tenant RLS tests.
P0-03: Execute Stripe sandbox lifecycle (success, failures, refunds/cancellations, webhook idempotence).
P0-04: Validate Microsoft OAuth per-user and least-privilege provider access.
P0-05: Execute and document staged off-site backup restore and rollback against defined RTO/RPO.
P0-06: Validate staging HTTPS, deployments, logs, authenticated user journeys and bilingual browser tests.

## Release rule
Any P0 missing or failed => NO-GO. Automatic approval is permitted only after six P0 outcomes are supported by inspectable external evidence; an offline green suite alone is insufficient. No production deployment or charge activation was initiated.

## Notification
An hourly conditional completion watch was created. It checks available GitHub sources and should only notify upon verifiable completion of all six P0 gates. Until the EPMO project is accessible through a connected repository and environments, the watch cannot certify completion or perform the missing work.
