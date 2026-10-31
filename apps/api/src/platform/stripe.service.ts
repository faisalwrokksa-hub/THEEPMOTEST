import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { withTenant } from '@pmo/db';
import { currentContext } from '../tenancy/tenant-context';
import { requiresSecureTransport } from '../common/deployment-policy';
import { requireCapability } from '../common/require-capability';
import { sha256 } from './billing-policy';
import { assertRecurringStripePrice, assertCreatedRecurringCheckout, stripeRecurringCheckoutParams, stripeRecurringIdempotencyKey, type RecurringPlan } from './stripe-recurring-policy';
import { parsePaidRecurringInvoice } from './stripe-recurring-invoice';
import { recurringInvoicePaymentIntentId } from './stripe-recurring-payment-reference';
import { assertRecurringProviderSettlement, type TrustedRecurringBinding } from './stripe-recurring-reconciliation';
import { assertRecurringLocalSettlement } from './stripe-recurring-local-settlement';
import { parseFailedRecurringInvoice, failedInvoicePaymentIntentId, assertFailedRecurringProvider, type FailedRecurringInvoiceCandidate } from './stripe-recurring-failed-invoice';
import { parseRecurringCancellation, assertRecurringCancellationProvider, type RecurringCancellationCandidate } from './stripe-recurring-cancellation';
import { parseSignedRecurringCheckout, assertRecurringCheckoutBinding, type RecurringCheckoutCandidate } from './stripe-recurring-checkout-binding';
import { assertStripeSettlement, assertStripePaymentInvoiceMatch, assertStripeExceptionIntent, parsePaidStripeEvent, parseUnpaidStripeCheckoutEvent, parseStripePaymentException, shouldPauseOnPaymentException, refundCoversPaidInvoice, stripeCheckoutIdempotencyKey, stripeCheckoutParams, stripeCheckoutReferenceValid, stripeCreatedSessionIsPending, stripeCachedCheckoutDisposition, stripeApiFetch, readStripeApiJson, stripeDeploymentModeAllowed, STRIPE_PROVIDER, verifyStripeSignature } from './stripe-policy';

