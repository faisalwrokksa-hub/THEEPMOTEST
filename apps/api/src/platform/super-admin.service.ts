import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { db, tenants, users, withTenant } from '@pmo/db';
import { currentContext } from '../tenancy/tenant-context';
import { requireCapability } from '../common/require-capability';
import type { PlanCreate, PlanUpdate, ManualGrant, AdminCancel } from './super-admin.schemas';

const rows = (value: unknown) => value as any[];
const planCode = /^[a-z][a-z0-9_-]{2,39}$/;

@Injectable()
export class SuperAdminService {
  /** Check both the signed-in capability and the CURRENT vendor flag, including after flag revocation. */
  private async vendorId(): Promise<string> {
    requireCapability('pmoa_platform');
    const { userId } = currentContext();
    if (!userId) throw new ForbiddenException('Platform administrator session required');
    const [vendor] = await db.select({ isPlatformAdmin: users.isPlatformAdmin })
      .from(users).where(eq(users.id, userId)).limit(1);
    if (!vendor?.isPlatformAdmin) throw new ForbiddenException('Platform administrator authorization revoked');
    return userId;
  }

  async plans() {
    await this.vendorId();
    return rows(await db.execute(sql`
      SELECT id, code, name, price_minor AS "priceMinor", currency,
             billing_interval AS "billingInterval", trial_days AS "trialDays",
             is_active AS "isActive", created_at AS "createdAt"
      FROM subscription_plans ORDER BY code LIMIT 500`));
  }

  /** Vendor-wide plan activity, newest first; customer changes remain in tenant events. */
  async audit() {
    await this.vendorId();
    return rows(await db.execute(sql`
      SELECT id, actor_user_id AS "actorUserId", entity_kind AS "entityKind",
             entity_id AS "entityId", action, details, created_at AS "createdAt"
      FROM platform_subscription_audit_events ORDER BY created_at DESC, id DESC LIMIT 100`));
  }

  async createPlan(body: PlanCreate) {
    const actor = await this.vendorId();
    return db.transaction(async tx => {
      const inserted = rows(await tx.execute(sql`
        INSERT INTO subscription_plans
          (code, name, price_minor, currency, billing_interval, trial_days, is_active)
        VALUES (${body.code}, ${body.name}, ${body.priceMinor}, ${body.currency},
                ${body.billingInterval}, ${body.trialDays}, ${body.isActive})
        ON CONFLICT (code) DO NOTHING RETURNING id, code`));
      if (!inserted.length) throw new ConflictException('Plan code already exists');
      await tx.execute(sql`INSERT INTO platform_subscription_audit_events
        (actor_user_id, entity_kind, entity_id, action, details)
        VALUES (${actor}, 'plan', ${inserted[0].id}, 'plan.created', ${JSON.stringify(body)}::jsonb)`);
      return inserted[0];
    });
  }

  async updatePlan(code: string, body: PlanUpdate) {
    const actor = await this.vendorId();
    if (!planCode.test(code)) throw new BadRequestException('Invalid plan code');
    return db.transaction(async tx => {
      const current = rows(await tx.execute(sql`
        SELECT id, name, is_active AS "isActive" FROM subscription_plans WHERE code = ${code} FOR UPDATE`))[0];
      if (!current) throw new NotFoundException('Plan not found');
      const name = body.name ?? current.name;
      const active = body.isActive ?? current.isActive;
      await tx.execute(sql`UPDATE subscription_plans SET name = ${name}, is_active = ${active}
        WHERE id = ${current.id}`);
      await tx.execute(sql`INSERT INTO platform_subscription_audit_events
        (actor_user_id, entity_kind, entity_id, action, details)
        VALUES (${actor}, 'plan', ${current.id}, 'plan.updated',
                ${JSON.stringify({ before: { name: current.name, isActive: current.isActive }, changes: body })}::jsonb)`);
      return { code, name, isActive: active };
    });
  }

