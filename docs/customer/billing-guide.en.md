# The EPMO — Subscription and billing guide

**Who can manage billing?** Workspace administrators with the `pmoa_platform` permission can open **Billing & Renewals**. If you cannot see it, ask your administrator.

1. **Check your plan.** Open Billing & Renewals to see the current plan, effective status, billing dates, and remaining trial time. Trial access is time-limited; a plan catalogue listing is not a license grant.
2. **Compare plans.** Prices and trial lengths reflect the current published catalogue. Ask the platform owner to confirm module entitlements, taxes, and commercial terms. Plan upgrades are not yet self-service.
3. **Create a renewal invoice.** If eligible, use **Create renewal invoice**. This step does not charge you or renew the subscription.
4. **Pay securely.** Click **Pay securely with Stripe** on the open invoice. Card details are entered on Stripe's hosted checkout, not in The EPMO.
5. **Verify payment.** Returning from Stripe is **not proof** of payment. The EPMO waits for a signed Stripe webhook before recording the payment and renewing the subscription. Refresh Billing & Renewals to see the final status.
6. **Cancel or resume.** An authorized administrator can schedule cancellation for the end of the current period and reverse that schedule before the period expires. Canceling does not automatically refund an invoice.

For billing disagreements or missing subscriptions, contact your workspace administrator or The EPMO platform owner. Never send payment card details or Stripe API secrets by email or chat.

**Release status:** These workflows have offline tests, but live Stripe, PostgreSQL, and staging validation remain pending.
