# P0 Payment Security — Checkpoint 4: Refunds, disputes, post-cancellation settlement

Baseline: `the-epmo-p0-payment-security-checkpoint3.zip` (613/613 reported offline tests).

## Source changes

- Tenant-scoped `billing_payment_exceptions` immutable event journal (`0018_payment_exceptions.sql`) with enforced RLS and append-only application grants.
- Signed Stripe webhook branch for full/partial refunds and dispute opened/closed events. PaymentIntent is independently fetched from Stripe to resolve tenant/invoice via server-authored Checkout metadata, then checked against recorded payment and currency/amount before any tenant data is written.
- Full refund or active dispute pauses only the matching current active billed subscription. Older periods, partial refunds, and closed disputes are logged without restoring or changing access.
- Ineligible but verified captured Checkout settlements are recorded for manual review rather than granted, including cancellation and replaced subscriptions.
- Customer billing administrators can view exception events via GET API and the bilingual billing interface.
- Updated migration journal, checksum manifest, Drizzle schema inventory, app grants, and financial RLS staging audit inventory.

## Verified locally (Node 22)

- `npm run test:offline`: **627/627 passed** (including 14 new exception-policy tests).
- `node scripts/verify-p0-payment-exceptions.mjs`: **10/10 passed** (source wiring checks).
- `node scripts/verify-stripe-integration.mjs`: **22/22 passed**.
- `npm run verify:static`: **8/8 passed**.
- `node scripts/verify-migration-chain.mjs`: **19/19 files consistent and SHA-256 pinned**.
- TypeScript compiler parser: changed TS/TSX syntax checks passed (not a typecheck or production build).
- ZIP CRC checked after packaging.

## Not verified / release blockers

- **No real PostgreSQL migration or RLS test.** Migration 0018 and post-migration RLS grants MUST run in staging before Stripe webhooks with reversals are enabled.
- **No real Stripe webhook, PaymentIntent fetch, API build, or webhook concurrency testing.** Behavior is only source-reviewed/offline-tested.
- Historical Stripe Checkout sessions may lack PaymentIntent tenant/invoice metadata; those reversals fail closed and require manual Stripe-to-ledger reconciliation.
- No automatic refund issuance, dispute response, settlement refund automation, case closure, or operator alert delivery. Manual operational review is required.
- No merchant eligibility, tax, legal or hosted product acceptance confirmation. **Not production-ready.**
