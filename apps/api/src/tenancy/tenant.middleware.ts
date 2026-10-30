import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AuthService, SESSION_COOKIE } from '../auth/auth.service';
import { runWithContext } from './tenant-context';
import { parseRuntimeDeployment, assertRuntimeDeploymentTenant } from './deployment-runtime';

/**
 * Establishes who is calling, from a signed-in session — not from headers.
 *
 * Temporary header authentication is allowed ONLY on a loopback connection
 * in local development, with explicit opt-in. Staging and production cannot
 * impersonate a member even if NODE_ENV is misconfigured.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly runtimeDeployment = parseRuntimeDeployment(process.env);
  constructor(private readonly auth: AuthService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const p = await this.auth.principal(req.cookies?.[SESSION_COOKIE]);
    if (p) {
      try {
        assertRuntimeDeploymentTenant(this.runtimeDeployment, { tenantId: p.tenantId, userId: p.userId });
      } catch {
        throw new UnauthorizedException('Workspace unavailable in this deployment');
      }
      return runWithContext(
        { tenantId: p.tenantId, userId: p.userId, role: p.role as any,
          capabilities: p.capabilities as any }, () => next());
    }

    if (process.env.NODE_ENV === 'development' &&
        (!process.env.DEPLOYMENT_ENV || process.env.DEPLOYMENT_ENV === 'development') &&
        process.env.ALLOW_HEADER_AUTH === 'true' &&
        ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) {
      const tenantId = req.header('x-tenant-id');
      const userId = req.header('x-user-id') ?? null;
      if (tenantId) {
        // Local header impersonation never bypasses a configured deployment registry.
        if (this.runtimeDeployment) throw new UnauthorizedException('Header authentication unavailable for deployed tenants');
        const { and, eq } = await import('drizzle-orm');
        const { withTenant, memberships } = await import('@pmo/db');
        if (!userId) throw new UnauthorizedException('Development header authentication requires a user ID');
        let role: any = 'viewer';
        {
          const [m] = await withTenant(tenantId, (tx) =>
            tx.select({ role: memberships.role }).from(memberships)
              .where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId), eq(memberships.isActive, true))).limit(1));
          if (!m) throw new UnauthorizedException('User is not a member of this tenant');
          role = m.role;
        }
        return runWithContext({ tenantId, userId, role, capabilities: [] }, () => next());
      }
    }

    throw new UnauthorizedException('Not signed in');
  }
}
