# The EPMO — Stripe test-mode acceptance evidence (Phase 12)

This milestone adds a **read-only** verifier that contacts a deployed staging API and the Stripe test API. It does not create or process payments, invent events, change subscription records, or sign webhook requests. It is **not** a substitute for running the real integration.

## Preconditions

1. Deploy the Phase 12 API, Next.js app, and migrations through `0015_stripe_checkout_sessions` to **isolated staging PostgreSQL**. Reapply and verify tenant RLS as the restricted `pmo_app` role. Run the complete project build/typecheck, integration tests, and security tests in that environment.
2. Use **Stripe test-mode keys only** and a genuine Dashboard test-mode webhook destination (`POST /api/v1/billing/stripe-webhook`); use HTTPS and capture the actual webhook signing secret securely.
3. Create Tenant A and separate Tenant B, with different authorized administrator sessions and separate subscription records. Ensure both admins have `pmoa_platform` capability. Never run these steps against customer production data.
4. In Tenant A, create a renewal invoice and Stripe Checkout session with the application's normal UI. Keep the session **unpaid** until you have taken the baseline. Make sure it has not expired (Checkout status must be `open`).
5. Run this utility in the staging CI runner or an approved operator workstation with session tokens and the Stripe secret from a secure secret manager. No credentials are printed or written to the evidence file; avoid putting them into shell history or commits.

## Configuration

Inject all values using your secret manager; do not add real credentials to `.env` in your source tree:

| Environment variable | Value |
|---|---|
| `DEPLOYMENT_ENV` | `staging` (mandatory) |
| `STRIPE_SECRET_KEY` | Stripe `sk_test_...` (mandatory; live keys rejected) |
| `STRIPE_E2E_API_ORIGIN` | Public HTTPS API origin, e.g. `https://api-staging.theepmo.com` |
| `STRIPE_E2E_INVOICE_ID` | Tenant A open renewal invoice UUID |
| `STRIPE_E2E_SESSION_ID` | Recorded `cs_test_...` Checkout session |
| `STRIPE_E2E_TENANT_A_COOKIE` | Tenant A administrator's `pmo_session` cookie **value only** |
| `STRIPE_E2E_TENANT_B_COOKIE` | Different Tenant B administrator's `pmo_session` cookie **value only** |

Both tenant tokens must have access to their own billing endpoints. The verifier uses authenticated `GET` requests; it does not impersonate or alter sessions.

## Acceptance sequence

```bash
# First run offline, before connecting any real credentials:
node --test scripts/stripe-staging-evidence.test.mjs
node scripts/stripe-staging-preflight.mjs

# Run with the securely configured staging environment and the OPEN Checkout session:
node scripts/stripe-staging-evidence.mjs baseline ./stripe-test-baseline.json

# Now complete Checkout using a Stripe official test card in the staging browser.
# Wait for Stripe's real signed webhook and verify the invoice is marked paid.
node scripts/stripe-staging-evidence.mjs verify ./stripe-test-baseline.json

# After storing the verified evidence, redeliver that exact Stripe webhook
# event through the Stripe Dashboard/CLI (signed by Stripe), then run:
node scripts/stripe-staging-evidence.mjs replay-check ./stripe-test-baseline.json
```

`baseline` creates an exclusive, mode `0600` JSON file; `verify` writes a separate `.verified.json` file and **refuses to overwrite it**. These contain invoice/session IDs, times and amounts, but no API session cookies or Stripe secrets. Store them in a restricted audit artifact store and remove local copies according to your retention policy. Do not commit them to Git.

The verifier checks: Stripe test key and mode, correct Checkout session/invoice metadata, exact invoice/Stripe amount and currency, second-tenant absence of the invoice and payment ledger, pre-payment unpaid invoice, verified Stripe payment, one matching ledger payment, a single subscription-period extension, and invariance after a duplicate webhook is redelivered. It fails with nonzero exit status when evidence is missing or contradictory.

## Limits and outstanding release gates

- **This assistant's execution has no Stripe credentials, staging URL, sessions, or database access.** Only mocked HTTP tests were run during development; no real payment or webhook was sent.
- Verifies the latest 100 invoice/payment rows exposed by the API. The targeted invoice must be in this window.
- The tests of separate authenticated tenant views cannot prove PostgreSQL RLS policy correctness; run dedicated cross-tenant RLS tests in PostgreSQL as `pmo_app`.
- A single verified response does not prove every edge case. Exercise webhook retries under concurrency, out-of-order events, Stripe outages, refund/dispute handling and cancellation races separately before production.
- Stripe test-mode payment is not a real charge and does not enable production readiness by itself.
- Neither automatic recurring card charging nor refund/dispute reconciliation is implemented by this verifier.
