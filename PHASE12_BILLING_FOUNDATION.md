# The EPMO — Phase 12: billing and renewal foundation

## Included

- Migration `0014_billing_foundation.sql`: tenant-scoped invoices, append-only payment ledger, and signed-event receipts; composite tenant/subscription foreign keys; global uniqueness for payment/event ids; RLS on each table.
- Tenant admin APIs, under the authenticated session: `GET /api/v1/subscription/billing/invoices`, `GET /api/v1/subscription/billing/payments`, `POST /api/v1/subscription/billing/renewal-invoice`. Creating an invoice **never** changes entitlement. Requires `pmoa_platform` capability.
- Reference HMAC webhook `POST /api/v1/billing/reference-webhook` for adapter testing. **Disabled by default**. Enable only for controlled internal integration experiments; it is NOT compatible with any real PSP (Stripe, Moyasar, HyperPay, etc.) without a provider-native signature adapter and settlement verification.
- A verified, invoice-matched settlement atomically writes the payment, marks the invoice paid, renews the subscription, and records an audit event. Invoice creation is also audited. Duplicate provider event IDs do not renew twice.
- A webhook is rejected if it lacks a valid HMAC over its **raw bytes** and recent timestamp, or the amount, currency, tenant, subscription, invoice, or billing period fails to match.

## Configuration

`BILLING_REFERENCE_WEBHOOK_ENABLED=false` (default). When explicitly enabled, set `BILLING_REFERENCE_WEBHOOK_SECRET` to a distinct random secret **at least 32 bytes** and deliver it to the trusted reference event sender outside the application. Never expose the signing secret in browser code.

For controlled reference testing, send JSON with fields: `eventId`, `paymentId`, `eventType: "payment.succeeded"`, `tenantId`, `invoiceId`, `amountMinor`, `currency`. Headers: `x-billing-timestamp` (Unix seconds) and `x-billing-signature` (`v1=` followed by lowercase hex HMAC-SHA256 of `timestamp + '.' + raw_json_bytes`). Expiry tolerance: 5 minutes.

A **genuine payment processor integration is still required** before treating any customer charge as verified. Do not enable the reference adapter in production until an independently secured, trusted event source and its reconciliation responsibilities are reviewed. This mechanism is a testable signing contract, not a native gateway webhook.

## Migration and deployment

1. Back up the PostgreSQL database and take a staging copy. Never run `drizzle-kit push --force` against production data.
2. Apply migrations `0011` through `0014` using the repository's controlled admin migration flow (`pnpm db:migrate`) and the final migration journal; ensure earlier migrations `0000`–`0010` have been applied. Run `pnpm db:rls` afterward with the admin connection.
3. Run `pnpm verify:rls` and explicitly verify `billing_invoices`, `billing_payments`, `billing_webhook_receipts` as `pmo_app` for two tenants and an unset tenant; verify the app role cannot update/delete payment and receipt rows.
4. Run `pnpm build && pnpm typecheck && pnpm test` with installed dependencies. Run the focused tests with `node --experimental-strip-types --test apps/api/src/platform/billing-policy.test.mjs`.
5. Verify all billing routes, failed/duplicate webhook events, tenant isolation, migration rollback procedure, monitoring, tax calculation, invoicing compliance and live gateway reconciliation before deployment.

## Deliberately not complete

No native payment provider, hosted checkout, tax invoice PDFs, refunds, proration, dunning/retry scheduler, payment-status reconciliation, legal invoice numbering, or live database integration testing. Zero-price renewals require a separately approved plan policy. Existing customer subscriptions and module entitlements are not silently altered.
