# Phase 12 — Next billing hardening increment

## Change

- `GET /api/v1/subscription/billing/reconciliation`: tenant administrator (`pmoa_platform`) read-only, within `withTenant` transaction and RLS. Examines newest 200 invoices and returns only invoice IDs with anomalies.
- Detects paid invoices without payment ledger entries, unpaid/void invoices with payments, amount/currency mismatches, paid timestamp inconsistencies, and overdue open renewal invoices. Returns `examined`, `truncated`, `flagged`, `settlementReconciledWithProvider: false`.
- Does **not** accept tenant identifiers or change licenses, invoices, or payment state. It does not verify charges against a payment gateway, and does not declare accounts healthy beyond the limited examination window.
- The **reference-only** HMAC webhook is now forbidden in production (boot-time and service-time checks) even if an operator accidentally enables it. Live payments require a verified provider-native adapter.
- No database migration required for this increment.

## Tests run

```
node --experimental-strip-types --test apps/api/src/platform/billing-reconciliation.test.mjs apps/api/src/platform/billing-policy.test.mjs
node --test packages/db/src/subscription-lifecycle.test.mjs packages/db/src/subscription-transitions.test.mjs
node scripts/verify-billing-reconciliation.mjs
node scripts/verify-billing-foundation.mjs
node scripts/verify-subscription-integrity.mjs
node scripts/verify-subscription-catalogue.mjs
node scripts/verify-release-static.mjs
```

Static checks cannot prove tenant isolation against a live Postgres instance. Do **not** enable production billing until staging migration, integration/security tests, PSP-native event verification, verified checkout, refunds/chargebacks, provider reconciliation, and accounting/tax/invoice compliance are completed. The repository has no installed monorepo dependencies in this environment; full Next/Nest/Drizzle typechecks remain unverified.

## Provider choice needed for the next payment milestone

Choose **Moyasar, HyperPay, or Stripe** (or a specific alternative). The provider determines checkout, verified webhook signature, event-to-invoice mapping, refund handling, and payment status reconciliation. Do not mistake the reference adapter for a real payment-provider integration.
