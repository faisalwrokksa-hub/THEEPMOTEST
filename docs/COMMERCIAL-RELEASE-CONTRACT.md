# EPMO commercial release: customer lifecycle, handoffs, and evidence

**Decision: NO-GO until independently verified.** This file is an execution contract, not a claim that any flow currently works. No production deployment, branch merge, or live Stripe payment is authorized.

## Frozen customer-facing scope (P0)

| Journey | Frontend handoff (Frontend owner) | API and security handoff (Engineering owner) | Commercial acceptance (this track) |
| --- | --- | --- | --- |
| Landing and pricing | Clear plans, inclusions, currency, billing interval, taxes and trial limitations; visible terms and contact links | Server-sourced plan IDs and prices, never trust client-supplied price | Price shown equals server/Stripe test amount; terms approved |
| Signup and activation | Accessible signup, verification, onboarding, workspace creation, loading and error states | Auth, email/session checks, tenant binding, rate limiting, workspace and entitlement creation | Fresh test customer can activate without administrator intervention |
| Checkout | Authenticated TEST checkout launch, cancel/success/failure handling, no secrets in browser | Server creates session bound to authenticated tenant, plan and price; verified return URL | Successful and cancelled test sessions behave correctly |
| Webhooks and entitlement | Accurate pending/active/failed status; never unlock on success URL alone | Raw-body Stripe signature verification, replay-safe idempotency, tenant-scoped atomic updates | Test webhook creates one payment/entitlement, duplicate event has no second effect |
| Failed payment and renewal | Clear payment failure, retry and past-due UI | Explicit subscription state transitions and access rules; no cross-tenant writes | Test decline and renewal paths verified |
| Cancellation and access | Customer-visible cancel action, effective date, access and invoice history | Authorized cancel endpoint, proration/period-end policy, audit event | Cancellation and entitlement expiry follow published terms |
| Support and legal | Working support/contact link, privacy, terms and billing policies | Do not expose private tenant/customer data in public responses | Legal/support owner confirms content and contact route |

**Important current coverage distinction:** The existing `scripts/stripe-staging-evidence.mjs` verifies a **test-mode invoice payment/renewal** using a `checkout.session` in `mode: payment`. This is not by itself proof of recurring Stripe subscription checkout, first-customer signup, cancellation or failed-payment behavior. These are separate acceptance gates.

## Real acceptance sequence (never substitute mock tests for staging)

1. Engineering identifies a **single immutable candidate commit SHA** and passes frozen-lockfile install, production build/typecheck/tests, high/critical audit, real PostgreSQL tenant RLS negative tests and Microsoft per-user authorization tests.
2. Frontend verifies the same candidate in staging: signup, workspace onboarding, create/update project, portfolio dashboard, report, logout, mobile and keyboard paths.
3. Commercial verifies TEST keys and public HTTPS webhook configuration. Run `node scripts/stripe-staging-preflight.mjs` with staging-only environment variables, then complete actual Stripe test Checkout, signature-verified webhook, idempotent replay, tenant A/B isolation, payment failure, renewal and cancellation.
4. Collect real staging evidence with `node scripts/stripe-staging-evidence.mjs` and, where available, `node scripts/stripe-db-rls-audit.mjs`. Use the actual scripts' documented inputs; do not paste credentials or session cookies into commits, logs or screenshots.
5. Operations proves health checks, backup restoration and rollback against an isolated environment. Commercial validates pricing/legal/support content.
6. Populate `docs/commercial-release-evidence.json` **only with real artifacts**: each gate must reference the same SHA, a UTC execution timestamp, environment, HTTPS evidence artifact, reviewer and actual passing test result. For Stripe specify `mode: test`.
7. Run `node --test scripts/commercial-release-gate.test.mjs` for the manifest validator's own unit tests. Run `node scripts/commercial-release-gate.mjs` to check evidence completeness. A zero exit means **REVIEW-READY**, never an automatic GO or permission to deploy. The checker cannot independently authenticate artifact contents.
8. The release owner independently reviews each artifact, signs the decision and separately authorizes any merge, deployment or live payment activation.

## Mandatory external staging inputs (do not commit values)

- Stripe restricted **test** secret key and webhook signing secret; verified Stripe test account/webhook delivery access; staging public HTTPS API/web origins.
- Two isolated staging tenants and customer sessions; test invoice and checkout session; restricted `pmo_app` database access for read-only financial RLS audit.
- Entra test application and per-user OAuth consent/refresh/revoke access.
- Staging environment, DNS/TLS, test email delivery, isolated database backup and restoration access.
- Named business/legal/support approver and release owner.

If any input is absent, mark the related gate **BLOCKED** or **PENDING**, not PASS. Never use live credentials to satisfy a test-mode gate.

## Ownership and collision prevention

- **Commercial branch:** this release contract, evidence manifest, pricing/terms acceptance, commercial-specific tests and billing journey documentation.
- **Frontend branch:** customer-facing pages, accessible flows, visual QA and browser acceptance.
- **Engineering branch:** CI, backend billing/security/webhooks, RLS, Microsoft OAuth and operations.
- Shared interface changes require a documented API contract and separate owner review. Avoid parallel edits to the same file; integrate only after branch-specific tests and review.

## Evidence format and interpretation

Each `gates.<gate_id>` record requires:

```json
{
  "status": "PASS",
  "commitSha": "<40-character candidate SHA>",
  "artifactUrl": "https://github.com/<owner>/<repo>/actions/runs/<real-run-id>",
  "executedAtUtc": "2026-10-29T18:00:00Z",
  "environment": "staging",
  "reviewer": "<actual reviewer>",
  "testResult": "passed"
}
```

The Stripe record also requires `"mode": "test"`. This example illustrates shape only; it is **not evidence**. Do not add a PASS without the corresponding executed test and independently inspectable artifact.

**Release verdict remains NO-GO until all nine gates are complete and signed off.**

## Stripe scenario-level evidence required before review-ready

A single paid-invoice test does **not** prove the recurring paid-customer lifecycle. The `stripe_test_billing` gate must contain a `scenarios` object with evidence for each of these exact scenario IDs: `first_customer_subscription_checkout`, `webhook_signature_verified`, `webhook_replay_idempotent`, `entitlement_activation`, `failed_payment_access_policy`, `subscription_cancellation`, `cross_tenant_billing_isolation`. Each scenario needs `status: PASS`, the same candidate `commitSha`, an HTTPS `artifactUrl`, real UTC `executedAtUtc`, and `testResult: passed`. The gate must retain `mode: test`. The manifest must retain `decision: NO-GO`; this validator only makes it review-ready and cannot authorize release. No fabricated event IDs, tests, or artifacts.
