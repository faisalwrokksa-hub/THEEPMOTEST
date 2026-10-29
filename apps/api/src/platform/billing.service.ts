import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { withTenant } from '@pmo/db';
import { currentContext } from '../tenancy/tenant-context';
import { requireCapability } from '../common/require-capability';
import { assertSettlement, mayInvoice, nextPeriod, REFERENCE_PROVIDER, referenceBillingModeAllowed, sha256, verifyReferenceSignature } from './billing-policy';
import type { ReferenceSettlement } from './billing.schemas';
import { reconcileInvoice, type InvoiceLedgerRow } from './billing-reconciliation';

const rows = (value: unknown) => value as any[];

@Injectable()
export class BillingService {
  /** Financial records are restricted to workspace subscription administrators. */
  async invoices() {
    requireCapability('pmoa_admin');
    const { tenantId } = currentContext();
    return withTenant(tenantId, async tx => rows(await tx.execute(sql`
      SELECT id, tenant_id AS "tenantId", subscription_id AS "subscriptionId", period_starts_at AS "periodStartsAt",
             period_ends_at AS "periodEndsAt", amount_minor AS "amountMinor",
             currency, status, created_at AS "createdAt", paid_at AS "paidAt"
      FROM billing_invoices WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC, id DESC LIMIT 100`)));
  }

  async payments() {
    requireCapability('pmoa_admin');
    const { tenantId } = currentContext();
    return withTenant(tenantId, async tx => rows(await tx.execute(sql`
      SELECT id, invoice_id AS "invoiceId", provider,
             provider_payment_id AS "providerPaymentId", amount_minor AS "amountMinor",
             currency, created_at AS "createdAt"
      FROM billing_payments WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC, id DESC LIMIT 100`)));
  }

  /** Customer administrators can review reversals and unfulfilled captured payments.
   * Never exposes another tenant's exception queue, and never resolves funds automatically. */
  async exceptions() {
    requireCapability('pmoa_admin');
    const { tenantId } = currentContext();
    return withTenant(tenantId, async tx => rows(await tx.execute(sql`
      SELECT id, invoice_id AS "invoiceId", provider, provider_event_id AS "providerEventId",
             exception_type AS "exceptionType", amount_minor AS "amountMinor", currency,
             subscription_paused AS "subscriptionPaused", created_at AS "createdAt"
      FROM billing_payment_exceptions WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC, id DESC LIMIT 100`)));
  }

  /** Read-only, tenant-bound invoice ledger consistency report. No payment state is mutated. */
  async reconciliation() {
    requireCapability('pmoa_admin');
    const { tenantId } = currentContext();
    return withTenant(tenantId, async tx => {
      // One payment per invoice is guaranteed by billing_payments_invoice_unique.
      // The extra row detects truncation; do not imply a clean full-ledger audit.
      const result = rows(await tx.execute(sql`
        SELECT i.id AS "invoiceId", i.status, i.amount_minor AS "amountMinor",
               i.currency, i.period_starts_at AS "periodStartsAt",
               i.paid_at AS "paidAt", p.id AS "paymentId",
               p.amount_minor AS "paymentAmountMinor", p.currency AS "paymentCurrency"
        FROM billing_invoices i
        LEFT JOIN billing_payments p ON p.tenant_id = i.tenant_id AND p.invoice_id = i.id
        WHERE i.tenant_id = ${tenantId}
        ORDER BY i.created_at DESC, i.id DESC LIMIT 201`)) as InvoiceLedgerRow[];
      const flagged = result.slice(0, 200).flatMap(invoice => {
        const issues = reconcileInvoice(invoice);
        return issues.length ? [{ invoiceId: invoice.invoiceId, issues }] : [];
      });
      return { examined: Math.min(result.length, 200), truncated: result.length > 200, flagged,
        settlementReconciledWithProvider: false };
    });
  }

