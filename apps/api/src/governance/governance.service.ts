import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { withTenant } from '@pmo/db';
import { currentContext } from '../tenancy/tenant-context';

const rows = (r: unknown) => r as unknown as any[];

@Injectable()
export class GovernanceService {
  private tenant() { return currentContext().tenantId; }

  /**
   * The "why is this project stuck?" query. Counts come from scalar subqueries
   * rather than joins — joining criteria x approvals x raid multiplies rows and
   * silently inflates every count.
   */
  async gateBoard() {
    return withTenant(this.tenant(), async (tx) => {
      const r = await tx.execute(sql`
        SELECT p.id AS "projectId", p.code AS "projectCode", p.name AS "projectName",
               g.id AS "gateId", g.seq, g.name, g.status,
               (SELECT count(*)::int FROM gate_criteria c WHERE c.gate_id=g.id AND c.is_met) AS "criteriaMet",
               (SELECT count(*)::int FROM gate_criteria c WHERE c.gate_id=g.id)               AS "criteriaTotal",
               (SELECT count(*)::int FROM approvals a WHERE a.gate_id=g.id AND a.decision='pending') AS "unsigned",
               (SELECT count(*)::int FROM approvals a WHERE a.gate_id=g.id) AS "approversTotal",
               (SELECT count(*)::int FROM approvals a WHERE a.gate_id=g.id AND a.is_accountable) AS "accountableTotal",
               (SELECT count(*)::int FROM approvals a WHERE a.gate_id=g.id AND a.decision='rejected') AS "rejectedApprovals",
               (SELECT count(*)::int FROM gates previous WHERE previous.project_id=g.project_id
                  AND previous.seq<g.seq AND previous.status<>'approved') AS "priorUnapproved",
               (SELECT u.display_name FROM approvals a JOIN users u ON u.id=a.approver_id
                  WHERE a.gate_id=g.id AND a.is_accountable)                                  AS "accountable",
               COALESCE((SELECT array_agg(r2.title) FROM raid_items r2
                  WHERE r2.blocks_gate_id=g.id AND r2.status<>'closed'), '{}')                AS "blockedBy"
        FROM projects p
        JOIN gates g ON g.project_id = p.id AND g.status = 'active'
        ORDER BY p.code
      `);
      return (r as unknown as any[]).map((row) => ({
        ...row,
        blockedBy: row.blockedBy ?? [],
        mayPass: row.criteriaTotal > 0
          && row.criteriaMet === row.criteriaTotal
          && row.unsigned === 0
          && row.approversTotal > 0
          && row.accountableTotal > 0
          && row.rejectedApprovals === 0
          && row.priorUnapproved === 0
          && (row.blockedBy ?? []).length === 0,
      }));
    });
  }

  /** All seven gates for one project, in order. */
  async gatesForProject(projectId: string) {
    return withTenant(this.tenant(), async (tx) => {
      const r = await tx.execute(sql`
        SELECT g.id, g.seq, g.name, g.status, g.decided_at AS "decidedAt",
               (SELECT count(*)::int FROM gate_criteria c WHERE c.gate_id=g.id AND c.is_met) AS "criteriaMet",
               (SELECT count(*)::int FROM gate_criteria c WHERE c.gate_id=g.id)               AS "criteriaTotal"
        FROM gates g WHERE g.project_id = ${projectId} ORDER BY g.seq
      `);
      return r as unknown as any[];
    });
  }

  async raid() {
    return withTenant(this.tenant(), async (tx) => {
      const r = await tx.execute(sql`
        SELECT r.id, r.project_id AS "projectId", p.code AS "projectCode",
               r.kind, r.title, r.detail, r.severity, r.likelihood, r.status,
               u.display_name AS "owner", r.due_date AS "dueDate",
               CASE WHEN r.blocks_gate_id IS NULL THEN NULL
                    ELSE (SELECT 'SG'||g.seq||' '||g.name FROM gates g WHERE g.id=r.blocks_gate_id)
               END AS "blocksGate"
        FROM raid_items r
        JOIN projects p ON p.id = r.project_id
        LEFT JOIN users u ON u.id = r.owner_id
        ORDER BY (r.status <> 'closed') DESC, coalesce(r.severity,0) DESC, r.created_at DESC
      `);
      return r as unknown as any[];
    });
  }

  async tasks() {
    return withTenant(this.tenant(), async (tx) => {
      const r = await tx.execute(sql`
        SELECT t.id, t.project_id AS "projectId", p.code AS "projectCode",
               t.title, t.state, u.display_name AS "assignee",
               t.due_date AS "dueDate", t.estimate_hours AS "estimateHours"
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
        LEFT JOIN users u ON u.id = t.assignee_id
        ORDER BY t.due_date NULLS LAST
      `);
      return r as unknown as any[];
    });
  }

  /** Everything needed to run one project's gates on screen. */
  async projectGovernance(projectId: string) {
    return withTenant(this.tenant(), async (tx) => {
      const [project] = rows(await tx.execute(sql`
        SELECT id, code, name, status, health, progress_pct AS "progressPct"
        FROM projects WHERE id = ${projectId}`));
      const gates = rows(await tx.execute(sql`
        SELECT g.id, g.seq, g.name, g.status, g.opened_at AS "openedAt", g.decided_at AS "decidedAt"
        FROM gates g WHERE g.project_id = ${projectId} ORDER BY g.seq`));
      const criteria = rows(await tx.execute(sql`
        SELECT c.id, c.gate_id AS "gateId", c.label, c.is_met AS "isMet",
               c.evidence_url AS "evidenceUrl", c.met_at AS "metAt", u.display_name AS "metBy"
        FROM gate_criteria c LEFT JOIN users u ON u.id = c.met_by
        JOIN gates g ON g.id = c.gate_id WHERE g.project_id = ${projectId}
        ORDER BY g.seq, c.created_at`));
      const approvals = rows(await tx.execute(sql`
        SELECT a.id, a.gate_id AS "gateId", a.approver_id AS "approverId", a.decision,
               a.is_accountable AS "isAccountable", a.comment, a.decided_at AS "decidedAt",
               u.display_name AS approver
        FROM approvals a LEFT JOIN users u ON u.id = a.approver_id
        JOIN gates g ON g.id = a.gate_id WHERE g.project_id = ${projectId}
        ORDER BY g.seq, a.is_accountable DESC`));
      const blockers = rows(await tx.execute(sql`
        SELECT r.id, r.title, r.status, r.kind, r.blocks_gate_id AS "gateId"
        FROM raid_items r WHERE r.project_id = ${projectId} AND r.blocks_gate_id IS NOT NULL
        ORDER BY (r.status <> 'closed') DESC`));
      const history = rows(await tx.execute(sql`
        SELECT e.id, e.entity, e.action, e.diff, e.at, coalesce(u.display_name,'system') AS actor
        FROM audit_events e LEFT JOIN users u ON u.id = e.actor_id
        WHERE e.entity IN ('gate','gate_criterion','approval','raid_item')
        ORDER BY e.at DESC LIMIT 25`));
      const members = rows(await tx.execute(sql`
        SELECT u.id, u.display_name AS name, m.role
        FROM memberships m JOIN users u ON u.id = m.user_id ORDER BY u.display_name`));
      return { project, gates, criteria, approvals, blockers, history, members };
    });
  }
}
