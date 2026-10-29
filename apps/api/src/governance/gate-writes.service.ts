import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { withTenant, auditEvents } from '@pmo/db';
import type { SetCriterion, Decide } from '@pmo/contracts';
import { currentContext } from '../tenancy/tenant-context';
import { requireCapability } from '../common/require-capability';
import { gateBlockers } from './gate-rules';
import { criteriaFor } from './gate-templates';

const rows = (r: unknown) => r as unknown as any[];

@Injectable()
export class GateWritesService {
  private ctx() { return currentContext(); }

  /**
   * A gate row is the serialization point for signatures, criteria, blockers
   * and advances. Every write that can change readiness must acquire this lock
   * before reading the mutable child row. PostgreSQL holds it until COMMIT.
   */
  private async lockGate(tx: any, gateId: string) {
    const [gate] = rows(await tx.execute(sql`
      SELECT id, status FROM gates WHERE id = ${gateId} FOR UPDATE`));
    if (!gate) throw new NotFoundException('Gate not found');
    return gate;
  }

  /** Audit row written inside the caller's transaction — never separately. */
  private async audit(tx: any, entity: string, entityId: string, action: string, diff?: unknown) {
    const { tenantId, userId } = this.ctx();
    await tx.insert(auditEvents).values({
      tenantId, actorId: userId, entity, entityId, action,
      diff: (diff ?? null) as any,
    });
  }

  /** Mark a criterion met or unmet. Evidence is required to mark one met. */
  async setCriterion(id: string, body: SetCriterion) {
    requireCapability('pmoa_manage_raid');
    const { tenantId, userId } = this.ctx();

    return withTenant(tenantId, async (tx) => {
      const [link] = rows(await tx.execute(sql`
        SELECT gate_id AS "gateId" FROM gate_criteria WHERE id = ${id}`));
      if (!link) throw new NotFoundException('Criterion not found');
      await this.lockGate(tx, link.gateId);
      // Re-read after acquiring the lock, not from a potentially stale snapshot.
      const [before] = rows(await tx.execute(sql`
        SELECT c.id, c.label, c.is_met AS "isMet", c.evidence_url AS "evidenceUrl", c.gate_id AS "gateId",
               g.status AS "gateStatus"
        FROM gate_criteria c JOIN gates g ON g.id = c.gate_id WHERE c.id = ${id}`));
      if (!before) throw new NotFoundException('Criterion not found');
      if (before.gateStatus === 'approved')
        throw new ConflictException('That gate is already approved; its criteria are now a record');

      const evidence = body.evidenceUrl ?? before.evidenceUrl ?? null;
      if (body.isMet && !evidence)
        throw new ConflictException('A criterion cannot be marked met without a link to its evidence');
      // Retried requests must not create a second audit event or rewrite the
      // evidence timestamp when the actual criterion has not changed.
      if (before.isMet === body.isMet && (before.evidenceUrl ?? null) === evidence)
        return { id, isMet: body.isMet, blockers: await gateBlockers(tx, before.gateId) };

      await tx.execute(sql`
        UPDATE gate_criteria SET
          is_met = ${body.isMet},
          evidence_url = ${evidence},
          met_at = ${body.isMet ? sql`now()` : sql`NULL`},
          met_by = ${body.isMet ? userId : null}
        WHERE id = ${id}`);

      await this.audit(tx, 'gate_criterion', id, body.isMet ? 'criterion.met' : 'criterion.unmet',
        { label: before.label, from: before.isMet, to: body.isMet, evidence });

      return { id, isMet: body.isMet, blockers: await gateBlockers(tx, before.gateId) };
    });
  }

  /** Record a signature. Only the assigned approver may sign their own row. */
  async decide(approvalId: string, body: Decide) {
    requireCapability('pmoa_approve');
    const { tenantId, userId } = this.ctx();

    return withTenant(tenantId, async (tx) => {
      const [link] = rows(await tx.execute(sql`
        SELECT gate_id AS "gateId" FROM approvals WHERE id = ${approvalId}`));
      if (!link) throw new NotFoundException('Approval not found');
      await this.lockGate(tx, link.gateId);
      // Re-read the decision after waiting for another signer or advancement.
      const [a] = rows(await tx.execute(sql`
        SELECT a.id, a.gate_id AS "gateId", a.approver_id AS "approverId",
               a.decision, a.is_accountable AS "isAccountable", g.status AS "gateStatus"
        FROM approvals a JOIN gates g ON g.id = a.gate_id WHERE a.id = ${approvalId}`));
      if (!a) throw new NotFoundException('Approval not found');
      if (a.gateStatus !== 'active')
        throw new ConflictException(`Cannot sign: the gate is ${a.gateStatus}`);
      if (a.decision !== 'pending')
        throw new ConflictException(`This approval was already ${a.decision}`);
      // Signing on someone else's behalf would make the audit trail a lie.
      if (a.approverId !== userId)
        throw new ConflictException('Only the assigned approver can record this signature');

      await tx.execute(sql`
        UPDATE approvals SET decision = ${body.decision}, comment = ${body.comment ?? null},
               decided_at = now() WHERE id = ${approvalId}`);
      await this.audit(tx, 'approval', approvalId, `approval.${body.decision}`,
        { gateId: a.gateId, accountable: a.isAccountable, comment: body.comment ?? null });

      return { id: approvalId, decision: body.decision, blockers: await gateBlockers(tx, a.gateId) };
    });
  }

