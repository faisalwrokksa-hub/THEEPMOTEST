import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { withTenant } from '@pmo/db';
import { currentContext } from '../tenancy/tenant-context';
import { capabilitiesFor, can } from '@pmo/contracts';
import { activeGateState, executiveAttentionQuery } from '../governance/executive-gate-query';

const rows = (r: unknown) => r as unknown as any[];

@Injectable()
export class InsightsService {
  private ctx() { return currentContext(); }
  private tenant() { return this.ctx().tenantId; }

  /** Executive Overview — every tile is a real aggregate, none hard-coded. */
  async overview() {
    return withTenant(this.tenant(), async (tx) => {
      const [health] = rows(await tx.execute(sql`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE health='on_track')::int AS on_track,
               count(*) FILTER (WHERE health='at_risk')::int  AS at_risk,
               count(*) FILTER (WHERE health='critical')::int AS critical,
               coalesce(round(avg(progress_pct))::int,0)      AS avg_progress
        FROM projects`));
      // Never query or return financial totals to users without finance access.
      const [money] = can(this.ctx().capabilities ?? [], 'pmoa_view_financials')
        ? rows(await tx.execute(sql`
        WITH per_cat AS (
          SELECT project_id, category,
                 coalesce(sum(amount) FILTER (WHERE kind='budget'),0)     AS budget,
                 coalesce(sum(amount) FILTER (WHERE kind='commitment'),0) AS committed,
                 coalesce(sum(amount) FILTER (WHERE kind='actual'),0)     AS actual,
                 sum(amount) FILTER (WHERE kind='forecast')               AS forecast
          FROM cost_entries GROUP BY project_id, category
        )
        SELECT sum(budget)::float AS budget, sum(committed)::float AS committed,
               sum(actual)::float AS actual,
               sum(coalesce(forecast, budget))::float AS forecast
        FROM per_cat`)) : [null];
      const [gates] = rows(await tx.execute(sql`
        ${activeGateState}
        SELECT count(*)::int AS active,
               count(*) FILTER (WHERE is_blocked)::int AS blocked
        FROM gate_state`));
      const [reg] = rows(await tx.execute(sql`
        SELECT count(*) FILTER (WHERE status<>'closed')::int AS open,
               count(*) FILTER (WHERE status<>'closed'
                 AND coalesce(severity,0)*coalesce(likelihood,0) >= 15)::int AS critical,
               count(*) FILTER (WHERE status<>'closed' AND due_date < current_date)::int AS overdue
        FROM raid_items`));
      /** Averaged over STARTED benefits only — including not-yet-started ones
       *  dragged the figure toward zero and read as underperformance. */
      const [ben] = rows(await tx.execute(sql`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE status='realized')::int AS realized,
               count(*) FILTER (WHERE status='planned')::int  AS not_started,
               count(*) FILTER (WHERE status <> 'planned')::int AS started,
               coalesce(round(avg(
                 CASE WHEN status <> 'planned' AND target IS NOT NULL AND baseline IS NOT NULL
                           AND target <> baseline
                      THEN greatest(0, least(100,
                        ((coalesce(actual, baseline) - baseline) / (target - baseline)) * 100))
                 END))::int, 0) AS avg_pct
        FROM benefits`));
      const attention = rows(await tx.execute(executiveAttentionQuery));
      return { health, money, gates, register: reg, benefits: ben, attention };
    });
  }

