import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { projectDateError } from '../creates/project-dates';
import { requireCapability } from '../common/require-capability';
import { and, eq, desc, ilike, lt } from 'drizzle-orm';
import { withTenant, projects, portfolios, programs, memberships } from '@pmo/db';
import { can, type CreateProject } from '@pmo/contracts';
import { currentContext } from '../tenancy/tenant-context';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class PortfolioService {
  constructor(private readonly audit: AuditService) {}

  private tenant() { return currentContext().tenantId; }

  async listPortfolios() {
    return withTenant(this.tenant(), (tx) =>
      tx.select().from(portfolios).orderBy(desc(portfolios.createdAt)),
    );
  }

  async listPrograms() {
    return withTenant(this.tenant(), (tx) =>
      tx.select().from(programs).orderBy(desc(programs.createdAt)),
    );
  }

  async listProjects(opts: { limit: number; cursor?: string; q?: string; programId?: string }) {
    return withTenant(this.tenant(), async (tx) => {
      // No tenant_id predicate needed — RLS adds it. Kept honest by verify-rls.
      const where = [
        opts.q ? ilike(projects.name, `%${opts.q}%`) : undefined,
        opts.programId ? eq(projects.programId, opts.programId) : undefined,
        opts.cursor ? lt(projects.createdAt, new Date(opts.cursor)) : undefined,
      ].filter(Boolean) as any[];

      const rows = await tx
        .select().from(projects)
        .where(where.length ? and(...where) : undefined)
        .orderBy(desc(projects.createdAt))
        .limit(opts.limit + 1);

      const allowed = can(currentContext().capabilities ?? [], 'pmoa_view_financials');
      const items = rows.slice(0, opts.limit).map(p => allowed ? p : { ...p, budgetAmount: null });
      const nextCursor = rows.length > opts.limit
        ? items[items.length - 1].createdAt.toISOString()
        : null;
      return { items, nextCursor };
    });
  }

  async getProject(id: string) {
    const row = await withTenant(this.tenant(), async (tx) => {
      const [p] = await tx.select().from(projects).where(eq(projects.id, id)).limit(1);
      return p;
    });
    if (!row) throw new NotFoundException(`Project ${id} not found`);
    return can(currentContext().capabilities ?? [], 'pmoa_view_financials')
      ? row : { ...row, budgetAmount: null };
  }

  async createProject(input: CreateProject) {
    requireCapability('pmoa_manage_projects');
    const dateError = projectDateError(input.startDate, input.endDate);
    if (dateError) throw new BadRequestException(dateError);
    return withTenant(this.tenant(), async (tx) => {
      if (input.programId) {
        const [program] = await tx.select({ id: programs.id }).from(programs)
          .where(eq(programs.id, input.programId)).limit(1);
        if (!program) throw new NotFoundException('That programme is not in this workspace');
      }
      if (input.ownerId) {
        const [member] = await tx.select({ id: memberships.userId }).from(memberships)
          .where(and(eq(memberships.userId, input.ownerId), eq(memberships.isActive, true))).limit(1);
        if (!member) throw new NotFoundException('The selected owner is not a workspace member');
      }
      const [row] = await tx.insert(projects).values({
        tenantId: this.tenant(),
        programId: input.programId ?? null,
        code: input.code,
        name: input.name,
        status: input.status ?? 'planning',
        startDate: input.startDate ? new Date(input.startDate).toISOString().slice(0, 10) : null,
        endDate: input.endDate ? new Date(input.endDate).toISOString().slice(0, 10) : null,
        ownerId: input.ownerId ?? null,
      }).returning();

      await this.audit.record(tx, {
        entity: 'project', entityId: row.id, action: 'created',
        diff: { name: row.name, code: row.code },
      });
      return row;
    });
  }
}
