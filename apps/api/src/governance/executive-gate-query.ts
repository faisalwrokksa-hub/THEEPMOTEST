import { sql } from 'drizzle-orm';

/** Keep the executive blocked-gate metric aligned with the gate-advance rules.
 * Each count is a scalar subquery, avoiding multiplied rows from joining
 * criteria x approvers x RAID items. All reads run inside withTenant (RLS).
 */
export const activeGateState = sql`
  WITH gate_signals AS (
    SELECT g.id, g.project_id, g.seq, g.name,
      (SELECT count(*)::int FROM gate_criteria c WHERE c.gate_id=g.id) AS criteria_total,
      (SELECT count(*)::int FROM gate_criteria c WHERE c.gate_id=g.id AND NOT c.is_met) AS criteria_unmet,
      (SELECT count(*)::int FROM approvals a WHERE a.gate_id=g.id) AS approvers_total,
      (SELECT count(*)::int FROM approvals a WHERE a.gate_id=g.id AND a.is_accountable) AS accountable_total,
      (SELECT count(*)::int FROM approvals a WHERE a.gate_id=g.id AND a.decision='pending') AS approvals_pending,
      (SELECT count(*)::int FROM approvals a WHERE a.gate_id=g.id AND a.decision='rejected') AS approvals_rejected,
      (SELECT count(*)::int FROM raid_items r WHERE r.blocks_gate_id=g.id AND r.status<>'closed') AS raid_blockers,
      (SELECT count(*)::int FROM gates previous WHERE previous.project_id=g.project_id
         AND previous.seq < g.seq AND previous.status<>'approved') AS prior_unapproved
    FROM gates g WHERE g.status='active'
  ), gate_state AS (
    SELECT *, (criteria_total=0 OR criteria_unmet>0 OR approvers_total=0 OR
      accountable_total=0 OR approvals_pending>0 OR approvals_rejected>0 OR
      raid_blockers>0 OR prior_unapproved>0) AS is_blocked
    FROM gate_signals
  )`;


/** Tenant-scoped priority rows for executive dashboards and board packs.
 * All callers MUST execute this query inside withTenant so RLS is active.
 */
export const executiveAttentionQuery = sql`
${activeGateState},
        project_raid AS (
          SELECT project_id,
            count(*) FILTER (WHERE status<>'closed' AND
              coalesce(severity,0)*coalesce(likelihood,0)>=15)::int AS critical_raid,
            count(*) FILTER (WHERE status<>'closed' AND due_date<current_date)::int AS overdue_raid
          FROM raid_items GROUP BY project_id
        ), prioritized AS (
          SELECT p.id AS "projectId", p.code, p.name, p.health,
            g.seq AS "gateSeq", g.name AS "gateName", g.is_blocked AS "gateBlocked",
            coalesce(g.criteria_total,0)::int AS "criteriaTotal",
            coalesce(g.criteria_unmet,0)::int AS "criteriaUnmet",
            coalesce(g.approvers_total,0)::int AS "approversTotal",
            coalesce(g.accountable_total,0)::int AS "accountableTotal",
            coalesce(g.approvals_pending,0)::int AS "approvalsPending",
            coalesce(g.approvals_rejected,0)::int AS "approvalsRejected",
            coalesce(g.raid_blockers,0)::int AS "raidBlockers",
            coalesce(g.prior_unapproved,0)::int AS "priorUnapproved",
            coalesce(r.critical_raid,0)::int AS "criticalRaid",
            coalesce(r.overdue_raid,0)::int AS "overdueRaid"
          FROM projects p
          LEFT JOIN LATERAL (
            SELECT gs.* FROM gate_state gs WHERE gs.project_id=p.id
            ORDER BY gs.is_blocked DESC, gs.seq ASC LIMIT 1
          ) g ON true
          LEFT JOIN project_raid r ON r.project_id=p.id
          WHERE p.health<>'on_track' OR coalesce(g.is_blocked,false)
            OR coalesce(r.critical_raid,0)>0 OR coalesce(r.overdue_raid,0)>0
        )
        SELECT *, count(*) OVER ()::int AS "totalAttention"
        FROM prioritized
        ORDER BY CASE health WHEN 'critical' THEN 0 WHEN 'at_risk' THEN 1 ELSE 2 END,
          "criticalRaid" DESC, "gateBlocked" DESC NULLS LAST,
          "overdueRaid" DESC, code
        LIMIT 50`;