  /** Idempotently draft the upcoming renewal invoice. Never extends a license by itself. */
  async issueRenewalInvoice() {
    requireCapability('pmoa_admin');
    const { tenantId, userId } = currentContext();
    return withTenant(tenantId, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1212, hashtext(${tenantId}))`);
      const current = rows(await tx.execute(sql`
        SELECT s.id, s.tenant_id AS "tenantId", s.status,
               s.period_ends_at AS "periodEndsAt", s.cancel_at_period_end AS "cancelAtPeriodEnd",
               p.price_minor AS "priceMinor", p.currency, p.billing_interval AS "billingInterval"
        FROM tenant_subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
        WHERE s.tenant_id = ${tenantId}
        ORDER BY s.created_at DESC, s.id DESC LIMIT 1 FOR UPDATE OF s`))[0];
      if (!current) throw new NotFoundException('No subscription for this workspace');
      if (!mayInvoice(current)) throw new ConflictException('Subscription is not eligible for renewal invoicing');
      if (!Number.isSafeInteger(current.priceMinor) || current.priceMinor < 1)
        throw new ConflictException('Zero-price plans require a separate free-plan policy');
      const period = nextPeriod(current.periodEndsAt, current.billingInterval);
      const created = rows(await tx.execute(sql`
        INSERT INTO billing_invoices
          (tenant_id, subscription_id, period_starts_at, period_ends_at, amount_minor, currency)
        VALUES (${tenantId}, ${current.id}, ${period.startsAt}::timestamptz,
                ${period.endsAt}::timestamptz, ${current.priceMinor}, ${current.currency})
        ON CONFLICT (tenant_id, subscription_id, period_starts_at) DO NOTHING
        RETURNING id, status`));
      const invoice = created[0] ?? rows(await tx.execute(sql`
        SELECT id, status FROM billing_invoices
        WHERE tenant_id = ${tenantId} AND subscription_id = ${current.id}
          AND period_starts_at = ${period.startsAt}::timestamptz`))[0];
      if (!invoice || invoice.status === 'void') throw new ConflictException('Renewal invoice was voided');
      if (created.length) {
        await tx.execute(sql`INSERT INTO subscription_events
          (tenant_id, subscription_id, actor_user_id, event_type, details)
          VALUES (${tenantId}, ${current.id}, ${userId}, 'billing.renewal_invoice_created',
            ${JSON.stringify({ invoiceId: invoice.id, amountMinor: current.priceMinor,
              currency: current.currency, periodStartsAt: period.startsAt, periodEndsAt: period.endsAt })}::jsonb)`);
      }
      return { invoiceId: invoice.id, status: invoice.status, amountMinor: current.priceMinor,
        currency: current.currency, ...period, alreadyExisted: created.length === 0,
        paymentVerified: false };
    });
  }

  /**
   * Reference HMAC adapter ONLY. Disabled unless explicitly enabled. Actual PSPs
   * require their own signature/reconciliation adapters and settlement source.
   * The signed bytes (not an HTTP caller's claim) authorize the settlement.
   */
  async referenceWebhook(rawBody: Buffer | undefined, timestamp: unknown, signature: unknown,
                         body: ReferenceSettlement) {
    const secret = process.env.BILLING_REFERENCE_WEBHOOK_SECRET;
    if (!referenceBillingModeAllowed(process.env.NODE_ENV, process.env.DEPLOYMENT_ENV) ||
        process.env.BILLING_REFERENCE_WEBHOOK_ENABLED !== 'true' || !secret || Buffer.byteLength(secret) < 32)
      throw new ForbiddenException('Reference billing webhook is disabled');
    if (!verifyReferenceSignature(rawBody, timestamp, signature, secret))
      throw new ForbiddenException('Invalid or stale billing webhook signature');
    if (!rawBody) throw new BadRequestException('Missing raw event body');
    const digest = sha256(rawBody);
    const tenantId = body.tenantId;
    return withTenant(tenantId, async tx => {
      // The grant/cancel/invoice paths take this same lock, preventing payment
      // finalization racing a subscription replacement or cancellation.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1212, hashtext(${tenantId}))`);
      const receipt = rows(await tx.execute(sql`
        INSERT INTO billing_webhook_receipts
          (tenant_id, invoice_id, provider, provider_event_id, payload_sha256)
        VALUES (${tenantId}, ${body.invoiceId}, ${REFERENCE_PROVIDER}, ${body.eventId}, ${digest})
        ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`));
      if (!receipt.length) {
        const existing = rows(await tx.execute(sql`
          SELECT invoice_id AS "invoiceId", payload_sha256 AS "payloadSha256"
          FROM billing_webhook_receipts
          WHERE tenant_id = ${tenantId} AND provider = ${REFERENCE_PROVIDER}
            AND provider_event_id = ${body.eventId}`))[0];
        if (!existing || existing.payloadSha256 !== digest || existing.invoiceId !== body.invoiceId)
          throw new ConflictException('Webhook event ID already used for different content');
        return { applied: false, duplicate: true, invoiceId: body.invoiceId };
      }
      const invoice = rows(await tx.execute(sql`
        SELECT i.id, i.tenant_id AS "tenantId", i.subscription_id AS "subscriptionId",
               i.amount_minor AS "amountMinor", i.currency, i.status,
               i.period_starts_at AS "periodStartsAt", i.period_ends_at AS "periodEndsAt"
        FROM billing_invoices i WHERE i.tenant_id = ${tenantId} AND i.id = ${body.invoiceId}
        FOR UPDATE`))[0];
      if (!invoice) throw new NotFoundException('Billing invoice not found');
      const subscription = rows(await tx.execute(sql`
        SELECT id, tenant_id AS "tenantId", status,
               period_ends_at AS "periodEndsAt", cancel_at_period_end AS "cancelAtPeriodEnd"
        FROM tenant_subscriptions WHERE tenant_id = ${tenantId} AND id = ${invoice.subscriptionId}
        FOR UPDATE`))[0];
      if (!subscription) throw new ConflictException('Subscription not found for invoice');
      try { assertSettlement(invoice, body, subscription); }
      catch (error) {
        throw new ConflictException(error instanceof Error ? error.message : 'Invalid settlement');
      }
      const payment = rows(await tx.execute(sql`
        INSERT INTO billing_payments
          (tenant_id, invoice_id, provider, provider_payment_id, provider_event_id,
           amount_minor, currency)
        VALUES (${tenantId}, ${body.invoiceId}, ${REFERENCE_PROVIDER}, ${body.paymentId},
                ${body.eventId}, ${body.amountMinor}, ${body.currency})
        ON CONFLICT (provider, provider_payment_id) DO NOTHING RETURNING id`));
      if (!payment.length) throw new ConflictException('Payment ID was previously applied');
      await tx.execute(sql`UPDATE tenant_subscriptions
        SET status = 'active', period_starts_at = ${invoice.periodStartsAt}::timestamptz,
            period_ends_at = ${invoice.periodEndsAt}::timestamptz, trial_ends_at = NULL,
            updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${subscription.id}`);
      await tx.execute(sql`UPDATE billing_invoices SET status = 'paid', paid_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${body.invoiceId}`);
      await tx.execute(sql`INSERT INTO subscription_events
        (tenant_id, subscription_id, event_type, details)
        VALUES (${tenantId}, ${subscription.id}, 'subscription.renewed_after_verified_settlement',
          ${JSON.stringify({ invoiceId: body.invoiceId, provider: REFERENCE_PROVIDER,
            paymentId: body.paymentId, eventId: body.eventId, amountMinor: body.amountMinor,
            currency: body.currency, source: 'reference_hmac_adapter' })}::jsonb)`);
      return { applied: true, duplicate: false, invoiceId: body.invoiceId,
        subscriptionId: subscription.id, paymentId: payment[0].id };
    });
  }
}
