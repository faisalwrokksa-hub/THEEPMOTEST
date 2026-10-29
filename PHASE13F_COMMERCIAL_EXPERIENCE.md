# The EPMO — Phase 13F: Commercial customer experience

This milestone improves the customer-facing billing screen using existing tenant-scoped APIs. It does **not** activate new subscriptions or collect card details directly.

## Delivered

- Current plan, subscription status, validity dates, and remaining trial days shown in English and Arabic.
- Published active plan catalogue with actual prices, billing intervals, and trial durations from `subscription_plans`. The catalogue is **read only**: displaying a plan does not change a subscription, and it does not claim specific module entitlements, taxes or binding quotations.
- Renewal invoices and Stripe-hosted Checkout remain intact. A Checkout return never activates a license; renewal requires the server to verify Stripe's signed event.
- Authorized workspace administrators can schedule cancellation at period end or undo a scheduled cancellation using the existing tenant-bound API. Forms use the web layer's same-origin mutation protection and cookie-forwarding pattern.
- Friendly customer FAQ about trials, payments, plan changes, and cancellations. The Getting Started page shows trial/expiry guidance to authorized administrators.
- Customer-facing how-to guides are available in `docs/customer/billing-guide.en.md` and `docs/customer/billing-guide.ar.md`.
- Simple presentation rules and tests for invalid dates, expired trials, and zero-decimal currencies (e.g., JPY).

## Customer workflow / سير العمل

1. Open **Billing & Renewals** / **الفوترة والتجديدات** (requires the `pmoa_platform` capability).
2. Review the current subscription and any remaining trial time.
3. Compare published prices; contact a platform administrator to request a plan change.
4. If renewal is eligible, create an invoice, then pay its open invoice using Stripe-hosted Checkout.
5. Return to the page and verify the paid invoice and active subscription only after the signed payment webhook is processed.
6. A workspace administrator may schedule cancellation or resume before the period ends. This is **not a refund**.

## Security and production boundaries

- All subscription management and invoice APIs determine tenant from the authenticated server context; user-input tenant IDs are not accepted.
- UI action visibility is advisory. API authorization and subscription transitions are authoritative.
- No live payment was taken and no live invitation email was sent during this milestone.
- The full application build, PostgreSQL migration execution and RLS tests, Stripe test-mode end-to-end workflow, and browser-based RTL/accessibility review are **not production verified**. Phase 12 release readiness remains deferred.

## Offline verification

From the repository root:

```bash
node --test apps/web/src/lib/subscription-display.test.mjs tests/phase13f-commercial-experience.test.mjs
npm run test:offline
npm run verify:static
npm run verify:migrations
```
