import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { withTenant, auditEvents } from '@pmo/db';
import { MODULE_CATALOGUE, type ModuleId } from '@pmo/contracts';
import { currentContext } from '../tenancy/tenant-context';
import { requireCapability } from '../common/require-capability';

const rows = (r: unknown) => r as unknown as any[];

@Injectable()
export class PlatformService {
  /** Catalogue plus this tenant's entitlements. */
  async list() {
    // Hiding the link is not access control: the page must refuse directly too.
    requireCapability('pmoa_platform');
    const { tenantId } = currentContext();
    const raw = await withTenant(tenantId, async (tx) => rows(await tx.execute(sql`
      SELECT m.id, m.name, m.summary, m.version, m.status, m.is_core AS "isCore",
             m.depends_on AS "dependsOn",
             CASE WHEN m.is_core THEN true
               ELSE coalesce(tm.enabled, false)
                 AND (tm.expires_at IS NULL OR tm.expires_at > now())
                 AND EXISTS (
                   SELECT 1 FROM tenant_subscriptions sub
                   WHERE sub.tenant_id = ${tenantId}
                     AND sub.id = (
                       SELECT latest.id FROM tenant_subscriptions latest
                       WHERE latest.tenant_id = ${tenantId}
                       ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1
                     )
                     AND sub.period_starts_at <= now()
                     AND sub.period_ends_at > now()
                     AND (sub.status = 'active'
                       OR (sub.status = 'trialing' AND sub.trial_ends_at > now()))
                 )
             END AS enabled,
             coalesce(tm.tier, 'standard') AS tier,
             tm.seat_limit AS "seatLimit", tm.expires_at AS "expiresAt",
             tm.enabled_at AS "enabledAt"
      FROM modules m
      LEFT JOIN tenant_modules tm ON tm.module_id = m.id AND tm.tenant_id = ${tenantId}
      ORDER BY m.sort_order`)));

    // jsonb arrives as a string over the raw-SQL path; normalise at the boundary
    // so no consumer has to guess the shape.
    return raw.map((m) => ({
      ...m,
      dependsOn: typeof m.dependsOn === 'string' ? JSON.parse(m.dependsOn) : (m.dependsOn ?? []),
      enabled: Boolean(m.enabled),
      isCore: Boolean(m.isCore),
    }));
  }

  /** Which module ids this tenant may use — the web app filters its nav with this. */
  async enabledIds(): Promise<string[]> {
    const { tenantId } = currentContext();
    return withTenant(tenantId, async (tx) => {
      // Navigation and dependency checks must reflect the same commercial
      // subscription gate enforced by ModuleGuard. Core stays available.
      const r = rows(await tx.execute(sql`
        SELECT m.id FROM modules m
        LEFT JOIN tenant_modules tm ON tm.module_id = m.id AND tm.tenant_id = ${tenantId}
        WHERE m.is_core
           OR (
             tm.enabled
             AND (tm.expires_at IS NULL OR tm.expires_at > now())
             AND EXISTS (
               SELECT 1 FROM tenant_subscriptions s
               WHERE s.tenant_id = ${tenantId}
                 AND s.id = (
                   SELECT newest.id FROM tenant_subscriptions newest
                   WHERE newest.tenant_id = ${tenantId}
                   ORDER BY newest.created_at DESC, newest.id DESC LIMIT 1
                 )
                 AND s.period_starts_at <= now()
                 AND s.period_ends_at > now()
                 AND (
                   s.status = 'active'
                   OR (s.status = 'trialing' AND s.trial_ends_at > now())
                 )
             )
           )`));
      return r.map((x) => x.id as string);
    });
  }

  async setModule(id: ModuleId, body: { enabled: boolean; tier?: string; seatLimit?: number | null }) {
    requireCapability('pmoa_platform');
    const { tenantId, userId } = currentContext();
    const def = MODULE_CATALOGUE.find((m) => m.id === id);
    if (!def) throw new BadRequestException(`Unknown module: ${id}`);
    if (def.isCore && !body.enabled)
      throw new ConflictException(`${def.name} is part of the platform and cannot be disabled.`);

    const enabled = await this.enabledIds();

    if (body.enabled) {
      // Cannot enable a module whose dependencies are off.
      const deps = def.dependsOn as readonly string[];
      const missing = deps.filter((d) => !enabled.includes(d));
      if (missing.length)
        throw new ConflictException(
          `${def.name} requires ${missing.join(', ')} to be enabled first.`);
      if (def.status === 'roadmap')
        throw new ConflictException(`${def.name} is not available for licensing yet.`);
    } else {
      // Cannot disable a module that others depend on.
      const dependents = MODULE_CATALOGUE
        .filter((m) => (m.dependsOn as readonly string[]).includes(id) && enabled.includes(m.id))
        .map((m) => m.name);
      if (dependents.length)
        throw new ConflictException(
          `${dependents.join(', ')} depend${dependents.length > 1 ? '' : 's'} on ${def.name}. Disable ${dependents.length > 1 ? 'them' : 'it'} first.`);
    }

    return withTenant(tenantId, async (tx) => {
      await tx.execute(sql`
        INSERT INTO tenant_modules (tenant_id, module_id, enabled, tier, seat_limit, enabled_at)
        VALUES (${tenantId}, ${id}, ${body.enabled}, ${(body.tier ?? 'standard') as any}::licence_tier,
                ${body.seatLimit ?? null}, ${body.enabled ? sql`now()` : sql`NULL`})
        ON CONFLICT (tenant_id, module_id) DO UPDATE SET
          enabled = ${body.enabled},
          tier = ${(body.tier ?? 'standard') as any}::licence_tier,
          seat_limit = ${body.seatLimit ?? null},
          enabled_at = ${body.enabled ? sql`now()` : sql`NULL`}`);
      await tx.insert(auditEvents).values({
        tenantId, actorId: userId, entity: 'module', entityId: tenantId,
        action: body.enabled ? 'module.enabled' : 'module.disabled',
        diff: { module: id, tier: body.tier ?? 'standard' } as any,
      });
      return { id, enabled: body.enabled };
    });
  }
}
