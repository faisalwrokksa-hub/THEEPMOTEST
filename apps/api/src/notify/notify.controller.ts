import { BadRequestException, Controller, Get, Post, Query } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { withTenant } from '@pmo/db';
import { currentContext } from '../tenancy/tenant-context';
import { requireCapability } from '../common/require-capability';
import { NotifyService } from './notify.service';

const rows = (r: unknown) => r as unknown as any[];

@Controller('api/v1/notifications')
export class NotifyController {
  constructor(private readonly svc: NotifyService) {}

  /** The outbox for this workspace, plus whether anything is actually sending. */
  @Get()
  async list(@Query('limit') limit?: string) {
    // Delivery errors, recipients and message subjects are administrative data.
    // Authentication alone (the `read` capability) is not sufficient.
    requireCapability('pmoa_admin');
    const { tenantId } = currentContext();
    const n = limit === undefined ? 100 : Number(limit);
    if (!Number.isSafeInteger(n) || n < 1 || n > 500) {
      throw new BadRequestException('Notification limit must be an integer between 1 and 500');
    }
    return withTenant(tenantId, async (tx) => {
      const items = rows(await tx.execute(sql`
        SELECT id, to_email AS "toEmail", kind, subject, status, error, lang,
               entity, entity_id AS "entityId", sent_at AS "sentAt", created_at AS "createdAt"
        FROM notifications ORDER BY created_at DESC LIMIT ${n}`));
      const counts = rows(await tx.execute(sql`
        SELECT status, count(*)::int AS n FROM notifications GROUP BY status`));
      return {
        transport: this.svc.transportStatus,
        counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
        items,
      };
    });
  }

  /**
   * Evaluate the rules now rather than waiting for the hour.
   *
   * Admin-only: it is cheap, but it is still a job anyone could hammer, and
   * the people who need it are the people configuring the rules.
   */
  @Post('run')
  async run() {
    requireCapability('pmoa_admin');
    const scanned = await this.svc.scan();
    const flushed = await this.svc.flush();
    return { ...scanned, ...flushed, transport: this.svc.transportStatus };
  }
}
