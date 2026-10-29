import { CanActivate, ExecutionContext, Injectable, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import { withTenant } from '@pmo/db';
import type { ModuleId } from '@pmo/contracts';
import { currentContext } from '../tenancy/tenant-context';

export const MODULE_KEY = 'requires_module';

/** Declare which module owns a controller or route. */
export const RequiresModule = (id: ModuleId) => SetMetadata(MODULE_KEY, id);

/**
 * Licensing enforced server-side.
 *
 * The brief is explicit that hiding a menu item is not enough: a tenant
 * without an entitlement must be refused by the API even if it calls the URL
 * directly. Core is always on — a tenant cannot switch off its own identity.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<ModuleId | undefined>(MODULE_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!required || required === 'core360') return true;

    const { tenantId } = currentContext();
    const [row] = (await withTenant(tenantId, (tx) => tx.execute(sql`
      SELECT m.name, m.status,
             coalesce(tm.enabled, false) AS enabled,
             tm.expires_at AS "expiresAt",
             (SELECT json_build_object('status', s.status, 'startsAt', s.period_starts_at, 'endsAt', s.period_ends_at, 'trialEndsAt', s.trial_ends_at)
                FROM tenant_subscriptions s WHERE s.tenant_id = ${tenantId}
                ORDER BY s.created_at DESC, s.id DESC LIMIT 1) AS subscription
      FROM modules m
      LEFT JOIN tenant_modules tm ON tm.module_id = m.id AND tm.tenant_id = ${tenantId}
      WHERE m.id = ${required}
    `))) as unknown as any[];

    if (!row) throw new ForbiddenException(`Unknown module: ${required}`);
    // Fail closed for commercial modules. Core remains accessible for login,
    // billing recovery and administrative remediation.
    const subscription = row.subscription;
    const now = Date.now();
    const starts = subscription && Date.parse(subscription.startsAt);
    const ends = subscription && Date.parse(subscription.endsAt);
    const trialEnd = subscription?.trialEndsAt && Date.parse(subscription.trialEndsAt);
    const active = subscription?.status === 'active' && starts <= now && now < ends;
    const trial = subscription?.status === 'trialing' && starts <= now &&
      now < ends && Number.isFinite(trialEnd) && now < trialEnd;
    if (!active && !trial)
      throw new ForbiddenException('No valid subscription for this workspace. Contact your administrator.');
    if (!row.enabled)
      throw new ForbiddenException(
        `${row.name} is not enabled for this workspace. An administrator can enable it in Platform settings.`);
    if (row.expiresAt && new Date(row.expiresAt) <= new Date())
      throw new ForbiddenException(`Your ${row.name} subscription expired on ${new Date(row.expiresAt).toDateString()}.`);

    return true;
  }
}