const rows = (value: unknown) => value as any[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function stripeConfig() {
  const key = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (process.env.STRIPE_ENABLED !== 'true' || !key || !/^sk_(test|live)_[A-Za-z0-9]+$/.test(key) ||
      !webhookSecret || !/^whsec_[A-Za-z0-9]{16,}$/.test(webhookSecret))
    throw new ServiceUnavailableException('Stripe is not configured');
  if (!stripeDeploymentModeAllowed(key.startsWith('sk_live_'), process.env.NODE_ENV,
      process.env.DEPLOYMENT_ENV, process.env.STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION))
    throw new ServiceUnavailableException('Production Stripe requires a live key unless staging test mode is explicitly enabled');
  return { key, webhookSecret, liveMode: key.startsWith('sk_live_') };
}

/** Only server configuration defines redirect destinations; the browser cannot override them. */
function checkoutRedirects() {
  const origin = (process.env.WEB_ORIGIN || '').split(',')[0]?.trim();
  if (!origin) throw new ServiceUnavailableException('WEB_ORIGIN is missing');
  let base: URL;
  try { base = new URL(origin); }
  catch { throw new ServiceUnavailableException('Invalid configured web origin'); }
  if (!['http:', 'https:'].includes(base.protocol) || base.origin !== origin ||
      (requiresSecureTransport(process.env.NODE_ENV, process.env.DEPLOYMENT_ENV) && base.protocol !== 'https:'))
    throw new ServiceUnavailableException('Invalid configured web origin');
  return { success: `${origin}/billing?billing=success`, cancel: `${origin}/billing?billing=cancelled` };
}

@Injectable()
export class StripeBillingService {

  /**
   * C29: server-side, TEST-only first-customer recurring Checkout preparation.
   * Intentionally NOT exposed by the billing controller: signed subscription
   * binding and invoice settlement must be wired before customer activation.
   * A previous attempt is never silently retried: Stripe may have collected
   * funds even if its webhook has not yet reached this service.
   */
  async prepareRecurringCheckout() {
    requireCapability('pmoa_admin');
    const { tenantId, userId } = currentContext();
    const config = stripeConfig();
    if (config.liveMode || process.env.DEPLOYMENT_ENV === 'production' ||
        process.env.STRIPE_RECURRING_CHECKOUT_ENABLED !== 'true')
      throw new ServiceUnavailableException('Recurring Checkout is TEST-only and disabled');
    const urls = checkoutRedirects();
    let priceMap: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(process.env.STRIPE_RECURRING_PRICE_IDS || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('Invalid Stripe Price configuration');
      priceMap = parsed as Record<string, unknown>;
    } catch { throw new ServiceUnavailableException('Recurring Stripe Prices are not configured'); }

    return withTenant(tenantId, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1212, hashtext(${tenantId}))`);
      const current = rows(await tx.execute(sql`
        SELECT s.id, s.status, s.cancel_at_period_end AS "cancelAtPeriodEnd",
               s.trial_ends_at AS "trialEndsAt",
               p.id AS "planId", p.code, p.price_minor AS "priceMinor",
               p.currency, p.billing_interval AS "billingInterval",
               p.trial_days AS "trialDays", p.is_active AS "isActive"
        FROM tenant_subscriptions s
        JOIN subscription_plans p ON p.id = s.plan_id
        WHERE s.tenant_id = ${tenantId}
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT 1 FOR UPDATE OF s`))[0];
      if (!current || current.status !== 'trialing' || current.cancelAtPeriodEnd ||
          (current.trialEndsAt && new Date(current.trialEndsAt).getTime() > Date.now()))
        throw new ConflictException('Subscription is not eligible for first-customer Checkout');
      const prior = rows(await tx.execute(sql`
        SELECT EXISTS (
          SELECT 1 FROM billing_stripe_recurring_checkout_sessions
          WHERE tenant_id = ${tenantId} AND subscription_id = ${current.id}
        ) OR EXISTS (
          SELECT 1 FROM billing_stripe_recurring_bindings
          WHERE tenant_id = ${tenantId} AND subscription_id = ${current.id}
        ) OR EXISTS (
          SELECT 1 FROM billing_invoices
          WHERE tenant_id = ${tenantId} AND subscription_id = ${current.id}
        ) AS "alreadyStarted"`))[0];
      if (prior?.alreadyStarted)
        throw new ConflictException('Subscription already has a billing attempt; reconcile before retry');
      const plan: RecurringPlan = {
        id: current.planId, code: current.code, priceMinor: current.priceMinor,
        currency: current.currency, billingInterval: current.billingInterval,
        trialDays: current.trialDays, isActive: current.isActive,
      };
      const configuredPrice = Object.hasOwn(priceMap, plan.code) ? priceMap[plan.code] : null;
      if (typeof configuredPrice !== 'string' || !/^price_[A-Za-z0-9]+$/.test(configuredPrice))
        throw new ServiceUnavailableException('No authorized recurring Stripe Price for plan');
      let priceResponse: Response;
      try {
        priceResponse = await stripeApiFetch(
          `https://api.stripe.com/v1/prices/${configuredPrice}`, {
            headers: { Authorization: `Bearer ${config.key}` },
            signal: AbortSignal.timeout(12_000),
          });
      } catch { throw new BadGatewayException('Recurring Stripe Price lookup failed'); }
      if (!priceResponse.ok)
        throw new BadGatewayException('Recurring Stripe Price could not be verified');
      let price: unknown;
      try { price = await readStripeApiJson(priceResponse); }
      catch { throw new BadGatewayException('Invalid recurring Stripe Price response'); }
      let verifiedPrice: ReturnType<typeof assertRecurringStripePrice>;
      try { verifiedPrice = assertRecurringStripePrice(price, plan, configuredPrice, false); }
      catch { throw new ConflictException('Configured Stripe Price does not match the subscription plan'); }

      const params = stripeRecurringCheckoutParams(plan, tenantId, verifiedPrice,
        false, urls.success, urls.cancel);
      let checkoutResponse: Response;
      try {
        checkoutResponse = await stripeApiFetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.key}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Idempotency-Key': stripeRecurringIdempotencyKey(tenantId, plan.id, 0) },
          body: params.toString(), signal: AbortSignal.timeout(12_000),
        });
      } catch { throw new BadGatewayException('Recurring Stripe Checkout request failed'); }
      if (!checkoutResponse.ok)
        throw new BadGatewayException('Recurring Stripe Checkout could not be created');
      let session: any;
      try { session = await readStripeApiJson(checkoutResponse); }
      catch { throw new BadGatewayException('Invalid recurring Stripe Checkout response'); }
      let reference: ReturnType<typeof assertCreatedRecurringCheckout>;
      try { reference = assertCreatedRecurringCheckout(session, plan, tenantId, false); }
      catch { throw new BadGatewayException('Recurring Stripe Checkout response failed validation'); }
      const created = rows(await tx.execute(sql`
        INSERT INTO billing_stripe_recurring_checkout_sessions
          (tenant_id, subscription_id, plan_id, stripe_price_id,
           stripe_session_id, checkout_url, live_mode, expires_at)
        VALUES (${tenantId}, ${current.id}, ${plan.id}, ${verifiedPrice.priceId},
                ${reference.sessionId}, ${reference.url}, false,
                to_timestamp(${session.expires_at}))
        ON CONFLICT (stripe_session_id) DO NOTHING RETURNING id`));
      if (!created.length)
        throw new ConflictException('Recurring Stripe Checkout session was already recorded');
      await tx.execute(sql`INSERT INTO subscription_events
        (tenant_id, subscription_id, actor_user_id, event_type, details)
        VALUES (${tenantId}, ${current.id}, ${userId},
                'billing.stripe_recurring_checkout_created',
                ${JSON.stringify({ stripeSessionId: reference.sessionId,
                  planId: plan.id, stripePriceId: verifiedPrice.priceId })}::jsonb)`);
      return { subscriptionId: current.id, planId: plan.id,
        sessionId: reference.sessionId, url: reference.url,
        expiresAt: new Date(session.expires_at * 1000).toISOString(),
        recurring: true, paymentVerified: false };
    });
  }

  /** Authenticated customer administrator creates hosted checkout for an existing renewal invoice. */
  async createCheckout(invoiceId: string) {
    requireCapability('pmoa_admin');
    if (!UUID.test(invoiceId)) throw new BadRequestException('Invalid invoice ID');
    const { tenantId, userId } = currentContext();
    const config = stripeConfig();
    const urls = checkoutRedirects();
    return withTenant(tenantId, async tx => {
      // Serialize with invoice generation, cancellation, manual grant, and webhook settlement.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1212, hashtext(${tenantId}))`);
      const invoice = rows(await tx.execute(sql`
        SELECT i.id, i.tenant_id AS "tenantId", i.subscription_id AS "subscriptionId",
               i.amount_minor AS "amountMinor", i.currency, i.status,
               i.period_starts_at AS "periodStartsAt", i.period_ends_at AS "periodEndsAt",
               s.status AS "subscriptionStatus", s.cancel_at_period_end AS "cancelAtPeriodEnd",
               s.period_ends_at AS "subscriptionPeriodEndsAt"
        FROM billing_invoices i JOIN tenant_subscriptions s
          ON s.id = i.subscription_id AND s.tenant_id = i.tenant_id
        WHERE i.tenant_id = ${tenantId} AND i.id = ${invoiceId} FOR UPDATE OF i, s`))[0];
      if (!invoice) throw new NotFoundException('Invoice not found for this workspace');
      if (invoice.status !== 'open' || !['active', 'trialing', 'past_due'].includes(invoice.subscriptionStatus) ||
          invoice.cancelAtPeriodEnd || new Date(invoice.subscriptionPeriodEndsAt).getTime() !== new Date(invoice.periodStartsAt).getTime())
        throw new ConflictException('Invoice is not eligible for checkout');
      const latest = rows(await tx.execute(sql`
        SELECT id FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC, id DESC LIMIT 1`))[0];
      if (!latest || latest.id !== invoice.subscriptionId)
        throw new ConflictException('Invoice belongs to a previous subscription');

      // A Stripe-signed async failure or expiry is terminal even if the
      // originally recorded expires_at is still in the future. Exclude such
      // sessions from reuse using the append-only, tenant-scoped event ledger:
      // never rewrite the historical Stripe session expiry or its payment URL.
      const existing = rows(await tx.execute(sql`
        SELECT s.stripe_session_id AS "sessionId", s.checkout_url AS url,
               s.expires_at AS "expiresAt" FROM billing_stripe_checkout_sessions s
        WHERE s.tenant_id = ${tenantId} AND s.invoice_id = ${invoiceId}
          AND s.expires_at > now() + interval '60 seconds'
          AND NOT EXISTS (
            SELECT 1 FROM subscription_events e
            WHERE e.tenant_id = s.tenant_id
              AND e.subscription_id = ${invoice.subscriptionId}
              AND e.event_type = 'billing.stripe_checkout_unpaid'
              AND e.details ->> 'stripeSessionId' = s.stripe_session_id
          )
        ORDER BY s.created_at DESC, s.id DESC LIMIT 1`))[0];
      if (existing) {
        // Reused database references cross the same outbound payment-navigation
        // boundary as a fresh Stripe response. Never return a corrupted URL or
        // a session ID from the wrong Stripe TEST/LIVE mode.
        if (!stripeCheckoutReferenceValid(existing.url, existing.sessionId) ||
            typeof existing.sessionId !== 'string' ||
            !/^cs_(test_|live_)[A-Za-z0-9]+$/.test(existing.sessionId) ||
            existing.sessionId.startsWith('cs_live_') !== config.liveMode)
          throw new ConflictException('Stored Stripe Checkout reference failed validation');
        // The webhook may be delayed: the database expiry alone does not prove
        // that the hosted session is still payable. Verify its live TEST-mode
        // state directly with Stripe before reusing any cached payment URL.
        let remoteResponse: Response;
        try {
          remoteResponse = await stripeApiFetch(
            `https://api.stripe.com/v1/checkout/sessions/${existing.sessionId}`, {
              headers: { Authorization: `Bearer ${config.key}` },
              signal: AbortSignal.timeout(12_000),
            });
        } catch { throw new BadGatewayException('Stripe Checkout status could not be verified'); }
        if (!remoteResponse.ok)
          throw new BadGatewayException('Stripe Checkout status lookup failed');
        let remoteSession: unknown;
        try { remoteSession = await readStripeApiJson(remoteResponse); }
        catch { throw new BadGatewayException('Invalid Stripe Checkout status response'); }
        let disposition: 'reusable' | 'expired' | 'pending_settlement';
        try {
          disposition = stripeCachedCheckoutDisposition(remoteSession, {
            sessionId: existing.sessionId, invoiceId, tenantId,
            amountMinor: invoice.amountMinor, currency: invoice.currency, liveMode: config.liveMode,
          });
        } catch { throw new ConflictException('Stored Stripe Checkout state failed validation'); }
        if (disposition === 'pending_settlement')
          throw new ConflictException('Stripe payment is awaiting signed reconciliation');
        if (disposition === 'reusable') {
          return { invoiceId, sessionId: existing.sessionId, url: existing.url,
            expiresAt: existing.expiresAt, reused: true, paymentVerified: false };
        }
        // A provider-confirmed expired session may be retried with the next
        // attempt key. Do not mutate the historical Checkout/session ledger.
      }

      // Stripe caches requests by idempotency key. A fixed invoice-only key
      // would return the *expired* session after a customer retries checkout.
      // Count previously persisted attempts under the tenant advisory lock;
      // retries following an HTTP timeout reuse the same attempt/key.
      const attempts = rows(await tx.execute(sql`
        SELECT COUNT(*)::int AS "count" FROM billing_stripe_checkout_sessions
        WHERE tenant_id = ${tenantId} AND invoice_id = ${invoiceId}`))[0]?.count;
      const idempotencyKey = stripeCheckoutIdempotencyKey(invoiceId, attempts);
      const params = stripeCheckoutParams(invoice, urls.success, urls.cancel);
      let response: Response;
      try {
        response = await stripeApiFetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/x-www-form-urlencoded',
            'Idempotency-Key': idempotencyKey },
          body: params.toString(), signal: AbortSignal.timeout(12_000),
        });
      } catch { throw new BadGatewayException('Stripe Checkout request failed'); }
      if (!response.ok) throw new BadGatewayException('Stripe Checkout could not be created');
      let session: any;
      try { session = await readStripeApiJson(response); }
      catch { throw new BadGatewayException('Invalid Stripe Checkout response'); }
      const url = session && typeof session.url === 'string' ? session.url : '';
      if (!session || !stripeCheckoutReferenceValid(url, session.id) || !stripeCreatedSessionIsPending(session) ||
          session.object !== 'checkout.session' ||
          session.livemode !== config.liveMode ||
          typeof session.id !== 'string' || !/^cs_(test_|live_)[A-Za-z0-9]+$/.test(session.id) ||
          (config.liveMode && !session.id.startsWith('cs_live_')) ||
          (!config.liveMode && !session.id.startsWith('cs_test_')) ||
          !Number.isSafeInteger(session.expires_at) || session.expires_at * 1000 <= Date.now() + 60_000 ||
          session.client_reference_id !== invoiceId || session.metadata?.tenantId !== tenantId ||
          session.metadata?.invoiceId !== invoiceId || session.amount_total !== invoice.amountMinor ||
          session.currency !== invoice.currency.toLowerCase() || session.mode !== 'payment')
        throw new BadGatewayException('Stripe Checkout response failed invoice validation');
      const inserted = rows(await tx.execute(sql`
        INSERT INTO billing_stripe_checkout_sessions
          (tenant_id, invoice_id, stripe_session_id, checkout_url, expires_at)
        VALUES (${tenantId}, ${invoiceId}, ${session.id}, ${url},
                to_timestamp(${session.expires_at}))
        ON CONFLICT (stripe_session_id) DO NOTHING RETURNING id`));
      if (!inserted.length) {
        const recorded = rows(await tx.execute(sql`
          SELECT tenant_id AS "tenantId", invoice_id AS "invoiceId" FROM billing_stripe_checkout_sessions
          WHERE tenant_id = ${tenantId} AND stripe_session_id = ${session.id}`))[0];
        if (!recorded || recorded.invoiceId !== invoiceId)
          throw new ConflictException('Stripe session was already assigned elsewhere');
      } else {
        await tx.execute(sql`INSERT INTO subscription_events
          (tenant_id, subscription_id, actor_user_id, event_type, details)
          VALUES (${tenantId}, ${invoice.subscriptionId}, ${userId}, 'billing.stripe_checkout_created',
                  ${JSON.stringify({ invoiceId, stripeSessionId: session.id })}::jsonb)`);
      }
      return { invoiceId, sessionId: session.id, url,
        expiresAt: new Date(session.expires_at * 1000).toISOString(), reused: !inserted.length, paymentVerified: false };
    });
  }

  /** Stripe's refund/dispute objects have no reliable tenant context. We retrieve
   * the PaymentIntent using server credentials and validate its immutable
   * server-authored Checkout metadata before opening any tenant transaction. */
  private async handlePaymentException(event: NonNullable<ReturnType<typeof parseStripePaymentException>>,
                                       digest: string, config: ReturnType<typeof stripeConfig>) {
    let response: Response;
    try {
      response = await stripeApiFetch(`https://api.stripe.com/v1/payment_intents/${event.paymentIntent}`, {
        headers: { Authorization: `Bearer ${config.key}` }, signal: AbortSignal.timeout(12_000),
      });
    } catch { throw new BadGatewayException('Unable to verify Stripe payment exception'); }
    if (!response.ok) throw new BadGatewayException('Stripe PaymentIntent lookup failed');
    let intent: unknown;
    try { intent = await readStripeApiJson(response); }
    catch { throw new BadGatewayException('Invalid Stripe PaymentIntent response'); }
    let ref: { tenantId: string; invoiceId: string };
    try { ref = assertStripeExceptionIntent(intent, event, config.liveMode); }
    catch { throw new ConflictException('Payment exception requires manual Stripe reconciliation'); }
    const { tenantId, invoiceId } = ref;
    return withTenant(tenantId, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1212, hashtext(${tenantId}))`);
      // The intent MUST already be one of our settled payments. Otherwise do
      // not acknowledge the event as handled: surface it for operator action.
      const matched = rows(await tx.execute(sql`
        SELECT p.id, p.amount_minor AS "amountMinor", p.currency,
               i.subscription_id AS "subscriptionId", i.period_ends_at AS "periodEndsAt"
        FROM billing_payments p JOIN billing_invoices i
          ON i.tenant_id = p.tenant_id AND i.id = p.invoice_id
        WHERE p.tenant_id = ${tenantId} AND p.invoice_id = ${invoiceId}
          AND p.provider = ${STRIPE_PROVIDER} AND p.provider_payment_id = ${event.paymentIntent}
        FOR UPDATE OF p, i`))[0];
      if (!matched || matched.currency !== event.currency || event.amountMinor > matched.amountMinor ||
          (intent as { amount?: number }).amount !== matched.amountMinor)
        throw new ConflictException('Stripe refund/dispute requires payment reconciliation');
      const receipt = rows(await tx.execute(sql`
        INSERT INTO billing_webhook_receipts
          (tenant_id, invoice_id, provider, provider_event_id, payload_sha256)
        VALUES (${tenantId}, ${invoiceId}, ${STRIPE_PROVIDER}, ${event.eventId}, ${digest})
        ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`));
      if (!receipt.length) {
        const duplicate = rows(await tx.execute(sql`
          SELECT invoice_id AS "invoiceId", payload_sha256 AS "digest"
          FROM billing_webhook_receipts WHERE tenant_id = ${tenantId}
            AND provider = ${STRIPE_PROVIDER} AND provider_event_id = ${event.eventId}`))[0];
        if (!duplicate || duplicate.invoiceId !== invoiceId || duplicate.digest !== digest)
          throw new ConflictException('Stripe exception event identity was reused');
        return { received: true, applied: false, duplicate: true };
      }
      const latest = rows(await tx.execute(sql`
        SELECT id, status, period_ends_at AS "periodEndsAt"
        FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`))[0];
      const affected = latest?.id === matched.subscriptionId ? latest : rows(await tx.execute(sql`
        SELECT id, status, period_ends_at AS "periodEndsAt"
        FROM tenant_subscriptions WHERE tenant_id = ${tenantId} AND id = ${matched.subscriptionId}
        FOR UPDATE`))[0];
      // A complete refund of a single Stripe charge is not necessarily a refund
      // of the full paid invoice. Never revoke the entitlement for that case.
      const refundCoversInvoice = event.type !== 'full_refund' ||
        refundCoversPaidInvoice(event.amountMinor, matched.amountMinor);
      const pause = !!affected && refundCoversInvoice && shouldPauseOnPaymentException(event.type,
        affected, { subscriptionId: matched.subscriptionId, periodEndsAt: matched.periodEndsAt },
        latest?.id || '');
      await tx.execute(sql`
        INSERT INTO billing_payment_exceptions
          (tenant_id, invoice_id, provider, provider_event_id, provider_payment_id,
           exception_type, amount_minor, currency, subscription_paused, details)
        VALUES (${tenantId}, ${invoiceId}, ${STRIPE_PROVIDER}, ${event.eventId}, ${event.paymentIntent},
                ${event.type}, ${event.amountMinor}, ${event.currency}, ${pause},
                ${JSON.stringify({ providerObjectId: event.providerObjectId,
                  fullInvoiceRefund: event.type === 'full_refund' ? refundCoversInvoice : null })}::jsonb)`);
      if (pause) {
        await tx.execute(sql`UPDATE tenant_subscriptions
          SET status = 'paused', updated_at = now()
          WHERE tenant_id = ${tenantId} AND id = ${matched.subscriptionId} AND status = 'active'`);
      }
      await tx.execute(sql`INSERT INTO subscription_events
        (tenant_id, subscription_id, event_type, details)
        VALUES (${tenantId}, ${matched.subscriptionId}, 'billing.payment_exception_detected',
          ${JSON.stringify({ invoiceId, provider: STRIPE_PROVIDER, eventId: event.eventId,
            type: event.type, subscriptionPaused: pause })}::jsonb)`);
      // Closing a dispute never automatically reactivates a paused tenant.
      return { received: true, applied: true, needsReview: true, subscriptionPaused: pause };
    });
  }

  /** Signed asynchronous failures and expired sessions are auditable, never a grant.
   * Invoice stays open for a fresh Checkout attempt; a later paid invoice stays paid.
   */
  private async recordUnpaidCheckout(
    event: NonNullable<ReturnType<typeof parseUnpaidStripeCheckoutEvent>>, digest: string) {
    const { session, eventId, reason } = event;
    const tenantId = session.metadata!.tenantId!;
    const invoiceId = session.metadata!.invoiceId!;
    return withTenant(tenantId, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1212, hashtext(${tenantId}))`);
      const matched = rows(await tx.execute(sql`
        SELECT i.subscription_id AS "subscriptionId", i.amount_minor AS "amountMinor",
               i.currency
        FROM billing_stripe_checkout_sessions s
        JOIN billing_invoices i ON i.tenant_id = s.tenant_id AND i.id = s.invoice_id
        WHERE s.tenant_id = ${tenantId} AND s.invoice_id = ${invoiceId}
          AND s.stripe_session_id = ${session.id}
        FOR UPDATE OF i`))[0];
      if (!matched || matched.amountMinor !== session.amount_total ||
          matched.currency !== session.currency!.toUpperCase())
        throw new ConflictException('Stripe Checkout failure does not match a recorded invoice');
      const receipt = rows(await tx.execute(sql`
        INSERT INTO billing_webhook_receipts
          (tenant_id, invoice_id, provider, provider_event_id, payload_sha256)
        VALUES (${tenantId}, ${invoiceId}, ${STRIPE_PROVIDER}, ${eventId}, ${digest})
        ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`));
      if (!receipt.length) {
        const duplicate = rows(await tx.execute(sql`
          SELECT invoice_id AS "invoiceId", payload_sha256 AS "digest"
          FROM billing_webhook_receipts WHERE tenant_id = ${tenantId}
            AND provider = ${STRIPE_PROVIDER} AND provider_event_id = ${eventId}`))[0];
        if (!duplicate || duplicate.invoiceId !== invoiceId || duplicate.digest !== digest)
          throw new ConflictException('Stripe Checkout failure event identity was reused');
        return { received: true, applied: false, duplicate: true };
      }
      await tx.execute(sql`INSERT INTO subscription_events
        (tenant_id, subscription_id, event_type, details)
        VALUES (${tenantId}, ${matched.subscriptionId}, 'billing.stripe_checkout_unpaid',
                ${JSON.stringify({ invoiceId, eventId, stripeSessionId: session.id, reason })}::jsonb)`);
      return { received: true, applied: false, recorded: true, paymentVerified: false };
    });
  }

  /** Captured funds after cancellation/voiding are quarantined for manual
   * reconciliation, not silently granted or retried without an audit trail. */
  private async recordUnfulfilledSettlement(tx: any, tenantId: string, invoiceId: string,
                                            subscriptionId: string, session: any,
                                            eventId: string, reason: string) {
    await tx.execute(sql`INSERT INTO billing_payment_exceptions
      (tenant_id, invoice_id, provider, provider_event_id, provider_payment_id,
       exception_type, amount_minor, currency, details)
      VALUES (${tenantId}, ${invoiceId}, ${STRIPE_PROVIDER}, ${eventId}, ${session.payment_intent},
              'ineligible_settlement', ${session.amount_total}, ${session.currency.toUpperCase()},
              ${JSON.stringify({ reason })}::jsonb)`);
    await tx.execute(sql`INSERT INTO subscription_events
      (tenant_id, subscription_id, event_type, details)
      VALUES (${tenantId}, ${subscriptionId}, 'billing.unfulfilled_payment_needs_review',
              ${JSON.stringify({ invoiceId, eventId, reason })}::jsonb)`);
    return { received: true, applied: false, needsReview: true, invoiceId };
  }

  /**
   * C30: signed recurring Checkout completion creates ONLY a pending identity
   * binding. The signed metadata is a tenant routing hint, not proof of
   * ownership; the immutable tenant ledger and independent provider GETs must
   * agree before insertion. No subscription entitlement is activated here.
   */
  private async bindRecurringCheckout(candidate: RecurringCheckoutCandidate,
                                      config: ReturnType<typeof stripeConfig>) {
    if (config.liveMode || process.env.DEPLOYMENT_ENV === 'production' ||
        process.env.STRIPE_RECURRING_CHECKOUT_ENABLED !== 'true')
      throw new ServiceUnavailableException('Recurring Stripe binding is TEST-only and disabled');
    const tenantId = candidate.tenantId;
    return withTenant(tenantId, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1212, hashtext(${tenantId}))`);
      const recorded = rows(await tx.execute(sql`
        SELECT c.tenant_id AS "tenantId", c.subscription_id AS "subscriptionId",
               c.plan_id AS "planId", c.stripe_session_id AS "stripeSessionId",
               c.stripe_price_id AS "stripePriceId", c.live_mode AS "liveMode",
               p.price_minor AS "priceMinor", p.currency,
               s.status AS "subscriptionStatus",
               s.cancel_at_period_end AS "cancelAtPeriodEnd"
        FROM billing_stripe_recurring_checkout_sessions c
        JOIN tenant_subscriptions s ON s.tenant_id = c.tenant_id
          AND s.id = c.subscription_id AND s.plan_id = c.plan_id
        JOIN subscription_plans p ON p.id = c.plan_id
        WHERE c.tenant_id = ${tenantId}
          AND c.stripe_session_id = ${candidate.sessionId}
          AND c.plan_id = ${candidate.planId}
        FOR UPDATE OF c, s`))[0];
      if (!recorded) throw new NotFoundException('Recurring Checkout is not in the tenant ledger');
      const existing = rows(await tx.execute(sql`
        SELECT stripe_checkout_session_id AS "sessionId",
               stripe_subscription_id AS "stripeSubscriptionId",
               stripe_customer_id AS "stripeCustomerId",
               plan_id AS "planId"
        FROM billing_stripe_recurring_bindings
        WHERE tenant_id = ${tenantId}
          AND subscription_id = ${recorded.subscriptionId}`))[0];
      if (existing) {
        if (existing.sessionId !== candidate.sessionId ||
            existing.stripeSubscriptionId !== candidate.stripeSubscriptionId ||
            existing.stripeCustomerId !== candidate.stripeCustomerId ||
            existing.planId !== candidate.planId)
          throw new ConflictException('Recurring Checkout binding identity conflict');
        return { received: true, applied: false, duplicate: true, paymentVerified: false };
      }
      if (recorded.subscriptionStatus !== 'trialing' || recorded.cancelAtPeriodEnd)
        throw new ConflictException('Recurring Checkout subscription is no longer eligible');
      const getStripe = async (url: string): Promise<unknown> => {
        let response: Response;
        try {
          response = await stripeApiFetch(url, {
            headers: { Authorization: `Bearer ${config.key}` },
            signal: AbortSignal.timeout(12_000),
          });
        } catch { throw new BadGatewayException('Recurring Stripe provider lookup failed'); }
        if (!response.ok)
          throw new BadGatewayException('Recurring Stripe provider lookup was rejected');
        try { return await readStripeApiJson(response); }
        catch { throw new BadGatewayException('Invalid recurring Stripe provider response'); }
      };
      const remoteSession = await getStripe(
        `https://api.stripe.com/v1/checkout/sessions/${candidate.sessionId}`);
      const remoteSubscription = await getStripe(
        `https://api.stripe.com/v1/subscriptions/${candidate.stripeSubscriptionId}`);
      let verified: ReturnType<typeof assertRecurringCheckoutBinding>;
      try {
        verified = assertRecurringCheckoutBinding(candidate, remoteSession,
          remoteSubscription, recorded, false);
      } catch { throw new ConflictException('Recurring Stripe identity verification failed'); }
      const inserted = rows(await tx.execute(sql`
        INSERT INTO billing_stripe_recurring_bindings
          (tenant_id, subscription_id, plan_id, stripe_checkout_session_id,
           stripe_subscription_id, stripe_customer_id, stripe_price_id, status)
        VALUES (${tenantId}, ${verified.subscriptionId}, ${verified.planId},
                ${verified.stripeCheckoutSessionId}, ${verified.stripeSubscriptionId},
                ${verified.stripeCustomerId}, ${verified.stripePriceId}, 'pending')
        ON CONFLICT DO NOTHING RETURNING id`));
      if (!inserted.length)
        throw new ConflictException('Recurring Stripe identity is already bound');
      await tx.execute(sql`INSERT INTO subscription_events
        (tenant_id, subscription_id, event_type, details)
        VALUES (${tenantId}, ${verified.subscriptionId},
          'billing.stripe_recurring_checkout_bound',
          ${JSON.stringify({ eventId: verified.eventId,
            stripeSessionId: verified.stripeCheckoutSessionId,
            stripeSubscriptionId: verified.stripeSubscriptionId })}::jsonb)`);
      return { received: true, applied: false, bound: true, paymentVerified: false };
    });
  }



  /**
   * C33: signed TEST-only cancellation. The signed event cannot choose a
   * tenant without an independent provider GET and an existing immutable
   * tenant subscription binding. No payment or entitlement grant occurs.
   * Scheduled cancellation preserves the already-paid period; terminal
   * deletion revokes access. Replays are serialized by the tenant lock.
   */
  private async recordRecurringCancellation(
    candidate: RecurringCancellationCandidate, digest: string,
    config: ReturnType<typeof stripeConfig>) {
    if (config.liveMode || process.env.DEPLOYMENT_ENV === 'production' ||
        process.env.STRIPE_RECURRING_CHECKOUT_ENABLED !== 'true')
      throw new ServiceUnavailableException('Recurring cancellation is TEST-only and disabled');
    let response: Response;
    try {
      response = await stripeApiFetch(
        `https://api.stripe.com/v1/subscriptions/${candidate.stripeSubscriptionId}`, {
          headers: { Authorization: `Bearer ${config.key}` },
          signal: AbortSignal.timeout(12_000),
        });
    } catch { throw new BadGatewayException('Recurring cancellation provider lookup unavailable'); }
    if (!response.ok)
      throw new BadGatewayException('Recurring cancellation provider lookup rejected');
    let remote: unknown;
    try { remote = await readStripeApiJson(response); }
    catch { throw new BadGatewayException('Invalid recurring cancellation provider response'); }
    const tenantId = (remote as any)?.metadata?.tenantId;
    if (typeof tenantId !== 'string' || !UUID.test(tenantId) ||
        tenantId !== candidate.tenantId)
      throw new ConflictException('Recurring cancellation tenant routing mismatch');
    return withTenant(tenantId, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1212, hashtext(${tenantId}))`);
      const binding = rows(await tx.execute(sql`
        SELECT b.tenant_id AS "tenantId", b.subscription_id AS "subscriptionId",
               b.plan_id AS "planId", b.stripe_subscription_id AS "stripeSubscriptionId",
               b.stripe_customer_id AS "stripeCustomerId",
               b.stripe_price_id AS "stripePriceId", b.status AS "bindingStatus",
               s.status AS "localStatus"
        FROM billing_stripe_recurring_bindings b
        JOIN tenant_subscriptions s ON s.tenant_id = b.tenant_id
          AND s.id = b.subscription_id AND s.plan_id = b.plan_id
        WHERE b.tenant_id = ${tenantId}
          AND b.stripe_subscription_id = ${candidate.stripeSubscriptionId}
          AND b.stripe_customer_id = ${candidate.customerId}
        FOR UPDATE OF b, s`))[0];
      if (!binding) throw new ConflictException('Recurring cancellation binding is missing');
      const latest = rows(await tx.execute(sql`
        SELECT id FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC, id DESC LIMIT 1`))[0];
      try {
        assertRecurringCancellationProvider(candidate, remote, binding, latest?.id ?? '', false);
      } catch { throw new ConflictException('Recurring cancellation provider or tenant ledger mismatch'); }

      // Cancellation events have no paid invoice. Keep their digest in the
      // subscription event ledger rather than inventing an invoice receipt.
      // This read and append are serialized under the same tenant advisory lock.
      const previous = rows(await tx.execute(sql`
        SELECT event_type AS "eventType",
               details ->> 'payloadSha256' AS "payloadSha256",
               details ->> 'stripeSubscriptionId' AS "stripeSubscriptionId"
        FROM subscription_events
        WHERE tenant_id = ${tenantId}
          AND subscription_id = ${binding.subscriptionId}
          AND event_type IN ('billing.stripe_recurring_cancelled',
                             'billing.stripe_recurring_cancellation_scheduled')
          AND details ->> 'eventId' = ${candidate.eventId}
        ORDER BY created_at DESC LIMIT 1`))[0];
      const eventType = candidate.terminal ?
        'billing.stripe_recurring_cancelled' :
        'billing.stripe_recurring_cancellation_scheduled';
      if (previous) {
        if (previous.eventType !== eventType || previous.payloadSha256 !== digest ||
            previous.stripeSubscriptionId !== candidate.stripeSubscriptionId)
          throw new ConflictException('Recurring cancellation event identity was reused');
        return { received: true, applied: false, duplicate: true, canceled: candidate.terminal };
      }
      const marked = rows(await tx.execute(sql`
        UPDATE billing_stripe_recurring_bindings
        SET cancel_at_period_end = true, updated_at = now()
        WHERE tenant_id = ${tenantId}
          AND subscription_id = ${binding.subscriptionId}
          AND stripe_subscription_id = ${candidate.stripeSubscriptionId}
        RETURNING id`));
      if (marked.length !== 1)
        throw new ConflictException('Recurring cancellation binding changed');
      const revoked = rows(await tx.execute(sql`
        UPDATE tenant_subscriptions
        SET cancel_at_period_end = true,
            status = CASE WHEN ${candidate.terminal} THEN 'canceled' ELSE status END,
            updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${binding.subscriptionId}
        RETURNING id`));
      if (revoked.length !== 1)
        throw new ConflictException('Recurring cancellation subscription changed');
      await tx.execute(sql`
        INSERT INTO subscription_events
          (tenant_id, subscription_id, event_type, details)
        VALUES (${tenantId}, ${binding.subscriptionId}, ${eventType},
          ${JSON.stringify({ eventId: candidate.eventId,
            stripeSubscriptionId: candidate.stripeSubscriptionId,
            payloadSha256: digest, terminal: candidate.terminal })}::jsonb)`);
      return { received: true, applied: true, canceled: candidate.terminal,
        scheduled: !candidate.terminal, subscriptionId: binding.subscriptionId };
    });
  }

  /**
   * C34: TEST-only signed failed recurring invoice reconciliation.
   * Preserve paid access until its existing expiry, then mark past_due.
   * Never grant an entitlement or record a paid invoice from a failed event.
   */
  private async recordRecurringFailedInvoice(
    candidate: FailedRecurringInvoiceCandidate, digest: string,
    config: ReturnType<typeof stripeConfig>) {
    if (config.liveMode || process.env.DEPLOYMENT_ENV === 'production' ||
        process.env.STRIPE_RECURRING_CHECKOUT_ENABLED !== 'true')
      throw new ServiceUnavailableException('Recurring failure reconciliation is TEST-only and disabled');
    const getStripe = async (path: string): Promise<any> => {
      let response: Response;
      try {
        response = await stripeApiFetch('https://api.stripe.com/v1/' + path, {
          headers: { Authorization: 'Bearer ' + config.key },
          signal: AbortSignal.timeout(12_000),
        });
      } catch { throw new BadGatewayException('Recurring failure provider lookup unavailable'); }
      if (!response.ok) throw new BadGatewayException('Recurring failure provider lookup rejected');
      try { return await readStripeApiJson(response); }
      catch { throw new BadGatewayException('Invalid recurring failure provider response'); }
    };
    const invoice = await getStripe('invoices/' + candidate.invoiceId);
    const subscription = await getStripe('subscriptions/' + candidate.stripeSubscriptionId);
    let paymentIntentId: string | null;
    try { paymentIntentId = failedInvoicePaymentIntentId(invoice); }
    catch { throw new ConflictException('Ambiguous failed invoice payment references'); }
    const intent = paymentIntentId ? await getStripe('payment_intents/' + paymentIntentId) : null;
    const tenantId = subscription?.metadata?.tenantId;
    if (typeof tenantId !== 'string' || !UUID.test(tenantId) ||
        subscription?.id !== candidate.stripeSubscriptionId ||
        !UUID.test(subscription?.metadata?.planId ?? ''))
      throw new ConflictException('Recurring failed invoice tenant routing is invalid');
    return withTenant(tenantId, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1212, hashtext(${tenantId}))`);
      const record = rows(await tx.execute(sql`
        SELECT b.tenant_id AS "tenantId", b.subscription_id AS "subscriptionId",
               b.plan_id AS "planId", b.stripe_subscription_id AS "stripeSubscriptionId",
               b.stripe_customer_id AS "stripeCustomerId",
               b.stripe_price_id AS "stripePriceId", b.status,
               b.last_period_ends_at AS "lastPeriodEndsAt",
               b.cancel_at_period_end AS "cancelAtPeriodEnd",
               s.id AS "localId", s.plan_id AS "localPlanId",
               s.status AS "localStatus",
               s.period_starts_at AS "localPeriodStartsAt",
               s.period_ends_at AS "localPeriodEndsAt",
               s.cancel_at_period_end AS "localCancelAtPeriodEnd",
               p.code, p.price_minor AS "priceMinor", p.currency,
               p.billing_interval AS "billingInterval",
               p.trial_days AS "trialDays", p.is_active AS "isActive"
        FROM billing_stripe_recurring_bindings b
        JOIN tenant_subscriptions s ON s.tenant_id = b.tenant_id
          AND s.id = b.subscription_id AND s.plan_id = b.plan_id
        JOIN subscription_plans p ON p.id = b.plan_id
        WHERE b.tenant_id = ${tenantId}
          AND b.stripe_subscription_id = ${candidate.stripeSubscriptionId}
          AND b.stripe_customer_id = ${candidate.stripeCustomerId}
        FOR UPDATE OF b, s`))[0];
      if (!record) throw new ConflictException('Recurring failure tenant binding missing');
      const latest = rows(await tx.execute(sql`
        SELECT id FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC, id DESC LIMIT 1`))[0];
      const binding: TrustedRecurringBinding = {
        tenantId: record.tenantId, subscriptionId: record.subscriptionId,
        planId: record.planId, stripeSubscriptionId: record.stripeSubscriptionId,
        stripeCustomerId: record.stripeCustomerId, stripePriceId: record.stripePriceId,
        status: record.status,
        lastPeriodEndsAt: record.lastPeriodEndsAt == null ? null :
          new Date(record.lastPeriodEndsAt).toISOString(),
        cancelAtPeriodEnd: record.cancelAtPeriodEnd,
      };
      const plan = {
        id: record.planId, code: record.code, priceMinor: record.priceMinor,
        currency: record.currency, billingInterval: record.billingInterval,
        trialDays: record.trialDays, isActive: record.isActive,
      } as RecurringPlan;
      const remotePrice = await getStripe('prices/' + binding.stripePriceId);
      try { assertRecurringStripePrice(remotePrice, plan, binding.stripePriceId, false); }
      catch { throw new ConflictException('Failed recurring invoice Price mismatch'); }
      let verified: ReturnType<typeof assertFailedRecurringProvider>;
      try {
        verified = assertFailedRecurringProvider(candidate, invoice, subscription, intent,
          binding, plan, { id: record.localId, planId: record.localPlanId,
            status: record.localStatus, cancelAtPeriodEnd: record.localCancelAtPeriodEnd,
            periodStartsAt: record.localPeriodStartsAt,
            periodEndsAt: record.localPeriodEndsAt }, latest?.id ?? '', false);
      } catch { throw new ConflictException('Failed recurring invoice provider or ledger mismatch'); }
      const paid = rows(await tx.execute(sql`
        SELECT id FROM subscription_events
        WHERE tenant_id = ${tenantId} AND subscription_id = ${binding.subscriptionId}
          AND event_type = 'billing.stripe_recurring_invoice_settled'
          AND details ->> 'stripeInvoiceId' = ${candidate.invoiceId}
        LIMIT 1`))[0];
      if (paid) throw new ConflictException('Recurring invoice is already settled');
      const previous = rows(await tx.execute(sql`
        SELECT subscription_id AS "subscriptionId",
               details ->> 'payloadSha256' AS "payloadSha256",
               details ->> 'stripeInvoiceId' AS "stripeInvoiceId"
        FROM subscription_events
        WHERE tenant_id = ${tenantId}
          AND event_type = 'billing.stripe_recurring_invoice_failed'
          AND details ->> 'eventId' = ${candidate.eventId}
        ORDER BY created_at DESC LIMIT 1`))[0];
      if (previous) {
        if (previous.subscriptionId !== binding.subscriptionId ||
            previous.payloadSha256 !== digest ||
            previous.stripeInvoiceId !== candidate.invoiceId)
          throw new ConflictException('Recurring failed invoice event identity was reused');
        return { received: true, applied: false, duplicate: true,
          subscriptionId: binding.subscriptionId };
      }
      let accessChanged = false;
      if (verified.shouldPause && ['trialing', 'active'].includes(record.localStatus)) {
        const changed = rows(await tx.execute(sql`
          UPDATE tenant_subscriptions
          SET status = 'past_due', updated_at = now()
          WHERE tenant_id = ${tenantId} AND id = ${binding.subscriptionId}
            AND status = ${record.localStatus}
            AND cancel_at_period_end = false AND period_ends_at <= now()
          RETURNING id`));
        if (changed.length !== 1)
          throw new ConflictException('Recurring failure entitlement changed during reconciliation');
        accessChanged = true;
      }
      await tx.execute(sql`
        INSERT INTO subscription_events
          (tenant_id, subscription_id, event_type, details)
        VALUES (${tenantId}, ${binding.subscriptionId},
          'billing.stripe_recurring_invoice_failed',
          ${JSON.stringify({ eventId: candidate.eventId,
            stripeInvoiceId: candidate.invoiceId,
            stripeSubscriptionId: candidate.stripeSubscriptionId,
            payloadSha256: digest, attemptCount: candidate.attemptCount,
            periodEndsAt: verified.periodEndsAt, accessChanged })}::jsonb)`);
      return { received: true, applied: true, accessChanged,
        subscriptionId: binding.subscriptionId };
    });
  }
  /**
   * C32: TEST-only, signed recurring invoice settlement. The provider's
   * subscription metadata is a routing hint only. The immutable Checkout
   * binding and tenant-scoped database rows establish ownership. Every
   * financial/entitlement mutation is inside one tenant-locked transaction.
   */
  private async settleRecurringInvoice(
    candidate: NonNullable<ReturnType<typeof parsePaidRecurringInvoice>>,
    digest: string, config: ReturnType<typeof stripeConfig>) {
    if (config.liveMode || process.env.DEPLOYMENT_ENV === 'production' ||
        process.env.STRIPE_RECURRING_CHECKOUT_ENABLED !== 'true')
      throw new ServiceUnavailableException('Recurring Stripe settlement is TEST-only and disabled');
    const getStripe = async (path: string): Promise<any> => {
      let response: Response;
      try {
        response = await stripeApiFetch(`https://api.stripe.com/v1/${path}`, {
          headers: { Authorization: `Bearer ${config.key}` },
          signal: AbortSignal.timeout(12_000),
        });
      } catch { throw new BadGatewayException('Recurring Stripe provider verification unavailable'); }
      if (!response.ok)
        throw new BadGatewayException('Recurring Stripe provider verification rejected');
      try { return await readStripeApiJson(response); }
      catch { throw new BadGatewayException('Invalid recurring Stripe provider response'); }
    };
    // Never select a tenant from invoice metadata or an unverified webhook
    // body. Retrieve all three provider objects independently before locking.
    const invoice = await getStripe(`invoices/${candidate.invoiceId}`);
    const subscription = await getStripe(`subscriptions/${candidate.subscriptionId}`);
    let paymentIntentId: string;
    try { paymentIntentId = recurringInvoicePaymentIntentId(invoice); }
    catch { throw new ConflictException('Recurring Stripe invoice payment reference is ambiguous'); }
    const intent = await getStripe(`payment_intents/${paymentIntentId}`);
    const tenantId = subscription?.metadata?.tenantId;
    if (typeof tenantId !== 'string' || !UUID.test(tenantId) ||
        subscription?.id !== candidate.subscriptionId ||
        typeof subscription?.metadata?.planId !== 'string' ||
        !UUID.test(subscription.metadata.planId))
      throw new ConflictException('Recurring Stripe subscription has no valid tenant routing identity');

    return withTenant(tenantId, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1212, hashtext(${tenantId}))`);
      const record = rows(await tx.execute(sql`
        SELECT b.tenant_id AS "tenantId", b.subscription_id AS "subscriptionId",
               b.plan_id AS "planId", b.stripe_subscription_id AS "stripeSubscriptionId",
               b.stripe_customer_id AS "stripeCustomerId",
               b.stripe_price_id AS "stripePriceId", b.status,
               b.last_period_ends_at AS "lastPeriodEndsAt",
               b.cancel_at_period_end AS "cancelAtPeriodEnd",
               s.id AS "localId", s.plan_id AS "localPlanId",
               s.status AS "localStatus",
               s.period_starts_at AS "localPeriodStartsAt",
               s.period_ends_at AS "localPeriodEndsAt",
               s.cancel_at_period_end AS "localCancelAtPeriodEnd",
               p.code, p.price_minor AS "priceMinor", p.currency,
               p.billing_interval AS "billingInterval",
               p.trial_days AS "trialDays", p.is_active AS "isActive"
        FROM billing_stripe_recurring_bindings b
        JOIN tenant_subscriptions s ON s.tenant_id = b.tenant_id
          AND s.id = b.subscription_id AND s.plan_id = b.plan_id
        JOIN subscription_plans p ON p.id = b.plan_id
        WHERE b.tenant_id = ${tenantId}
          AND b.stripe_subscription_id = ${candidate.subscriptionId}
          AND b.stripe_customer_id = ${candidate.customerId}
        FOR UPDATE OF b, s`))[0];
      if (!record || record.isActive !== true)
        throw new ConflictException('Recurring Stripe subscription is not in the tenant ledger');
      const latest = rows(await tx.execute(sql`
        SELECT id FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC, id DESC LIMIT 1`))[0];
      if (!latest || latest.id !== record.subscriptionId)
        throw new ConflictException('Recurring Stripe invoice targets a superseded subscription');
      const binding: TrustedRecurringBinding = {
        tenantId: record.tenantId, subscriptionId: record.subscriptionId,
        planId: record.planId, stripeSubscriptionId: record.stripeSubscriptionId,
        stripeCustomerId: record.stripeCustomerId, stripePriceId: record.stripePriceId,
        status: record.status,
        lastPeriodEndsAt: record.lastPeriodEndsAt == null ? null :
          new Date(record.lastPeriodEndsAt).toISOString(),
        cancelAtPeriodEnd: record.cancelAtPeriodEnd,
      };
      const plan = {
        id: record.planId, code: record.code, priceMinor: record.priceMinor,
        currency: record.currency, billingInterval: record.billingInterval,
        trialDays: record.trialDays, isActive: record.isActive,
      } as RecurringPlan;
      // Independently GET the configured provider Price, not just the price
      // ID embedded in Invoice/Subscription objects. Amount/interval/mode
      // must still agree with the tenant's immutable Checkout binding.
      const remotePrice = await getStripe(`prices/${binding.stripePriceId}`);
      try { assertRecurringStripePrice(remotePrice, plan, binding.stripePriceId, false); }
      catch { throw new ConflictException('Recurring Stripe Price no longer matches tenant plan'); }
      const receipt = rows(await tx.execute(sql`
        SELECT invoice_id AS "invoiceId", payload_sha256 AS digest
        FROM billing_webhook_receipts
        WHERE tenant_id = ${tenantId} AND provider = ${STRIPE_PROVIDER}
          AND provider_event_id = ${candidate.eventId}`))[0];
      if (receipt && receipt.digest !== digest)
        throw new ConflictException('Recurring Stripe event ID was reused with different content');

      // A second signed event can describe the same paid provider invoice.
      // Locate the immutable prior settlement; NEVER grant a second period.
      const prior = rows(await tx.execute(sql`
        SELECT i.id AS "invoiceId", i.status,
               i.period_ends_at AS "periodEndsAt",
               p.provider_payment_id AS "paymentIntent"
        FROM subscription_events e
        JOIN billing_invoices i ON i.tenant_id = e.tenant_id
          AND i.id::text = e.details ->> 'invoiceId'
        JOIN billing_payments p ON p.tenant_id = i.tenant_id AND p.invoice_id = i.id
        WHERE e.tenant_id = ${tenantId}
          AND e.subscription_id = ${binding.subscriptionId}
          AND e.event_type = 'billing.stripe_recurring_invoice_settled'
          AND e.details ->> 'stripeInvoiceId' = ${candidate.invoiceId}
          AND e.details ->> 'paymentIntent' = ${paymentIntentId}
          AND p.provider = ${STRIPE_PROVIDER}
        ORDER BY e.created_at DESC LIMIT 1`))[0];
      if (prior) {
        // Re-verify provider funds/period using the historical lifecycle
        // state. Never reactivate a canceled subscription on replay.
        const previousStart = invoice?.lines?.data?.[0]?.period?.start;
        const replayBinding: TrustedRecurringBinding = {
          ...binding,
          status: candidate.billingReason === 'subscription_create' ? 'pending' : 'active',
          lastPeriodEndsAt: candidate.billingReason === 'subscription_create' ? null :
            Number.isSafeInteger(previousStart) ? new Date(previousStart * 1000).toISOString() : null,
        };
        let replay;
        try {
          replay = assertRecurringProviderSettlement(
            candidate, invoice, subscription, intent, replayBinding, plan, false);
        } catch { throw new ConflictException('Recurring Stripe replay provider verification failed'); }
        if (prior.status !== 'paid' || prior.paymentIntent !== replay.paymentIntentId ||
            new Date(prior.periodEndsAt).getTime() !== Date.parse(replay.periodEndsAt) ||
            !binding.lastPeriodEndsAt ||
            Date.parse(binding.lastPeriodEndsAt) < Date.parse(replay.periodEndsAt) ||
            (receipt && receipt.invoiceId !== prior.invoiceId))
          throw new ConflictException('Recurring Stripe replay ledger mismatch');
        if (!receipt) {
          const added = rows(await tx.execute(sql`
            INSERT INTO billing_webhook_receipts
              (tenant_id, invoice_id, provider, provider_event_id, payload_sha256)
            VALUES (${tenantId}, ${prior.invoiceId}, ${STRIPE_PROVIDER},
                    ${candidate.eventId}, ${digest})
            ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`));
          if (!added.length) throw new ConflictException('Recurring Stripe replay event identity conflict');
        }
        return { received: true, applied: false, duplicate: true,
          invoiceId: prior.invoiceId, subscriptionId: binding.subscriptionId };
      }
      if (receipt) throw new ConflictException('Recurring Stripe event receipt has no matching settlement');

      let verified: ReturnType<typeof assertRecurringProviderSettlement>;
      try {
        verified = assertRecurringProviderSettlement(
          candidate, invoice, subscription, intent, binding, plan, false);
        assertRecurringLocalSettlement(binding, {
          id: record.localId, planId: record.localPlanId,
          status: record.localStatus, cancelAtPeriodEnd: record.localCancelAtPeriodEnd,
          periodStartsAt: record.localPeriodStartsAt,
          periodEndsAt: record.localPeriodEndsAt,
        }, verified, latest.id);
      } catch { throw new ConflictException('Recurring Stripe invoice or entitlement failed verification'); }

      // Existing open/manual invoices cannot be silently repurposed into
      // recurring Stripe invoices. A conflict rolls back all writes.
      const inserted = rows(await tx.execute(sql`
        INSERT INTO billing_invoices
          (tenant_id, subscription_id, period_starts_at, period_ends_at,
           amount_minor, currency)
        VALUES (${tenantId}, ${binding.subscriptionId},
                ${verified.periodStartsAt}::timestamptz,
                ${verified.periodEndsAt}::timestamptz,
                ${verified.amountMinor}, ${verified.currency})
        ON CONFLICT (tenant_id, subscription_id, period_starts_at)
          DO NOTHING RETURNING id`));
      if (inserted.length !== 1)
        throw new ConflictException('Recurring invoice period is already recorded');
      const invoiceId = inserted[0].id;
      const received = rows(await tx.execute(sql`
        INSERT INTO billing_webhook_receipts
          (tenant_id, invoice_id, provider, provider_event_id, payload_sha256)
        VALUES (${tenantId}, ${invoiceId}, ${STRIPE_PROVIDER},
                ${candidate.eventId}, ${digest})
        ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`));
      if (received.length !== 1)
        throw new ConflictException('Recurring Stripe event identity is already recorded');
      const payment = rows(await tx.execute(sql`
        INSERT INTO billing_payments
          (tenant_id, invoice_id, provider, provider_payment_id,
           provider_event_id, amount_minor, currency)
        VALUES (${tenantId}, ${invoiceId}, ${STRIPE_PROVIDER},
                ${verified.paymentIntentId}, ${candidate.eventId},
                ${verified.amountMinor}, ${verified.currency})
        ON CONFLICT (provider, provider_payment_id) DO NOTHING RETURNING id`));
      if (payment.length !== 1)
        throw new ConflictException('Recurring Stripe PaymentIntent already settled');
      const activated = rows(await tx.execute(sql`
        UPDATE tenant_subscriptions
        SET status = 'active',
            period_starts_at = ${verified.periodStartsAt}::timestamptz,
            period_ends_at = ${verified.periodEndsAt}::timestamptz,
            trial_ends_at = NULL, updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${binding.subscriptionId}
          AND status = ${record.localStatus}
          AND cancel_at_period_end = false
          AND period_ends_at = ${record.localPeriodEndsAt}::timestamptz
        RETURNING id`));
      if (activated.length !== 1)
        throw new ConflictException('Recurring entitlement state changed during settlement');
      const advanced = rows(await tx.execute(sql`
        UPDATE billing_stripe_recurring_bindings
        SET status = 'active',
            last_period_ends_at = ${verified.periodEndsAt}::timestamptz,
            updated_at = now()
        WHERE tenant_id = ${tenantId}
          AND subscription_id = ${binding.subscriptionId}
          AND stripe_subscription_id = ${binding.stripeSubscriptionId}
          AND status = ${binding.status}
          AND cancel_at_period_end = false
          AND last_period_ends_at IS NOT DISTINCT FROM
              ${binding.lastPeriodEndsAt}::timestamptz
        RETURNING id`));
      if (advanced.length !== 1)
        throw new ConflictException('Recurring Stripe binding changed during settlement');
      const settledInvoice = rows(await tx.execute(sql`
        UPDATE billing_invoices SET status = 'paid', paid_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${invoiceId} AND status = 'open'
        RETURNING id`));
      if (settledInvoice.length !== 1)
        throw new ConflictException('Recurring invoice paid-state update failed');
      await tx.execute(sql`
        INSERT INTO subscription_events
          (tenant_id, subscription_id, event_type, details)
        VALUES (${tenantId}, ${binding.subscriptionId},
          'billing.stripe_recurring_invoice_settled',
          ${JSON.stringify({ invoiceId, stripeInvoiceId: candidate.invoiceId, paymentIntent: verified.paymentIntentId, eventId: candidate.eventId, periodEndsAt: verified.periodEndsAt })}::jsonb)`);
      return { received: true, applied: true, invoiceId,
        subscriptionId: binding.subscriptionId, periodEndsAt: verified.periodEndsAt };
    });
  }

  /** Stripe signs the raw request. A successful customer redirect never activates a subscription. */
  async webhook(rawBody: Buffer | undefined, header: unknown) {
    const config = stripeConfig();
    if (!verifyStripeSignature(rawBody, header, config.webhookSecret))
      throw new ForbiddenException('Invalid Stripe webhook signature');
    if (!rawBody) throw new BadRequestException('Missing Stripe webhook body');
    let recurringCheckout: ReturnType<typeof parseSignedRecurringCheckout>;
    try { recurringCheckout = parseSignedRecurringCheckout(rawBody, config.liveMode); }
    catch { throw new BadRequestException('Invalid recurring Stripe Checkout event'); }
    if (recurringCheckout) return this.bindRecurringCheckout(recurringCheckout, config);
    let cancellation: ReturnType<typeof parseRecurringCancellation>;
    try { cancellation = parseRecurringCancellation(rawBody, config.liveMode); }
    catch { throw new BadRequestException('Invalid recurring Stripe cancellation event'); }
    if (cancellation)
      return this.recordRecurringCancellation(cancellation, sha256(rawBody), config);
    // C31 safety boundary: never acknowledge a paid recurring invoice while
    // transactional invoice/entitlement settlement is not yet connected.
    // A 2xx would cause Stripe to stop retrying a collected subscription
    // payment that has not been granted to the tenant.
    let signedEnvelope: any;
    try { signedEnvelope = JSON.parse(rawBody.toString('utf8')); }
    catch { throw new BadRequestException('Invalid signed Stripe event JSON'); }
    if (signedEnvelope?.type === 'invoice.payment_failed') {
      const failed = signedEnvelope.data?.object;
      const recurring = !!(failed?.subscription ||
        failed?.parent?.subscription_details?.subscription ||
        (typeof failed?.billing_reason === 'string' &&
         failed.billing_reason.startsWith('subscription_')));
      if (recurring) {
        let failedCandidate: ReturnType<typeof parseFailedRecurringInvoice>;
        try { failedCandidate = parseFailedRecurringInvoice(rawBody, config.liveMode); }
        catch { throw new BadRequestException('Invalid recurring Stripe failed invoice event'); }
        if (!failedCandidate)
          throw new ServiceUnavailableException('Unsupported recurring failure needs reconciliation');
        return this.recordRecurringFailedInvoice(failedCandidate, sha256(rawBody), config);
      }
    }
    if (signedEnvelope?.type === 'invoice.paid') {
      const invoice = signedEnvelope.data?.object;
      const recurring = !!(invoice?.subscription ||
        invoice?.parent?.subscription_details?.subscription ||
        (typeof invoice?.billing_reason === 'string' &&
         invoice.billing_reason.startsWith('subscription_')));
      if (recurring) {
        let candidate: ReturnType<typeof parsePaidRecurringInvoice>;
        try { candidate = parsePaidRecurringInvoice(rawBody, config.liveMode); }
        catch { throw new BadRequestException('Invalid recurring Stripe invoice event'); }
        if (!candidate)
          throw new ServiceUnavailableException('Unsupported recurring Stripe invoice needs reconciliation');
        if (config.liveMode || process.env.DEPLOYMENT_ENV === 'production' ||
            process.env.STRIPE_RECURRING_CHECKOUT_ENABLED !== 'true')
          throw new ServiceUnavailableException('Recurring Stripe settlement is TEST-only and disabled');
        // Verify that the signed invoice includes a valid provider reference
        // before retrying; the final settlement must independently GET it.
        if (invoice?.payment_intent != null || invoice?.payments != null) {
          try { recurringInvoicePaymentIntentId(invoice); }
          catch { throw new BadRequestException('Ambiguous recurring invoice payment reference'); }
        }
        return this.settleRecurringInvoice(candidate, sha256(rawBody), config);
      }
    }

    // Provider-signed reversal events are processed independently from
    // successful Checkout events and NEVER grant a new subscription period.
    let exceptionEvent: ReturnType<typeof parseStripePaymentException>;
    try { exceptionEvent = parseStripePaymentException(rawBody, config.liveMode); }
    catch { throw new BadRequestException('Invalid Stripe refund/dispute event'); }
    const digest = sha256(rawBody);
    if (exceptionEvent) return this.handlePaymentException(exceptionEvent, digest, config);
    let unpaidEvent: ReturnType<typeof parseUnpaidStripeCheckoutEvent>;
    try { unpaidEvent = parseUnpaidStripeCheckoutEvent(rawBody, config.liveMode); }
    catch { throw new BadRequestException('Invalid Stripe Checkout failure event'); }
    if (unpaidEvent) return this.recordUnpaidCheckout(unpaidEvent, digest);
    let event: ReturnType<typeof parsePaidStripeEvent>;
    try { event = parsePaidStripeEvent(rawBody, config.liveMode); }
    catch { throw new BadRequestException('Invalid Stripe payment event'); }
    if (!event) return { received: true, applied: false, ignored: true };
    const { session, eventId } = event;
    const tenantId = session.metadata?.tenantId;
    const invoiceId = session.metadata?.invoiceId;
    if (!tenantId || !invoiceId || !UUID.test(tenantId) || !UUID.test(invoiceId))
      throw new BadRequestException('Stripe event lacks a valid invoice reference');
    return withTenant(tenantId, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1212, hashtext(${tenantId}))`);
      const record = rows(await tx.execute(sql`
        SELECT tenant_id AS "tenantId", invoice_id AS "invoiceId",
               stripe_session_id AS "stripeSessionId"
        FROM billing_stripe_checkout_sessions
        WHERE tenant_id = ${tenantId} AND invoice_id = ${invoiceId}
          AND stripe_session_id = ${session.id}`))[0];
      if (!record) throw new NotFoundException('Stripe session is not recorded for this invoice');
      const inserted = rows(await tx.execute(sql`
        INSERT INTO billing_webhook_receipts
          (tenant_id, invoice_id, provider, provider_event_id, payload_sha256)
        VALUES (${tenantId}, ${invoiceId}, ${STRIPE_PROVIDER}, ${eventId}, ${digest})
        ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`));
      if (!inserted.length) {
        const existing = rows(await tx.execute(sql`
          SELECT invoice_id AS "invoiceId", payload_sha256 AS "payloadSha256"
          FROM billing_webhook_receipts
          WHERE tenant_id = ${tenantId} AND provider = ${STRIPE_PROVIDER}
            AND provider_event_id = ${eventId}`))[0];
        if (!existing || existing.invoiceId !== invoiceId || existing.payloadSha256 !== digest)
          throw new ConflictException('Stripe event identity was reused with different content');
        return { received: true, applied: false, duplicate: true };
      }
      const invoice = rows(await tx.execute(sql`
        SELECT id, tenant_id AS "tenantId", subscription_id AS "subscriptionId",
               amount_minor AS "amountMinor", currency, status,
               period_starts_at AS "periodStartsAt", period_ends_at AS "periodEndsAt"
        FROM billing_invoices WHERE tenant_id = ${tenantId} AND id = ${invoiceId} FOR UPDATE`))[0];
      if (!invoice) throw new NotFoundException('Stripe invoice not found');
      // Only a real matching captured payment may enter the reconciliation queue.
      // In particular, do not acknowledge wrong-amount or wrong-tenant events.
      try { assertStripePaymentInvoiceMatch(session, record, invoice); }
      catch { throw new ConflictException('Stripe payment failed invoice verification'); }
      // Stripe can notify multiple times using DIFFERENT event IDs. If this invoice
      // was already settled by the same PaymentIntent, acknowledge without a second grant.
      if (invoice.status === 'paid') {
        const existing = rows(await tx.execute(sql`
          SELECT provider_payment_id AS "paymentIntent" FROM billing_payments
          WHERE tenant_id = ${tenantId} AND invoice_id = ${invoiceId}
            AND provider = ${STRIPE_PROVIDER}`))[0];
        if (existing?.paymentIntent && existing.paymentIntent === session.payment_intent)
          return { received: true, applied: false, duplicate: true };
        return this.recordUnfulfilledSettlement(tx, tenantId, invoiceId, invoice.subscriptionId,
          session, eventId, 'invoice_already_paid_by_other_payment');
      }
      const latest = rows(await tx.execute(sql`
        SELECT id FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC, id DESC LIMIT 1`))[0];
      if (!latest || latest.id !== invoice.subscriptionId)
        return this.recordUnfulfilledSettlement(tx, tenantId, invoiceId, invoice.subscriptionId,
          session, eventId, 'previous_subscription');
      const subscription = rows(await tx.execute(sql`
        SELECT id, tenant_id AS "tenantId", status,
               period_ends_at AS "periodEndsAt", cancel_at_period_end AS "cancelAtPeriodEnd"
        FROM tenant_subscriptions WHERE tenant_id = ${tenantId} AND id = ${invoice.subscriptionId}
        FOR UPDATE`))[0];
      if (!subscription) throw new ConflictException('Subscription not found for invoice');
      let paymentIntent: string;
      try { paymentIntent = assertStripeSettlement(session, record, invoice, subscription); }
      catch {
        // A verified, captured payment made after scheduled cancellation, a
        // void invoice, or changed subscription MUST NOT grant access. Record
        // the financial exception atomically and require human reconciliation.
        return this.recordUnfulfilledSettlement(tx, tenantId, invoiceId, invoice.subscriptionId,
          session, eventId, 'subscription_or_invoice_ineligible');
      }
      const payment = rows(await tx.execute(sql`
        INSERT INTO billing_payments
          (tenant_id, invoice_id, provider, provider_payment_id, provider_event_id, amount_minor, currency)
        VALUES (${tenantId}, ${invoiceId}, ${STRIPE_PROVIDER}, ${paymentIntent}, ${eventId},
                ${session.amount_total}, ${invoice.currency})
        ON CONFLICT (provider, provider_payment_id) DO NOTHING RETURNING id`));
      if (!payment.length) throw new ConflictException('Stripe PaymentIntent already recorded');
      await tx.execute(sql`UPDATE tenant_subscriptions
        SET status = 'active', period_starts_at = ${invoice.periodStartsAt}::timestamptz,
            period_ends_at = ${invoice.periodEndsAt}::timestamptz,
            trial_ends_at = NULL, updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${subscription.id}`);
      await tx.execute(sql`UPDATE billing_invoices SET status = 'paid', paid_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${invoiceId}`);
      await tx.execute(sql`INSERT INTO subscription_events
        (tenant_id, subscription_id, event_type, details)
        VALUES (${tenantId}, ${subscription.id}, 'subscription.renewed_after_verified_settlement',
          ${JSON.stringify({ invoiceId, provider: STRIPE_PROVIDER, paymentIntent, eventId,
            stripeSessionId: session.id, amountMinor: session.amount_total, currency: invoice.currency })}::jsonb)`);
      return { received: true, applied: true, invoiceId, subscriptionId: subscription.id };
    });
  }
}