  /** My Work — tasks, criteria to evidence, and approvals awaiting me. */
  async myWork() {
    const { tenantId, userId } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      const tasks = rows(await tx.execute(sql`
        SELECT t.id, t.title, t.state, t.due_date AS "dueDate", p.code AS "projectCode",
               (t.due_date < current_date) AS overdue
        FROM tasks t JOIN projects p ON p.id=t.project_id
        WHERE t.assignee_id = ${userId} AND t.state <> 'done'
        ORDER BY t.due_date NULLS LAST`));
      const approvals = rows(await tx.execute(sql`
        SELECT a.id, p.code AS "projectCode", 'SG'||g.seq||' '||g.name AS gate,
               a.is_accountable AS "isAccountable",
               (SELECT count(*)::int FROM gate_criteria c WHERE c.gate_id=g.id AND NOT c.is_met) AS "criteriaOutstanding"
        FROM approvals a
        JOIN gates g ON g.id=a.gate_id JOIN projects p ON p.id=g.project_id
        WHERE a.approver_id = ${userId} AND a.decision='pending'
        ORDER BY a.is_accountable DESC`));
      const criteria = rows(await tx.execute(sql`
        SELECT c.id, c.label, p.code AS "projectCode", 'SG'||g.seq||' '||g.name AS gate
        FROM gate_criteria c
        JOIN gates g ON g.id=c.gate_id JOIN projects p ON p.id=g.project_id
        JOIN approvals a ON a.gate_id=g.id AND a.approver_id=${userId}
        WHERE NOT c.is_met AND g.status='active'`));
      const [effort] = rows(await tx.execute(sql`
        SELECT coalesce(sum(hours),0)::float AS hours FROM effort_entries
        WHERE user_id=${userId} AND work_date >= current_date - interval '7 days'`));
      return { tasks, approvals, criteria, effortLast7Days: effort?.hours ?? 0 };
    });
  }

  /** Activity & Attention — the audit feed plus what needs a decision. */
  async activity() {
    return withTenant(this.tenant(), async (tx) => {
      const feed = rows(await tx.execute(sql`
        SELECT e.id, e.entity, e.action, e.at,
               CASE WHEN ${can(this.ctx().capabilities ?? [], 'pmoa_view_financials')}
                    THEN e.diff ELSE NULL::jsonb END AS diff,
               coalesce(u.display_name,'system') AS actor
        FROM audit_events e LEFT JOIN users u ON u.id=e.actor_id
        ORDER BY e.at DESC LIMIT 40`));
      const needs = rows(await tx.execute(sql`
        SELECT 'Gate blocked' AS kind, p.code AS ref,
               'SG'||g.seq||' '||g.name||' — '||r.title AS detail, r.due_date AS due
        FROM raid_items r
        JOIN gates g ON g.id=r.blocks_gate_id JOIN projects p ON p.id=g.project_id
        WHERE r.status <> 'closed'
        UNION ALL
        SELECT 'Overdue task', p.code, t.title, t.due_date
        FROM tasks t JOIN projects p ON p.id=t.project_id
        WHERE t.state<>'done' AND t.due_date < current_date
        UNION ALL
        SELECT 'Awaiting signature', p.code,
               'SG'||g.seq||' '||g.name||' — '||coalesce(u.display_name,'unassigned'), NULL
        FROM approvals a JOIN gates g ON g.id=a.gate_id
        JOIN projects p ON p.id=g.project_id LEFT JOIN users u ON u.id=a.approver_id
        WHERE a.decision='pending' AND g.status='active'
        ORDER BY due NULLS LAST`));
      return { feed, needs };
    });
  }

  /** Financials — budget vs committed vs actual, variance and a simple EAC. */
  async financials() {
    return withTenant(this.tenant(), async (tx) => {
      /**
       * Forecast must be built per CATEGORY, falling back to that category's
       * budget where no forecast exists. Summing only the forecast rows and
       * comparing to the whole budget made a project look under-budget purely
       * because most of its categories had no forecast yet.
       */
      const byProject = rows(await tx.execute(sql`
        WITH per_cat AS (
          SELECT project_id, category,
                 coalesce(sum(amount) FILTER (WHERE kind='budget'),0)     AS budget,
                 coalesce(sum(amount) FILTER (WHERE kind='commitment'),0) AS committed,
                 coalesce(sum(amount) FILTER (WHERE kind='actual'),0)     AS actual,
                 sum(amount) FILTER (WHERE kind='forecast')               AS forecast
          FROM cost_entries GROUP BY project_id, category
        ), agg AS (
          SELECT project_id,
                 sum(budget)::float    AS budget,
                 sum(committed)::float AS committed,
                 sum(actual)::float    AS actual,
                 sum(coalesce(forecast, budget))::float AS forecast,
                 count(*) FILTER (WHERE forecast IS NOT NULL)::int AS forecast_cats,
                 count(*)::int AS total_cats
          FROM per_cat GROUP BY project_id
        )
        SELECT p.id, p.code, p.name, p.progress_pct AS "progressPct",
               coalesce(a.budget,0)    AS budget,
               coalesce(a.committed,0) AS committed,
               coalesce(a.actual,0)    AS actual,
               coalesce(a.forecast,0)  AS forecast,
               coalesce(a.forecast_cats,0) AS "forecastCats",
               coalesce(a.total_cats,0)    AS "totalCats"
        FROM projects p LEFT JOIN agg a ON a.project_id=p.id
        ORDER BY p.code`));
      const byCategory = rows(await tx.execute(sql`
        SELECT category,
               coalesce(sum(amount) FILTER (WHERE kind='budget'),0)::float AS budget,
               coalesce(sum(amount) FILTER (WHERE kind='actual'),0)::float AS actual
        FROM cost_entries GROUP BY category ORDER BY budget DESC`));
      return {
        byProject: byProject.map((r) => {
          // Earned value at its simplest: percent complete x budget.
          const ev = (r.progressPct / 100) * r.budget;
          /**
           * CPI is only meaningful once actual spend covers a comparable scope.
           * Early on, actuals cover design fees while progress is measured against
           * the whole project — which yields a CPI of 20+ that means nothing.
           * Below 15% drawn we report null and the UI says "too early".
           */
          const drawn = r.budget > 0 ? r.actual / r.budget : 0;
          const meaningful = r.actual > 0 && drawn >= 0.15;
          const cpi = meaningful ? ev / r.actual : null;
          return {
            ...r,
            earnedValue: ev,
            drawnPct: drawn * 100,
            cpi,
            cpiSuppressed: !meaningful && r.budget > 0,
            eac: cpi && cpi > 0 ? r.budget / cpi : null,
            // forecast already falls back to budget per category, so this is comparable
            variance: r.forecast - r.budget,
            /** How much of the forecast is a real estimate vs just the budget repeated. */
            forecastCoverage: r.totalCats ? r.forecastCats / r.totalCats : 0,
          };
        }),
        byCategory,
      };
    });
  }

  async benefits() {
    return withTenant(this.tenant(), async (tx) => rows(await tx.execute(sql`
      SELECT b.id, b.name, b.measure, b.baseline::float, b.target::float, b.actual::float,
             b.status, b.review_date AS "reviewDate",
             p.code AS "projectCode", u.display_name AS "owner",
             CASE WHEN b.target < b.baseline THEN 'decrease' ELSE 'increase' END AS direction,
             /*
              * Progress must be measured from baseline toward target, not
              * actual/target. For a reduction target (4200 -> 900) the old
              * formula returned 233% and clamped to "fully realized".
              */
             CASE
               WHEN b.target IS NULL OR b.baseline IS NULL OR b.target = b.baseline THEN NULL
               ELSE greatest(0, least(100, round(
                 ((coalesce(b.actual, b.baseline) - b.baseline)
                  / (b.target - b.baseline)) * 100)))::int
             END AS "pctOfTarget"
      FROM benefits b LEFT JOIN projects p ON p.id=b.project_id
      LEFT JOIN users u ON u.id=b.owner_id
      ORDER BY b.review_date NULLS LAST`)));
  }

  async resources() {
    return withTenant(this.tenant(), async (tx) => {
      const people = rows(await tx.execute(sql`
        SELECT u.id, u.display_name AS name,
               coalesce(sum(a.allocation_pct),0)::int AS "allocatedPct",
               count(DISTINCT a.project_id)::int AS projects,
               coalesce((SELECT sum(e.hours) FROM effort_entries e
                  WHERE e.user_id=u.id AND e.work_date >= current_date - interval '7 days'),0)::float AS "hoursLast7"
        FROM users u JOIN memberships m ON m.user_id=u.id AND m.is_active=true AND u.is_active=true
        LEFT JOIN allocations a ON a.user_id=u.id
        GROUP BY u.id, u.display_name ORDER BY "allocatedPct" DESC`));
      const byProject = rows(await tx.execute(sql`
        SELECT p.code AS "projectCode", u.display_name AS name, a.role,
               a.allocation_pct AS "allocationPct"
        FROM allocations a JOIN users u ON u.id=a.user_id
        JOIN projects p ON p.id=a.project_id ORDER BY p.code, a.allocation_pct DESC`));
      return { people, byProject };
    });
  }

  async schedule() {
    return withTenant(this.tenant(), async (tx) => rows(await tx.execute(sql`
      SELECT si.id, si.name, si.kind, si.start_date AS "startDate", si.end_date AS "endDate",
             si.baseline_start AS "baselineStart", si.baseline_end AS "baselineEnd",
             si.progress_pct AS "progressPct", si.is_critical AS "isCritical",
             p.code AS "projectCode",
             CASE WHEN si.baseline_end IS NULL OR si.end_date IS NULL THEN NULL
                  ELSE (si.end_date - si.baseline_end) END AS "slipDays"
      FROM schedule_items si JOIN projects p ON p.id=si.project_id
      ORDER BY p.code, si.start_date`)));
  }

  async studio() {
    return withTenant(this.tenant(), async (tx) => ({
      fields: rows(await tx.execute(sql`
        SELECT id, applies_to AS "appliesTo", label, field_key AS "fieldKey",
               field_type AS "fieldType", options, is_required AS "isRequired",
               is_active AS "isActive" FROM custom_fields ORDER BY applies_to, label`)),
      templates: rows(await tx.execute(sql`
        SELECT id, name, project_type AS "projectType", definition,
               is_active AS "isActive" FROM gate_templates ORDER BY name`)),
      automations: rows(await tx.execute(sql`
        SELECT id, name, trigger, action, is_active AS "isActive",
               run_count AS "runCount", last_run_at AS "lastRunAt"
        FROM automations ORDER BY is_active DESC, name`)),
    }));
  }

  async reports() {
    return withTenant(this.tenant(), async (tx) => rows(await tx.execute(sql`
      SELECT id, name, kind, audience, schedule, last_run_at AS "lastRunAt"
      FROM report_defs ORDER BY name`)));
  }

  /** Who am I, and what may I do? The UI gates navigation on this. */
  async me() {
    const { tenantId, userId, role } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      const [t] = rows(await tx.execute(sql`SELECT name FROM tenants WHERE id=${tenantId}`));
      const [u] = userId
        ? rows(await tx.execute(sql`SELECT display_name AS "displayName" FROM users WHERE id=${userId}`))
        : [undefined];
      return {
        tenantId, tenantName: t?.name ?? 'Unknown',
        userId, displayName: u?.displayName ?? null,
        role, capabilities: capabilitiesFor(role),
      };
    });
  }

  /** Decisions — a filtered view of the register, promoted to its own module. */
  async decisions() {
    return withTenant(this.tenant(), async (tx) => rows(await tx.execute(sql`
      SELECT r.id, r.title, r.detail, r.status, r.created_at AS "decidedAt",
             p.code AS "projectCode", u.display_name AS "owner",
             CASE WHEN r.blocks_gate_id IS NULL THEN NULL
                  ELSE (SELECT 'SG'||g.seq||' '||g.name FROM gates g WHERE g.id=r.blocks_gate_id) END AS "atGate"
      FROM raid_items r JOIN projects p ON p.id=r.project_id
      LEFT JOIN users u ON u.id=r.owner_id
      WHERE r.kind='decision' ORDER BY r.created_at DESC`)));
  }

  /** Approvals — everything awaiting a signature, most blocking first. */
  async approvals() {
    return withTenant(this.tenant(), async (tx) => rows(await tx.execute(sql`
      SELECT a.id, a.decision, a.is_accountable AS "isAccountable", a.comment,
             a.decided_at AS "decidedAt", p.code AS "projectCode", p.name AS "projectName",
             'SG'||g.seq||' '||g.name AS gate, g.status AS "gateStatus",
             u.display_name AS approver,
             (SELECT count(*)::int FROM gate_criteria c WHERE c.gate_id=g.id AND NOT c.is_met) AS "criteriaOutstanding",
             (SELECT count(*)::int FROM raid_items r WHERE r.blocks_gate_id=g.id AND r.status<>'closed') AS blockers
      FROM approvals a
      JOIN gates g ON g.id=a.gate_id JOIN projects p ON p.id=g.project_id
      LEFT JOIN users u ON u.id=a.approver_id
      ORDER BY (a.decision='pending') DESC, a.is_accountable DESC, p.code`)));
  }

  /** Portfolio analytics — distributions and trends over the whole portfolio. */
  async analytics() {
    return withTenant(this.tenant(), async (tx) => {
      const byHealth = rows(await tx.execute(sql`
        SELECT health, count(*)::int AS n FROM projects GROUP BY health`));
      const byStatus = rows(await tx.execute(sql`
        SELECT status, count(*)::int AS n FROM projects GROUP BY status`));
      const gateFunnel = rows(await tx.execute(sql`
        SELECT g.seq, g.name,
               count(*) FILTER (WHERE g.status='approved')::int AS approved,
               count(*) FILTER (WHERE g.status='active')::int   AS active,
               count(*) FILTER (WHERE g.status='locked')::int   AS locked
        FROM gates g GROUP BY g.seq, g.name ORDER BY g.seq`));
      const riskHeat = rows(await tx.execute(sql`
        SELECT severity, likelihood, count(*)::int AS n FROM raid_items
        WHERE status<>'closed' AND severity IS NOT NULL AND likelihood IS NOT NULL
        GROUP BY severity, likelihood`));
      const spendByProject = can(this.ctx().capabilities ?? [], 'pmoa_view_financials')
        ? rows(await tx.execute(sql`
        SELECT p.code,
               coalesce(sum(c.amount) FILTER (WHERE c.kind='budget'),0)::float AS budget,
               coalesce(sum(c.amount) FILTER (WHERE c.kind='actual'),0)::float AS actual
        FROM projects p LEFT JOIN cost_entries c ON c.project_id=p.id
        GROUP BY p.code ORDER BY budget DESC`)) : [];
      const slip = rows(await tx.execute(sql`
        SELECT p.code, count(*) FILTER (WHERE si.end_date > si.baseline_end)::int AS slipped,
               count(*) FILTER (WHERE si.baseline_end IS NOT NULL)::int AS baselined,
               coalesce(max(si.end_date - si.baseline_end),0)::int AS "worstSlipDays"
        FROM projects p JOIN schedule_items si ON si.project_id=p.id
        GROUP BY p.code ORDER BY "worstSlipDays" DESC`));
      return { byHealth, byStatus, gateFunnel, riskHeat, spendByProject, slip };
    });
  }

  async documents() {
    return withTenant(this.tenant(), async (tx) => rows(await tx.execute(sql`
      SELECT d.id, d.name, d.kind, d.version, d.status, d.url, d.size_kb AS "sizeKb",
             d.updated_at AS "updatedAt", p.code AS "projectCode", u.display_name AS owner,
             c.label AS "evidenceFor",
             -- 'link' is a URL somebody typed; 'microsoft' is a real file in
             -- the customer's own storage, which the list opens differently.
             d.storage_provider AS "storageProvider",
             d.external_item_id AS "externalItemId"
      FROM documents d LEFT JOIN projects p ON p.id=d.project_id
      LEFT JOIN users u ON u.id=d.owner_id
      LEFT JOIN gate_criteria c ON c.id=d.criterion_id
      ORDER BY d.updated_at DESC`)));
  }

  async updates() {
    return withTenant(this.tenant(), async (tx) => rows(await tx.execute(sql`
      SELECT up.id, up.kind, up.body, up.created_at AS "createdAt",
             p.code AS "projectCode", u.display_name AS author
      FROM updates up LEFT JOIN projects p ON p.id=up.project_id
      LEFT JOIN users u ON u.id=up.author_id
      ORDER BY up.created_at DESC`)));
  }

  async stakeholders() {
    return withTenant(this.tenant(), async (tx) => rows(await tx.execute(sql`
      SELECT sh.id, sh.name, sh.organisation, sh.role, sh.influence, sh.interest,
             sh.email, sh.phone, sh.is_external AS "isExternal", p.code AS "projectCode"
      FROM stakeholders sh LEFT JOIN projects p ON p.id=sh.project_id
      ORDER BY (coalesce(sh.influence,0)*coalesce(sh.interest,0)) DESC`)));
  }

  async integrations() {
    return withTenant(this.tenant(), async (tx) => rows(await tx.execute(sql`
      SELECT id, name, provider, direction, status, last_sync_at AS "lastSyncAt",
             CASE WHEN ${can(this.ctx().capabilities ?? [], 'pmoa_admin')}
                  THEN last_error ELSE NULL::text END AS "lastError",
             records_synced AS "recordsSynced"
      FROM integrations ORDER BY status, name`)));
  }

  /** Workspace settings — real tenant configuration, not a mock page. */
  async settings() {
    const { tenantId, role } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      const [t] = rows(await tx.execute(sql`
        SELECT t.id, COALESCE(p.display_name,t.name) AS name, t.slug, t.created_at AS "createdAt"
        FROM tenants t LEFT JOIN tenant_profiles p ON p.tenant_id=t.id WHERE t.id=${tenantId}`));
      const [counts] = rows(await tx.execute(sql`
        SELECT (SELECT count(*)::int FROM memberships WHERE is_active=true) AS members,
               (SELECT count(*)::int FROM projects)    AS projects,
               (SELECT count(*)::int FROM custom_fields WHERE is_active) AS "customFields",
               (SELECT count(*)::int FROM automations WHERE is_active)   AS automations,
               (SELECT count(*)::int FROM integrations WHERE status='connected') AS integrations`));
      const members = rows(await tx.execute(sql`
        SELECT u.display_name AS name, u.email, m.role
        FROM memberships m JOIN users u ON u.id=m.user_id AND m.is_active=true AND u.is_active=true ORDER BY m.role`));
      return { tenant: t, counts, members, yourRole: role, yourCapabilities: capabilitiesFor(role) };
    });
  }

  /** Dropdown data the create forms need: people, portfolios, programmes, projects. */
  async createOptions() {
    return withTenant(this.tenant(), async (tx) => ({
      people: rows(await tx.execute(sql`
        SELECT u.id, u.display_name AS name FROM memberships m
        JOIN users u ON u.id = m.user_id AND m.is_active=true AND u.is_active=true ORDER BY u.display_name`)),
      portfolios: rows(await tx.execute(sql`SELECT id, name FROM portfolios ORDER BY name`)),
      programs: rows(await tx.execute(sql`
        SELECT g.id, g.name, p.name AS portfolio FROM programs g
        JOIN portfolios p ON p.id = g.portfolio_id ORDER BY p.name, g.name`)),
      projects: rows(await tx.execute(sql`SELECT id, code, name FROM projects ORDER BY code`)),
    }));
  }
}