  /** Read-only readiness, for the UI to explain itself. */
  async readiness(gateId: string) {
    const { tenantId } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      // A foreign or unknown gate must not be described as ready simply because
      // the blocker query returns an empty set under tenant row-level security.
      const [gate] = rows(await tx.execute(sql`SELECT id FROM gates WHERE id = ${gateId}`));
      if (!gate) throw new NotFoundException('Gate not found in this workspace');
      const blockers = await gateBlockers(tx, gateId);
      return { gateId, mayPass: blockers.length === 0, blockers };
    });
  }

  /**
   * Pass a gate. The rule is re-evaluated inside this transaction, so a client
   * that thinks it is ready cannot force it through — and the next gate opens
   * in the same commit, so a project can never sit with no active gate.
   */
  async advance(gateId: string) {
    requireCapability('pmoa_approve');
    const { tenantId } = this.ctx();

    return withTenant(tenantId, async (tx) => {
      // Lock project first: workbook updates lock their project before gates.
      // This shared ordering prevents an import/advance deadlock on the last gate.
      const [linked] = rows(await tx.execute(sql`
        SELECT project_id AS "projectId" FROM gates WHERE id = ${gateId}`));
      if (!linked) throw new NotFoundException('Gate not found');
      const [project] = rows(await tx.execute(sql`
        SELECT id FROM projects WHERE id = ${linked.projectId} FOR UPDATE`));
      if (!project) throw new NotFoundException('Project not found');
      await this.lockGate(tx, gateId);
      const [g] = rows(await tx.execute(sql`
        SELECT id, seq, name, project_id AS "projectId" FROM gates WHERE id = ${gateId}`));
      if (!g) throw new NotFoundException('Gate not found');

      const blockers = await gateBlockers(tx, gateId);
      if (blockers.length > 0)
        throw new ConflictException({
          message: 'This gate cannot be passed yet', blockers,
        });

      await tx.execute(sql`
        UPDATE gates SET status = 'approved', decided_at = now() WHERE id = ${gateId}`);

      const [next] = rows(await tx.execute(sql`
        SELECT id, seq, name FROM gates
        WHERE project_id = ${g.projectId} AND seq = ${g.seq + 1}`));
      if (next) {
        await tx.execute(sql`
          UPDATE gates SET status = 'active', opened_at = now() WHERE id = ${next.id}`);

        // A gate that opens with no checklist could never pass. Instantiate one
        // from the tenant's template for this project type, or the default.
        const [existing] = rows(await tx.execute(sql`
          SELECT count(*)::int AS n FROM gate_criteria WHERE gate_id = ${next.id}`));
        if (existing.n === 0) {
          const [tpl] = rows(await tx.execute(sql`
            SELECT definition FROM gate_templates WHERE is_active LIMIT 1`));
          const labels = criteriaFor(next.name, tpl?.definition);
          for (const label of labels) {
            await tx.execute(sql`
              INSERT INTO gate_criteria (tenant_id, gate_id, label)
              VALUES (${tenantId}, ${next.id}, ${label})`);
          }
          await this.audit(tx, 'gate', next.id, 'gate.opened',
            { gate: `SG${next.seq} ${next.name}`, criteriaCreated: labels.length });
        }

        // A gate also needs someone accountable, or it can never be signed.
        // Default to the project owner; the PMO can reassign it afterwards.
        const [hasAppr] = rows(await tx.execute(sql`
          SELECT count(*)::int AS n FROM approvals WHERE gate_id = ${next.id}`));
        if (hasAppr.n === 0) {
          const [proj] = rows(await tx.execute(sql`
            SELECT owner_id AS "ownerId" FROM projects WHERE id = ${g.projectId}`));
          const owner = proj?.ownerId
            ?? rows(await tx.execute(sql`
                 SELECT user_id AS id FROM memberships
                 WHERE role IN ('owner','admin','pmo_lead') AND is_active=true ORDER BY role LIMIT 1`))[0]?.id;
          if (owner) {
            await tx.execute(sql`
              INSERT INTO approvals (tenant_id, gate_id, approver_id, is_accountable)
              VALUES (${tenantId}, ${next.id}, ${owner}, true)`);
            await this.audit(tx, 'gate', next.id, 'gate.approver_assigned',
              { approverId: owner, accountable: true, reason: 'project owner by default' });
          }
        }
      } else {
        // Last gate passed: the project is delivered.
        await tx.execute(sql`
          UPDATE projects SET status = 'closed', progress_pct = 100 WHERE id = ${g.projectId}`);
      }

      await this.audit(tx, 'gate', gateId, 'gate.approved',
        { gate: `SG${g.seq} ${g.name}`, opened: next ? `SG${next.seq} ${next.name}` : null });

      const [openCrit] = next
        ? rows(await tx.execute(sql`
            SELECT count(*)::int AS n FROM gate_criteria WHERE gate_id = ${next.id}`))
        : [{ n: 0 }];

      return {
        passed: `SG${g.seq} ${g.name}`,
        nowActive: next ? `SG${next.seq} ${next.name}` : null,
        criteriaAwaiting: openCrit.n,
        projectClosed: !next,
      };
    });
  }

  async updateRaid(id: string, body: Record<string, unknown>) {
    requireCapability('pmoa_manage_raid');
    const { tenantId } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      const [link] = rows(await tx.execute(sql`
        SELECT blocks_gate_id AS "blocksGateId" FROM raid_items WHERE id = ${id}`));
      if (!link) throw new NotFoundException('Register item not found');
      if (link.blocksGateId) await this.lockGate(tx, link.blocksGateId);
      const [before] = rows(await tx.execute(sql`
        SELECT id, title, status, blocks_gate_id AS "blocksGateId" FROM raid_items WHERE id = ${id}`));
      if (!before) throw new NotFoundException('Register item not found');

      if (body.status !== undefined)
        await tx.execute(sql`UPDATE raid_items SET status = ${body.status as any} WHERE id = ${id}`);
      if (body.severity !== undefined)
        await tx.execute(sql`UPDATE raid_items SET severity = ${body.severity as any} WHERE id = ${id}`);
      if (body.likelihood !== undefined)
        await tx.execute(sql`UPDATE raid_items SET likelihood = ${body.likelihood as any} WHERE id = ${id}`);

      await this.audit(tx, 'raid_item', id, 'raid.updated', { title: before.title, ...body });
      return {
        id,
        blockers: before.blocksGateId ? await gateBlockers(tx, before.blocksGateId) : [],
      };
    });
  }

  async updateTask(id: string, state: string) {
    requireCapability('pmoa_manage_work');
    const { tenantId } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      const [before] = rows(await tx.execute(sql`
        SELECT id, title, state FROM tasks WHERE id = ${id}`));
      if (!before) throw new NotFoundException('Task not found');
      // Repeating the same state transition is an idempotent no-op.
      if (before.state === state) return { id, state };
      await tx.execute(sql`UPDATE tasks SET state = ${state as any} WHERE id = ${id}`);
      await this.audit(tx, 'task', id, 'task.moved',
        { title: before.title, from: before.state, to: state });
      return { id, state };
    });
  }

  /** Assign or replace the accountable approver on a gate. */
  async assignApprover(gateId: string, userId: string, accountable: boolean) {
    requireCapability('pmoa_manage_raid');
    const { tenantId } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      await this.lockGate(tx, gateId);
      const [g] = rows(await tx.execute(sql`
        SELECT id, status, seq, name FROM gates WHERE id = ${gateId}`));
      if (!g) throw new NotFoundException('Gate not found');
      if (g.status === 'approved')
        throw new ConflictException('That gate is already approved');

      // Membership is scoped by RLS, so this also proves the user is in this tenant.
      const [m] = rows(await tx.execute(sql`
        SELECT user_id AS id FROM memberships WHERE user_id = ${userId} AND is_active=true`));
      if (!m) throw new ConflictException('That person is not a member of this workspace');

      // Exactly one accountable owner: stand the previous one down first.
      if (accountable) {
        await tx.execute(sql`
          UPDATE approvals SET is_accountable = false
          WHERE gate_id = ${gateId} AND is_accountable`);
      }
      await tx.execute(sql`
        INSERT INTO approvals (tenant_id, gate_id, approver_id, is_accountable)
        VALUES (${tenantId}, ${gateId}, ${userId}, ${accountable})
        ON CONFLICT (gate_id, approver_id)
        DO UPDATE SET is_accountable = ${accountable}, decision = 'pending', decided_at = NULL`);

      await this.audit(tx, 'gate', gateId, 'gate.approver_assigned',
        { approverId: userId, accountable });
      return { gateId, blockers: await gateBlockers(tx, gateId) };
    });
  }

  /** Add an entry criterion to an open gate. */
  async addCriterion(gateId: string, label: string) {
    requireCapability('pmoa_manage_raid');
    const { tenantId } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      await this.lockGate(tx, gateId);
      const [g] = rows(await tx.execute(sql`SELECT id, status FROM gates WHERE id = ${gateId}`));
      if (!g) throw new NotFoundException('Gate not found');
      if (g.status === 'approved')
        throw new ConflictException('That gate is already approved');
      const [c] = rows(await tx.execute(sql`
        INSERT INTO gate_criteria (tenant_id, gate_id, label)
        VALUES (${tenantId}, ${gateId}, ${label}) RETURNING id`));
      await this.audit(tx, 'gate_criterion', c.id, 'criterion.added', { label });
      return { id: c.id, blockers: await gateBlockers(tx, gateId) };
    });
  }
}
