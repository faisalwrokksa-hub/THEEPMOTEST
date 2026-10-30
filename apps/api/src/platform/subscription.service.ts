import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { withTenant } from '@pmo/db';
import { currentContext } from '../tenancy/tenant-context';
import { requireCapability } from '../common/require-capability';

const rows = (value: unknown) => value as any[];
@Injectable()
export class SubscriptionService {
  async plans() {
    const { tenantId } = currentContext();
    return withTenant(tenantId, async tx => rows(await tx.execute(sql`
      SELECT code, name, price_minor AS "priceMinor", currency,
             billing_interval AS "billingInterval", trial_days AS "trialDays"
      FROM subscription_plans WHERE is_active = true ORDER BY price_minor, code`)));
  }
  async current() {
    const { tenantId } = currentContext();
    const result = await withTenant(tenantId, async tx => rows(await tx.execute(sql`
      SELECT s.id, s.status, s.period_starts_at AS "periodStartsAt",
             s.period_ends_at AS "periodEndsAt", s.trial_ends_at AS "trialEndsAt",
             s.cancel_at_period_end AS "cancelAtPeriodEnd", p.code AS "planCode",
             p.name AS "planName", p.price_minor AS "priceMinor",
             p.currency, p.billing_interval AS "billingInterval"
      FROM tenant_subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
      WHERE s.tenant_id = ${tenantId} ORDER BY s.created_at DESC, s.id DESC LIMIT 1`)));
    return result[0] ?? null;
  }
  async setCancellation(cancel: boolean) {
    requireCapability('pmoa_admin');
    const { tenantId, userId } = currentContext();
    return withTenant(tenantId, async tx => {
      // Use the same tenant-scoped advisory lock as renewal invoice creation,
      // Stripe Checkout and webhook settlement. Acquire it BEFORE the row lock
      // so cancellation and payment cannot race through different lock orders.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1212, hashtext(${tenantId}))`);
      // The row lock makes the eligibility check and update atomic.
      const result = rows(await tx.execute(sql`
        SELECT id, status, period_ends_at AS "periodEndsAt", cancel_at_period_end AS "cancelAtPeriodEnd"
        FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`));
      const current = result[0];
      if (!current) throw new NotFoundException('No subscription');
      if (!['active', 'trialing'].includes(current.status) || new Date(current.periodEndsAt) <= new Date())
        throw new ConflictException('Subscription cannot be changed in its current state');
      // Replayed requests must not create fictitious preference changes or extra audit rows.
      if (current.cancelAtPeriodEnd === cancel)
        return { id: current.id, cancelAtPeriodEnd: cancel, unchanged: true };
      await tx.execute(sql`UPDATE tenant_subscriptions SET cancel_at_period_end = ${cancel}, updated_at = now()
        WHERE tenant_id = ${tenantId} AND id = ${current.id}`);
      await tx.execute(sql`INSERT INTO subscription_events
        (tenant_id, subscription_id, actor_user_id, event_type, details)
        VALUES (${tenantId}, ${current.id}, ${userId}, ${cancel ? 'cancellation.scheduled' : 'cancellation.resumed'}, '{}'::jsonb)`);
      return { id: current.id, cancelAtPeriodEnd: cancel };
    });
  }
  /** Administrative subscription timeline, restricted to the authenticated tenant. */
  async history() {
    requireCapability('pmoa_admin');
    const { tenantId } = currentContext();
    return withTenant(tenantId, async tx => rows(await tx.execute(sql`
      SELECT s.id, p.code AS "planCode", s.status,
             s.period_starts_at AS "periodStartsAt", s.period_ends_at AS "periodEndsAt",
             s.trial_ends_at AS "trialEndsAt", s.cancel_at_period_end AS "cancelAtPeriodEnd",
             s.created_at AS "createdAt"
      FROM tenant_subscriptions s
      JOIN subscription_plans p ON p.id = s.plan_id
      WHERE s.tenant_id = ${tenantId}
      ORDER BY s.created_at DESC, s.id DESC LIMIT 100`)));
  }

  /** Auditable tenant-only subscription activity; never trusts a caller-supplied tenant id. */
  async events() {
    requireCapability('pmoa_admin');
    const { tenantId } = currentContext();
    return withTenant(tenantId, async tx => rows(await tx.execute(sql`
      SELECT e.id, e.subscription_id AS "subscriptionId", e.event_type AS "eventType",
             e.actor_user_id AS "actorUserId", e.details, e.created_at AS "createdAt"
      FROM subscription_events e WHERE e.tenant_id = ${tenantId}
      ORDER BY e.created_at DESC, e.id DESC LIMIT 100`)));
  }

}
