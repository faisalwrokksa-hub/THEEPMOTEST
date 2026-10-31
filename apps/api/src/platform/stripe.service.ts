import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { withTenant } from '@pmo/db';
import { currentContext } from '../tenancy/tenant-context';
import { requiresSecureTransport } from '../common/deployment-policy';
import { requireCapability } from '../common/require-capability';
import { sha256 } from './billing-policy';
import { assertStripeSettlement, assertStripePaymentInvoiceMatch, assertStripeExceptionIntent, parsePaidStripeEvent, parseStripePaymentException, shouldPauseOnPaymentException, refundCoversPaidInvoice, stripeCheckoutIdempotencyKey, stripeCheckoutParams, stripeCheckoutUrlAllowed, stripeDeploymentModeAllowed, STRIPE_PROVIDER, verifyStripeSignature } from './stripe-policy';

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

      const existing = rows(await tx.execute(sql`
        SELECT stripe_session_id AS "sessionId", checkout_url AS url,
               expires_at AS "expiresAt" FROM billing_stripe_checkout_sessions
        WHERE tenant_id = ${tenantId} AND invoice_id = ${invoiceId} AND expires_at > now() + interval '60 seconds'
        ORDER BY created_at DESC, id DESC LIMIT 1`))[0];
      if (existing) return { invoiceId, sessionId: existing.sessionId, url: existing.url,
        expiresAt: existing.expiresAt, reused: true, paymentVerified: false };

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
        response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/x-www-form-urlencoded',
            'Idempotency-Key': idempotencyKey },
          body: params.toString(), signal: AbortSignal.timeout(12_000),
        });
      } catch { throw new BadGatewayException('Stripe Checkout request failed'); }
      if (!response.ok) throw new BadGatewayException('Stripe Checkout could not be created');
      let session: any;
      try { session = await response.json(); }
      catch { throw new BadGatewayException('Invalid Stripe Checkout response'); }
      const url = typeof session.url === 'string' ? session.url : '';
      if (!stripeCheckoutUrlAllowed(url) || session.object !== 'checkout.session' ||
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
      response = await fetch(`https://api.stripe.com/v1/payment_intents/${event.paymentIntent}`, {
        headers: { Authorization: `Bearer ${config.key}` }, signal: AbortSignal.timeout(12_000),
      });
    } catch { throw new BadGatewayException('Unable to verify Stripe payment exception'); }
    if (!response.ok) throw new BadGatewayException('Stripe PaymentIntent lookup failed');
    let intent: unknown;
    try { intent = await response.json(); }
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

  /** Stripe signs the raw request. A successful customer redirect never activates a subscription. */
  async webhook(rawBody: Buffer | undefined, header: unknown) {
    const config = stripeConfig();
    if (!verifyStripeSignature(rawBody, header, config.webhookSecret))
      throw new ForbiddenException('Invalid Stripe webhook signature');
    if (!rawBody) throw new BadRequestException('Missing Stripe webhook body');
    // Provider-signed reversal events are processed independently from
    // successful Checkout events and NEVER grant a new subscription period.
    let exceptionEvent: ReturnType<typeof parseStripePaymentException>;
    try { exceptionEvent = parseStripePaymentException(rawBody, config.liveMode); }
    catch { throw new BadRequestException('Invalid Stripe refund/dispute event'); }
    const digest = sha256(rawBody);
    if (exceptionEvent) return this.handlePaymentException(exceptionEvent, digest, config);
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
