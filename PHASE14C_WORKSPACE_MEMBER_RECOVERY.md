# Phase 14C — Workspace member recovery and account isolation

## Problem fixed
The workspace member PATCH endpoint previously updated `users.is_active` (a global account flag), unintentionally suspending a person across every tenant. This is a multi-tenant isolation issue, not merely a UI error.

## Change
- SQL migration `0017_tenant_membership_status.sql` adds `memberships.is_active NOT NULL DEFAULT true` (no existing user loses access on upgrade).
- Member PATCH now modifies the current tenant's membership and never writes `users.is_active`. Existing account-level suspension remains global and separate.
- Session principal resolution, tenant switching, dev header auth, onboarding counts, assignment pickers and notifications ignore inactive memberships.
- A transaction-scoped advisory lock serializes competing member-status updates, and the last active owner cannot be disabled or demoted through member management. This is a safety fallback, not a substitute for a recovery runbook.
- The member update endpoint validates UUIDs and accepts JSON booleans rather than coercing arbitrary strings.

## API error recovery

- The Next.js create proxy now returns HTTP 503 and a short Retry-After hint if the upstream API is unreachable. It handles JSON-enhanced and no-JavaScript form submissions without exposing backend connection details.
- The shared bilingual create form retains entered values and displays a localized temporary-outage message rather than losing the submission.

## Acceptance scenarios on live staging (not yet executed)
1. Create a user who belongs to tenant A and B; suspend their membership in A.
2. Verify an existing A session is denied, and A is absent from a fresh login's tenant list. A tenant switch is refused.
3. Verify B remains accessible to the same user, including a new session.
4. Reactivate in A; verify a fresh login and subsequent tenant switch succeed.
5. Verify disabled members cannot be assigned to new tasks/gates or selected in creation pickers; historical approvals remain visible.
6. Verify suspending or demoting the only active owner returns HTTP 409 and does not write a status change.
7. Run migration `0017` using the canonical SQL ledger on PostgreSQL and rerun full integration and RLS checks.

**Verification limits:** Offline checks only; full TypeScript build and live PostgreSQL integration are not available in this runtime.
