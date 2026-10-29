import { Injectable } from '@nestjs/common';
import { auditEvents } from '@pmo/db';
import { currentContext } from '../tenancy/tenant-context';

type Tx = { insert: (t: any) => any };

@Injectable()
export class AuditService {
  /**
   * Takes the transaction as an argument on purpose: the ledger row is written
   * in the same transaction as the change, so the two cannot diverge.
   */
  async record(
    tx: Tx,
    input: { entity: string; entityId: string; action: string; diff?: Record<string, unknown> },
  ) {
    const { tenantId, userId } = currentContext();
    await tx.insert(auditEvents).values({
      tenantId,
      actorId: userId,
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      diff: input.diff ?? null,
    });
  }
}