  async tenants(rawLimit?: string, rawOffset?: string) {
    await this.vendorId();
    const limit = rawLimit === undefined ? 25 : Number(rawLimit);
    const offset = rawOffset === undefined ? 0 : Number(rawOffset);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 ||
        !Number.isSafeInteger(offset) || offset < 0 || offset > 10_000)
      throw new BadRequestException('Use limit 1–50 and offset 0–10000');
    const results = await db.select({ id: tenants.id, name: tenants.name, slug: tenants.slug })
      .from(tenants).orderBy(tenants.name, tenants.id).limit(limit).offset(offset);
    // Ordinary app DB role never bypasses RLS. Each customer's subscription is
    // read in its own transaction with a transaction-local tenant setting.
    const items = [];
    for (const tenant of results) {
      const latest = await withTenant(tenant.id, async tx => rows(await tx.execute(sql`
        SELECT s.id, s.status, s.period_ends_at AS "periodEndsAt", p.code AS "planCode"
        FROM tenant_subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
        WHERE s.tenant_id = ${tenant.id}
        ORDER BY s.created_at DESC, s.id DESC LIMIT 1`)));
      items.push({ ...tenant, subscription: latest[0] ?? null });
    }
    return { items, limit, offset, hasMore: results.length === limit };
  }

  async history(tenantId: string) {
    await this.vendorId();
    await this.existingTenant(tenantId);
    return withTenant(tenantId, async tx => rows(await tx.execute(sql`
      SELECT s.id, s.status, s.period_starts_at AS "periodStartsAt",
             s.period_ends_at AS "periodEndsAt", s.trial_ends_at AS "trialEndsAt",
             s.cancel_at_period_end AS "cancelAtPeriodEnd",
             s.created_at AS "createdAt", p.code AS "planCode"
      FROM tenant_subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
      WHERE s.tenant_id = ${tenantId} ORDER BY s.created_at DESC, s.id DESC LIMIT 100`)));
  }

  private async existingTenant(tenantId: string): Promise<void> {
    const [tenant] = await db.select({ id: tenants.id }).from(tenants)
      .where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) throw new NotFoundException('Customer workspace not found');
  }

  /** Manual commercial grant is NOT proof of payment. Log the human reason. */
  async provision(tenantId: string, body: ManualGrant) {
    const actor = await this.vendorId();
    await this.existingTenant(tenantId);
    return withTenant(tenantId, async tx => {
      // App role cannot SELECT FOR UPDATE on global tenants (correctly no UPDATE privilege).
      // A transaction-scoped advisory lock serializes grants for this tenant.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1212, hashtext(${tenantId}))`);
      const plan = rows(await tx.execute(sql`
        SELECT id FROM subscription_plans WHERE code = ${body.planCode} AND is_active = true`))[0];
      if (!plan) throw new NotFoundException('Active subscription plan not found');
      const current = rows(await tx.execute(sql`
        SELECT id, status FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`))[0];
      if (current && !['canceled', 'expired'].includes(current.status)) {
        await tx.execute(sql`UPDATE tenant_subscriptions
          SET status = 'canceled', canceled_at = now(), updated_at = now()
          WHERE id = ${current.id} AND tenant_id = ${tenantId}`);
        await tx.execute(sql`INSERT INTO subscription_events
          (tenant_id, subscription_id, actor_user_id, event_type, details)
          VALUES (${tenantId}, ${current.id}, ${actor}, 'subscription.replaced_manually',
                  ${JSON.stringify({ reason: body.reason })}::jsonb)`);
      }
      const created = rows(await tx.execute(sql`
        INSERT INTO tenant_subscriptions
          (tenant_id, plan_id, status, period_starts_at, period_ends_at, trial_ends_at)
        VALUES (${tenantId}, ${plan.id}, ${body.status},
                ${body.periodStartsAt}::timestamptz, ${body.periodEndsAt}::timestamptz,
                ${body.trialEndsAt ?? null}::timestamptz) RETURNING id`))[0];
      await tx.execute(sql`INSERT INTO subscription_events
        (tenant_id, subscription_id, actor_user_id, event_type, details)
        VALUES (${tenantId}, ${created.id}, ${actor}, 'subscription.manually_granted',
                ${JSON.stringify({ planCode: body.planCode, status: body.status, reason: body.reason, paymentVerified: false })}::jsonb)`);
      return { subscriptionId: created.id, tenantId, status: body.status, source: 'manual_grant', paymentVerified: false };
    });
  }

  async cancel(tenantId: string, subscriptionId: string, body: AdminCancel) {
    const actor = await this.vendorId();
    await this.existingTenant(tenantId);
    return withTenant(tenantId, async tx => {
      // Share the tenant's grant lock so a concurrent cancellation cannot race a new grant.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(1212, hashtext(${tenantId}))`);
      const latest = rows(await tx.execute(sql`
        SELECT id, status FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`))[0];
      if (!latest || latest.id !== subscriptionId) throw new NotFoundException('Current subscription not found');
      if (['canceled', 'expired'].includes(latest.status))
        throw new ConflictException('Subscription is already inactive');
      await tx.execute(sql`UPDATE tenant_subscriptions SET status = 'canceled',
        canceled_at = now(), cancel_at_period_end = false, updated_at = now()
        WHERE id = ${subscriptionId} AND tenant_id = ${tenantId}`);
      await tx.execute(sql`INSERT INTO subscription_events
        (tenant_id, subscription_id, actor_user_id, event_type, details)
        VALUES (${tenantId}, ${subscriptionId}, ${actor}, 'subscription.canceled_by_platform',
                ${JSON.stringify({ reason: body.reason })}::jsonb)`);
      return { subscriptionId, tenantId, status: 'canceled' };
    });
  }
}
