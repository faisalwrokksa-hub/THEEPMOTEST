import { sql } from 'drizzle-orm';
import { withTenant } from '@pmo/db';
import { activeGateState, executiveAttentionQuery } from '../governance/executive-gate-query';

const rows = (r: unknown) => r as unknown as any[];

export type PackData = {
  tenantName: string;
  generatedAt: string;
  health: { total: number; on_track: number; at_risk: number; critical: number; avg_progress: number };
  gatesSummary: { active: number; blocked: number };
  money: { budget: number; committed: number; actual: number; forecast: number };
  gates: {
    projectCode: string; projectName: string; seq: number; name: string;
    criteriaMet: number; criteriaTotal: number; unsigned: number;
    accountable: string | null; blockedBy: string[]; mayPass: boolean;
  }[];
  attention: { code: string; name: string; health: string; gate: string;
    reason: string | null; reasonParts: { key: string; count?: number }[] }[];
  decisions: { title: string; project: string; gate: string | null; owner: string | null; date: string | null }[];
  benefits: { name: string; measure: string; baseline: number | null; target: number | null;
              actual: number | null; status: string }[];
};

const n = (v: unknown) => Number(v ?? 0);

/** Exported reports carry translated reason codes, not pre-rendered English. */
export function exportAttentionReasonParts(a: Record<string, any>): { key: string; count?: number }[] {
  const reasons: { key: string; count?: number }[] = [];
  if (a.gateSeq !== null) {
    if (a.criteriaTotal === 0) reasons.push({ key: 'Missing gate checklist' });
    if (a.criteriaUnmet > 0) reasons.push({ key: 'Unmet criteria', count: a.criteriaUnmet });
    if (a.approversTotal === 0) reasons.push({ key: 'No approvers assigned' });
    if (a.approversTotal > 0 && a.accountableTotal === 0) reasons.push({ key: 'No accountable approver' });
    if (a.approvalsPending > 0) reasons.push({ key: 'Pending signatures', count: a.approvalsPending });
    if (a.approvalsRejected > 0) reasons.push({ key: 'Rejected approvals', count: a.approvalsRejected });
    if (a.priorUnapproved > 0) reasons.push({ key: 'Unapproved prior gates', count: a.priorUnapproved });
    if (a.raidBlockers > 0) reasons.push({ key: 'Open gate blockers', count: a.raidBlockers });
  }
  if (a.criticalRaid > 0) reasons.push({ key: 'Critical RAID items', count: a.criticalRaid });
  if (a.overdueRaid > 0) reasons.push({ key: 'Overdue RAID items', count: a.overdueRaid });
  return reasons;
}

export function localizedExportReasons(
  a: { reasonParts: { key: string; count?: number }[] },
  t: (key: string) => string,
): string {
  return a.reasonParts.map(({ key, count }) =>
    count === undefined ? t(key) : `${count} ${t(key)}`,
  ).join('; ');
}

/**
 * Everything a board pack needs, in one pass.
 *
 * The Word, PowerPoint and on-screen packs all read this, so the three cannot
 * disagree about what the portfolio looked like at the moment they were made —
 * which is the whole point of generating a pack rather than assembling one.
 */
