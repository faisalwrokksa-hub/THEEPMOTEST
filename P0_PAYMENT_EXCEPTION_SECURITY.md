# P0 payment exceptions — refund, dispute and late settlement safety

## Scope

This checkpoint adds a **source-level** signed Stripe exception pipeline, migration `0018_payment_exceptions.sql`, tenant-scoped billing exception history, and bilingual customer visibility. It does not initiate refunds or resolve disputes automatically.

- `charge.refunded` (partial or full): verifies raw-body signature, retrieves PaymentIntent with the configured Stripe secret, verifies server-authored tenant/invoice metadata, matches an existing recorded Stripe payment and exact original amount/currency, then records an append-only exception. **Only a full refund on the CURRENT active licensed period pauses access.** Partial refunds remain under manual review.
- `charge.dispute.created`: same verification; records exception and pauses ONLY the current active paid period.
- `charge.dispute.closed`: records event for manual review; **never automatically resumes service** even if won. This avoids reopening a license with unresolved incidents.
- Captured `checkout.session.completed` payments **after cancellation, voiding, or subscription replacement** are recorded as `ineligible_settlement` and acknowledged for reconciliation, rather than granting access or disappearing into endless retries. The session, tenant, invoice, amount and currency must match the invoice first.
- Replays are protected by `(provider, provider_event_id)` and the signed payload digest; event receipt and exception/entitlement write occur inside one DB transaction.
- Existing invoices/payments remain immutable histories. Customer admins can review exceptions at `GET /api/v1/subscription/billing/exceptions` and `/billing`.

## Operators: important manual steps

1. Configure Stripe webhooks for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed` to the **same signed endpoint**. Use a verified webhook secret.
2. Review new `billing_payment_exceptions` records regularly, correlate with Stripe Dashboard using provider event and PaymentIntent IDs, and decide case-by-case on refund, access restoration, credit or support follow-up. **There is no automatic refund or dispute resolution API.**
3. `ineligible_settlement` means funds may have been captured but **entitlements were intentionally not granted**. Investigate and manually refund or honor payment based on policy. Do not ignore these records.
4. Older Checkout sessions created **before PaymentIntent metadata was written** may not be automatically attributable via Stripe PaymentIntent retrieval. Fail closed and reconcile them in Stripe Dashboard; do not switch to a globally unscoped DB query.
5. Run `pnpm db:migrate`, then apply tenant RLS and grants through the documented database bootstrap process. Validate all seven financial tables under `pmo_app`.
6. The exception table is append-only for application identity. Incident resolution and refund issuance require separate audited operational procedures.
7. Existing live payment integration and database migrations are **NOT tested** here. Execute refunds, partial refunds, disputes and cancellation races with Stripe test-mode fixtures and real PostgreSQL before launch; verify no double entitlements or tenant crossover.

## Offline verification

- `npm run test:offline`
- `node scripts/verify-p0-payment-exceptions.mjs`
- `node scripts/verify-stripe-integration.mjs`
- `node scripts/verify-migration-chain.mjs`
- `npm run verify:static`

**Launch blockers:** Native Stripe staging tests, real PostgreSQL RLS/migration execution, full pnpm build, alerting/operational ownership, manual case-resolution workflow, tax/legal confirmation and merchant-account eligibility. There is no claim of production readiness.
