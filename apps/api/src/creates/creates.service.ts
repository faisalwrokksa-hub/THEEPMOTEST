import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { projectDateError } from './project-dates';
import { mayChangeMembership, removesActiveOwner } from './membership-policy';
import { sql } from 'drizzle-orm';
import { withTenant, auditEvents } from '@pmo/db';
import { currentContext } from '../tenancy/tenant-context';
import { requireCapability } from '../common/require-capability';
import { criteriaFor } from '../governance/gate-templates';

const rows = (r: unknown) => r as unknown as any[];
const GATES = ['Concept', 'Feasibility', 'Design Development', 'Detailed Design',
               'Procurement', 'Construction', 'Handover'];

@Injectable()
export class CreatesService {
  private ctx() { return currentContext(); }

  private async audit(tx: any, entity: string, entityId: string, action: string, diff?: unknown) {
    const { tenantId, userId } = this.ctx();
    await tx.insert(auditEvents).values({
      tenantId, actorId: userId, entity, entityId, action, diff: (diff ?? null) as any,
    });
  }

  async portfolio(b: any) {
    requireCapability('pmoa_manage_projects');
    const { tenantId } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      const [r] = rows(await tx.execute(sql`
        INSERT INTO portfolios (tenant_id, name, description, health)
        VALUES (${tenantId}, ${b.name}, ${b.description ?? null}, ${b.health}::health)
        RETURNING id, name`));
      await this.audit(tx, 'portfolio', r.id, 'portfolio.created', { name: b.name });
      return r;
    });
  }

  async program(b: any) {
    requireCapability('pmoa_manage_projects');
    const { tenantId } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      // RLS means a portfolio from another workspace simply is not visible.
      const [pf] = rows(await tx.execute(sql`SELECT id FROM portfolios WHERE id = ${b.portfolioId}`));
      if (!pf) throw new NotFoundException('That portfolio does not exist in this workspace');
      const [r] = rows(await tx.execute(sql`
        INSERT INTO programs (tenant_id, portfolio_id, name, description, health)
        VALUES (${tenantId}, ${b.portfolioId}, ${b.name}, ${b.description ?? null}, ${b.health}::health)
        RETURNING id, name`));
      await this.audit(tx, 'program', r.id, 'program.created', { name: b.name });
      return r;
    });
  }

  /**
   * Creating a project also creates its seven gates, each with a checklist and
   * an accountable owner, and opens SG0. A project without gates cannot be
   * governed, so this is part of creation rather than a later step.
   */
  async project(b: any) {
    requireCapability('pmoa_manage_projects');
    // Setting an approved budget also writes the financial ledger.
    if (b.budgetAmount != null) requireCapability('pmoa_manage_finance');
    const { tenantId, userId } = this.ctx();
    const dateError = projectDateError(b.startDate, b.endDate);
    if (dateError) throw new BadRequestException(dateError);
    return withTenant(tenantId, async (tx) => {
      // Foreign keys alone do not establish ownership: their target rows may
      // belong to another tenant. Confirm both references under tenant RLS.
      if (b.programId) {
        const [program] = rows(await tx.execute(sql`SELECT id FROM programs WHERE id = ${b.programId}`));
        if (!program) throw new NotFoundException('That programme is not in this workspace');
      }
      if (b.ownerId) {
        const [member] = rows(await tx.execute(sql`SELECT user_id FROM memberships WHERE user_id = ${b.ownerId} AND is_active=true`));
        if (!member) throw new NotFoundException('The selected owner is not a workspace member');
      }
      const [dupe] = rows(await tx.execute(sql`SELECT id FROM projects WHERE code = ${b.code}`));
      if (dupe) throw new ConflictException(`Project code ${b.code} is already used in this workspace`);

      const [p] = rows(await tx.execute(sql`
        INSERT INTO projects (tenant_id, program_id, code, name, status, start_date, end_date,
                              budget_amount, owner_id)
        VALUES (${tenantId}, ${b.programId ?? null}, ${b.code}, ${b.name}, ${b.status}::project_status,
                ${b.startDate ?? null}, ${b.endDate ?? null},
                ${b.budgetAmount ?? null}, ${b.ownerId ?? userId ?? null})
        RETURNING id, code, name`));
      await this.audit(tx, 'project', p.id, 'project.created', { code: b.code, name: b.name });

      /*
       * A budget on the project must be matched by a cost line, or the two
       * disagree and every financial rollup is wrong. `pnpm check:data`
       * asserts exactly this, and caught it when it was missing.
       */
      if (b.budgetAmount) {
        await tx.execute(sql`
          INSERT INTO cost_entries (tenant_id, project_id, kind, category, amount, period, note)
          VALUES (${tenantId}, ${p.id}, 'budget', 'Total approved budget',
                  ${String(b.budgetAmount)}, ${b.startDate ?? null},
                  'Created with the project')`);
        await this.audit(tx, 'project', p.id, 'budget.created', { amount: b.budgetAmount });
      }

      if (!b.withGates) return { ...p, gates: 0 };

      const [tpl] = rows(await tx.execute(sql`
        SELECT definition FROM gate_templates WHERE is_active LIMIT 1`));
      const owner = b.ownerId ?? userId;
      let criteriaCount = 0;

      for (let seq = 0; seq < GATES.length; seq++) {
        const name = GATES[seq];
        const status = seq === 0 ? 'active' : 'locked';
        const [g] = rows(await tx.execute(sql`
          INSERT INTO gates (tenant_id, project_id, seq, name, status, opened_at)
          VALUES (${tenantId}, ${p.id}, ${seq}, ${name}, ${status}::gate_status,
                  ${seq === 0 ? sql`now()` : sql`NULL`})
          RETURNING id`));
        // Only the open gate needs its checklist now; later gates get theirs
        // when they open, so a template change applies to gates not yet reached.
        if (seq === 0) {
          for (const label of criteriaFor(name, tpl?.definition)) {
            await tx.execute(sql`
              INSERT INTO gate_criteria (tenant_id, gate_id, label) VALUES (${tenantId}, ${g.id}, ${label})`);
            criteriaCount++;
          }
          if (owner) {
            await tx.execute(sql`
              INSERT INTO approvals (tenant_id, gate_id, approver_id, is_accountable)
              VALUES (${tenantId}, ${g.id}, ${owner}, true)`);
          }
        }
      }
      await this.audit(tx, 'project', p.id, 'project.gates_created',
        { gates: GATES.length, openGate: 'SG0 Concept', criteria: criteriaCount });
      return { ...p, gates: GATES.length, criteria: criteriaCount };
    });
  }

  async raid(b: any) {
    requireCapability('pmoa_manage_raid');
    const { tenantId, userId } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      await this.mustOwnProject(tx, b.projectId);
      await this.mustOwnMember(tx, b.ownerId);

      let blocksGateId: string | null = null;
      if (b.blocksActiveGate) {
        // Share the project -> gate locking order with gate advancement and
        // workbook updates. The target must still be active after the lock.
        const [project] = rows(await tx.execute(sql`
          SELECT id FROM projects WHERE id = ${b.projectId} FOR UPDATE`));
        if (!project) throw new NotFoundException('That project does not exist in this workspace');
        const [g] = rows(await tx.execute(sql`
          SELECT id FROM gates WHERE project_id = ${b.projectId}
            AND status = 'active' FOR UPDATE`));
        if (!g) throw new ConflictException('No active stage gate is available to block');
        blocksGateId = g.id;
      }
      const [r] = rows(await tx.execute(sql`
        INSERT INTO raid_items (tenant_id, project_id, kind, title, detail, severity, likelihood,
                                owner_id, due_date, blocks_gate_id)
        VALUES (${tenantId}, ${b.projectId}, ${b.kind}::raid_kind, ${b.title}, ${b.detail ?? null},
                ${b.severity ?? null}, ${b.likelihood ?? null}, ${b.ownerId ?? userId ?? null},
                ${b.dueDate ?? null}, ${blocksGateId})
        RETURNING id, title`));
      await this.audit(tx, 'raid_item', r.id, 'raid.created',
        { kind: b.kind, title: b.title, blocksGate: Boolean(blocksGateId) });
      return { ...r, blocksGate: Boolean(blocksGateId) };
    });
  }

  async task(b: any) {
    requireCapability('pmoa_manage_work');
    const { tenantId, userId } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      await this.mustOwnProject(tx, b.projectId);
      await this.mustOwnMember(tx, b.assigneeId);
      const [r] = rows(await tx.execute(sql`
        INSERT INTO tasks (tenant_id, project_id, title, state, assignee_id, due_date, estimate_hours)
        VALUES (${tenantId}, ${b.projectId}, ${b.title}, ${b.state}::task_state,
                ${b.assigneeId ?? userId ?? null}, ${b.dueDate ?? null}, ${b.estimateHours ?? null})
        RETURNING id, title`));
      await this.audit(tx, 'task', r.id, 'task.created', { title: b.title });
      return r;
    });
  }

  /** Explicit visibility checks complement tenant RLS and give clear errors. */
  private async mustOwnProject(tx: any, projectId?: string) {
    if (!projectId) return;
    const [p] = rows(await tx.execute(sql`SELECT id FROM projects WHERE id = ${projectId}`));
    if (!p) throw new NotFoundException('That project does not exist in this workspace');
  }

  /** Users are global, so a valid user ID is not proof of tenant membership. */
  private async mustOwnMember(tx: any, memberId?: string) {
    if (!memberId) return;
    const [member] = rows(await tx.execute(sql`
      SELECT user_id FROM memberships WHERE user_id = ${memberId} AND is_active=true`));
    if (!member) throw new NotFoundException('That person is not a member of this workspace');
  }

  async benefit(b: any) {
    requireCapability('pmoa_manage_finance');
    const { tenantId } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      await this.mustOwnProject(tx, b.projectId);
      await this.mustOwnMember(tx, b.ownerId);
      const [r] = rows(await tx.execute(sql`
        INSERT INTO benefits (tenant_id, project_id, name, measure, baseline, target, actual,
                              status, review_date, owner_id)
        VALUES (${tenantId}, ${b.projectId ?? null}, ${b.name}, ${b.measure},
                ${b.baseline ?? null}, ${b.target ?? null}, ${b.actual ?? null},
                ${b.status}::benefit_status, ${b.reviewDate ?? null}, ${b.ownerId ?? null})
        RETURNING id, name`));
      await this.audit(tx, 'benefit', r.id, 'benefit.created', { name: b.name, measure: b.measure });
      return r;
    });
  }

  async stakeholder(b: any) {
    requireCapability('pmoa_manage_projects');
    const { tenantId } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      await this.mustOwnProject(tx, b.projectId);
      const [r] = rows(await tx.execute(sql`
        INSERT INTO stakeholders (tenant_id, project_id, name, organisation, role,
                                  influence, interest, email, phone, is_external)
        VALUES (${tenantId}, ${b.projectId ?? null}, ${b.name}, ${b.organisation ?? null},
                ${b.role ?? null}, ${b.influence ?? null}, ${b.interest ?? null},
                ${b.email ?? null}, ${b.phone ?? null}, ${b.isExternal})
        RETURNING id, name`));
      await this.audit(tx, 'stakeholder', r.id, 'stakeholder.created', { name: b.name });
      return r;
    });
  }

  async scheduleItem(b: any) {
    requireCapability('pmoa_manage_work');
    const { tenantId } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      await this.mustOwnProject(tx, b.projectId);
      /*
       * Baseline falls back to the planned dates. Slip is measured against the
       * baseline, so an item without one can never read as late — it would sit
       * in the schedule looking permanently on time however far it moved.
       */
      const baseStart = b.baselineStart ?? b.startDate ?? null;
      const baseEnd = b.baselineEnd ?? b.endDate ?? null;
      const [r] = rows(await tx.execute(sql`
        INSERT INTO schedule_items (tenant_id, project_id, name, kind, start_date, end_date,
                                    baseline_start, baseline_end, progress_pct, is_critical)
        VALUES (${tenantId}, ${b.projectId}, ${b.name}, ${b.kind}::schedule_kind,
                ${b.startDate ?? null}, ${b.endDate ?? null}, ${baseStart}, ${baseEnd},
                ${b.progressPct}, ${b.isCritical})
        RETURNING id, name`));
      await this.audit(tx, 'schedule_item', r.id, 'schedule.created',
        { name: b.name, kind: b.kind, critical: b.isCritical });
      return r;
    });
  }

  async cost(b: any) {
    // Writing money, not reading it. This asked for the view capability, so
    // anyone who could see the finances could also add to them.
    requireCapability('pmoa_manage_finance');
    const { tenantId } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      await this.mustOwnProject(tx, b.projectId);
      const [r] = rows(await tx.execute(sql`
        INSERT INTO cost_entries (tenant_id, project_id, kind, category, amount, currency, period, note)
        VALUES (${tenantId}, ${b.projectId}, ${b.kind}::cost_kind, ${b.category},
                ${String(b.amount)}, ${b.currency}, ${b.period ?? null}, ${b.note ?? null})
        RETURNING id, category`));
      await this.audit(tx, 'cost_entry', r.id, 'cost.created',
        { kind: b.kind, category: b.category, amount: b.amount });
      return r;
    });
  }

  async allocation(b: any) {
    requireCapability('pmoa_manage_work');
    const { tenantId } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      await this.mustOwnProject(tx, b.projectId);
      // Membership is the check that matters: RLS hides other workspaces'
      // projects, but the users table is global.
      const [m] = rows(await tx.execute(sql`
        SELECT user_id FROM memberships WHERE user_id = ${b.userId} AND is_active=true`));
      if (!m) throw new NotFoundException('That person is not a member of this workspace');
      const [r] = rows(await tx.execute(sql`
        INSERT INTO allocations (tenant_id, user_id, project_id, role, allocation_pct,
                                 start_date, end_date)
        VALUES (${tenantId}, ${b.userId}, ${b.projectId}, ${b.role}, ${b.allocationPct},
                ${b.startDate ?? null}, ${b.endDate ?? null})
        RETURNING id, role`));
      await this.audit(tx, 'allocation', r.id, 'allocation.created',
        { role: b.role, pct: b.allocationPct });
      return r;
    });
  }

  async document(b: any) {
    requireCapability('pmoa_manage_projects');
    const { tenantId, userId } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      await this.mustOwnProject(tx, b.projectId);
      await this.mustOwnMember(tx, b.ownerId);
      const [r] = rows(await tx.execute(sql`
        INSERT INTO documents (tenant_id, project_id, name, kind, version, status, url, owner_id)
        VALUES (${tenantId}, ${b.projectId ?? null}, ${b.name}, ${b.kind}, ${b.version},
                ${b.status}::doc_status, ${b.url ?? null}, ${b.ownerId ?? userId ?? null})
        RETURNING id, name`));
      await this.audit(tx, 'document', r.id, 'document.registered',
        { name: b.name, kind: b.kind, version: b.version });
      return r;
    });
  }

  // New membership is created only by onboarding.accept() after mailbox
  // ownership was proven with the signed, single-use invitation token.

  /** Change what a member may do, or retire them. */
  async updateMember(userId: string, b: any) {
    requireCapability('pmoa_manage_people');
    const { tenantId, userId: actor } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      // Serialize membership status changes per tenant: two owners cannot
      // concurrently disable one another and both pass the last-owner check.
      // An advisory transaction lock works with the restricted app DB role;
      // SELECT FOR UPDATE on the tenants row may require extra UPDATE rights.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId}::text, 0))`);
      const [m] = rows(await tx.execute(sql`
        SELECT user_id, role, is_active AS "isActive" FROM memberships
        WHERE tenant_id=${tenantId} AND user_id=${userId} FOR UPDATE`));
      if (!m) throw new NotFoundException('That person is not in this workspace');
      let otherActiveOwners = 0;
      if (removesActiveOwner(m.role, m.isActive, b.role, b.isActive)) {
        const [others] = rows(await tx.execute(sql`
          SELECT count(*)::int AS n FROM memberships
          WHERE tenant_id=${tenantId} AND role='owner' AND is_active=true AND user_id<>${userId}`));
        otherActiveOwners = Number(others?.n ?? 0);
      }
      const decision = mayChangeMembership(actor, userId, m.role, m.isActive, b.role, b.isActive, otherActiveOwners);
      if (!decision.ok) throw new ConflictException(decision.reason === 'self_lockout'
        ? 'You cannot change your own role or deactivate yourself'
        : 'The last active workspace owner cannot be deactivated or demoted');
      const roleChanged = b.role !== undefined && b.role !== m.role;
      const statusChanged = b.isActive !== undefined && b.isActive !== m.isActive;
      // A retry with the same values is not a change and must not generate
      // an extra audit entry (or rewrite a membership unnecessarily).
      if (!roleChanged && !statusChanged) return { ok: true, unchanged: true };
      if (roleChanged) {
        await tx.execute(sql`
          UPDATE memberships SET role=${b.role}::member_role WHERE tenant_id=${tenantId} AND user_id=${userId}`);
      }
      if (statusChanged) {
        // Suspending a membership must not lock a consultant out of other workspaces.
        // The global users.is_active flag is reserved for platform-wide account suspension.
        await tx.execute(sql`
          UPDATE memberships SET is_active=${b.isActive}
          WHERE tenant_id=${tenantId} AND user_id=${userId}`);
      }
      // Record exactly what changed, not the entire incoming request body.
      await this.audit(tx, 'membership', userId, 'member.changed', {
        ...(roleChanged ? { role: { before: m.role, after: b.role } } : {}),
        ...(statusChanged ? { isActive: { before: m.isActive, after: b.isActive } } : {}),
      });
      return { ok: true, unchanged: false };
    });
  }

  async update(b: any) {
    // Reporting an update changes tenant records; read-only roles may only view the feed.
    requireCapability('pmoa_post_updates');
    const { tenantId, userId } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      await this.mustOwnProject(tx, b.projectId);
      const [r] = rows(await tx.execute(sql`
        INSERT INTO updates (tenant_id, project_id, author_id, kind, body)
        VALUES (${tenantId}, ${b.projectId ?? null}, ${userId}, ${b.kind}, ${b.body})
        RETURNING id`));
      await this.audit(tx, 'update', r.id, 'update.posted', { kind: b.kind });
      return r;
    });
  }
}