export async function packData(tenantId: string): Promise<PackData> {
  return withTenant(tenantId, async (tx) => {
    const [t] = rows(await tx.execute(sql`SELECT name FROM tenants WHERE id = ${tenantId}`));

    const [h] = rows(await tx.execute(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE health='on_track')::int AS on_track,
             count(*) FILTER (WHERE health='at_risk')::int  AS at_risk,
             count(*) FILTER (WHERE health='critical')::int AS critical,
             coalesce(round(avg(progress_pct)), 0)::int      AS avg_progress
      FROM projects`));

    const [m] = rows(await tx.execute(sql`
      SELECT coalesce(sum(amount) FILTER (WHERE kind='budget'), 0)     AS budget,
             coalesce(sum(amount) FILTER (WHERE kind='commitment'), 0) AS committed,
             coalesce(sum(amount) FILTER (WHERE kind='actual'), 0)     AS actual,
             coalesce(sum(amount) FILTER (WHERE kind='forecast'), 0)   AS forecast
      FROM cost_entries`));

    const gates = rows(await tx.execute(sql`
      SELECT p.code AS "projectCode", p.name AS "projectName", g.id, g.seq, g.name,
             (SELECT count(*)::int FROM gate_criteria c WHERE c.gate_id=g.id AND c.is_met) AS "criteriaMet",
             (SELECT count(*)::int FROM gate_criteria c WHERE c.gate_id=g.id)               AS "criteriaTotal",
             (SELECT count(*)::int FROM approvals a WHERE a.gate_id=g.id AND a.decision='pending') AS unsigned,
             (SELECT u.display_name FROM approvals a JOIN users u ON u.id=a.approver_id
               WHERE a.gate_id=g.id AND a.is_accountable LIMIT 1) AS accountable,
             coalesce((SELECT array_agg(r.title) FROM raid_items r
               WHERE r.blocks_gate_id=g.id AND r.status <> 'closed'), '{}') AS "blockedBy"
      FROM gates g JOIN projects p ON p.id = g.project_id
      WHERE g.status = 'active' ORDER BY p.code`));

    // The exported pack shares exactly the same attention queue as the dashboard.
    const attention = rows(await tx.execute(executiveAttentionQuery));
    const gateState = rows(await tx.execute(sql`
      ${activeGateState}
      SELECT id, is_blocked AS "isBlocked" FROM gate_state`));
    const blockedGateIds = new Set(gateState.filter((g) => g.isBlocked).map((g) => g.id));

    const decisions = rows(await tx.execute(sql`
      SELECT r.title, p.code AS project, 'SG' || g.seq AS gate,
             u.display_name AS owner, r.created_at::date::text AS date
      FROM raid_items r
      JOIN projects p ON p.id = r.project_id
      LEFT JOIN gates g ON g.id = r.blocks_gate_id
      LEFT JOIN users u ON u.id = r.owner_id
      WHERE r.kind = 'decision' ORDER BY r.created_at DESC LIMIT 12`));

    const benefits = rows(await tx.execute(sql`
      SELECT name, measure, baseline, target, actual, status FROM benefits ORDER BY name`));

    return {
      tenantName: t?.name ?? 'Workspace',
      generatedAt: new Date().toISOString(),
      health: {
        total: n(h?.total), on_track: n(h?.on_track), at_risk: n(h?.at_risk),
        critical: n(h?.critical), avg_progress: n(h?.avg_progress),
      },
      gatesSummary: {
        active: gateState.length,
        blocked: blockedGateIds.size,
      },
      money: { budget: n(m?.budget), committed: n(m?.committed), actual: n(m?.actual), forecast: n(m?.forecast) },
      gates: gates.map((g) => ({
        projectCode: g.projectCode, projectName: g.projectName, seq: g.seq, name: g.name,
        criteriaMet: n(g.criteriaMet), criteriaTotal: n(g.criteriaTotal), unsigned: n(g.unsigned),
        accountable: g.accountable, blockedBy: g.blockedBy ?? [],
        mayPass: !blockedGateIds.has(g.id),
      })),
      attention: attention.map((a) => ({
        code: a.code, name: a.name, health: a.health,
        gate: a.gateSeq === null ? '—' : `SG${a.gateSeq} ${a.gateName}`,
        reasonParts: exportAttentionReasonParts(a),
        reason: exportAttentionReasonParts(a).map(({ key, count }) =>
          count === undefined ? key : `${count} ${key}`).join('; ') || null,
      })),
      decisions: decisions.map((d) => ({
        title: d.title, project: d.project, gate: d.gate, owner: d.owner, date: d.date,
      })),
      benefits: benefits.map((b) => ({
        name: b.name, measure: b.measure,
        baseline: b.baseline == null ? null : Number(b.baseline),
        target: b.target == null ? null : Number(b.target),
        actual: b.actual == null ? null : Number(b.actual),
        status: b.status,
      })),
    };
  });
}

/** Compact money, the way the interface shows it. */
export const money = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(1)}B`
  : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M`
  : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K`
  : String(Math.round(v));
