import { sql } from 'drizzle-orm';
import { withTenant } from '@pmo/db';

const rows = (r: unknown) => r as unknown as any[];
const n = (v: unknown) => Number(v ?? 0);

/**
 * The facts Ask X is allowed to reason from.
 *
 * Everything the assistant says has to come from here. That is the whole
 * design: a governance tool that invents a number is worse than one that
 * cannot answer, because the invented number will be repeated in a board
 * meeting by someone who trusted it.
 *
 * So this is assembled per request, inside the tenant's own row-level
 * policies, and handed over whole. No retrieval step, no embeddings, no
 * vector store — a portfolio is a few hundred rows, which fits in a prompt
 * with room to spare, and fetching all of it removes an entire category of
 * "the assistant missed the one relevant record" failure.
 */
export type Grounding = {
  workspace: string;
  asOf: string;
  projects: {
    code: string; name: string; status: string; health: string; progressPct: number;
    budget: number; actual: number; forecast: number; startDate: string | null; endDate: string | null;
    owner: string | null; programme: string | null; portfolio: string | null;
    gate: string | null; gateCriteria: string; gateUnsigned: number;
    gateAccountable: string | null; blockers: string[]; mayPass: boolean;
    /* Derived here, never left to the reader. See the note below. */
    drawnPct: number; overBudget: boolean; forecastOverBudget: boolean;
    varianceToBudget: number;
  }[];
  register: {
    project: string; kind: string; title: string; detail: string | null;
    severity: number | null; likelihood: number | null; score: number | null;
    status: string; owner: string | null; dueDate: string | null; blocksGate: string | null;
  }[];
  benefits: { project: string | null; name: string; measure: string;
              baseline: number | null; target: number | null; actual: number | null; status: string }[];
  schedule: { project: string; item: string; baselineEnd: string | null;
              endDate: string | null; slipDays: number | null; critical: boolean }[];
  approvals: { project: string; gate: string; approver: string | null;
               role: string; decision: string; signable: boolean }[];
  people: { name: string; email: string; role: string }[];
  totals: { projects: number; budget: number; actual: number; forecast: number;
            gatesActive: number; gatesBlocked: number; openRegister: number };
};

export async function gather(tenantId: string): Promise<Grounding> {
  return withTenant(tenantId, async (tx) => {
    const [t] = rows(await tx.execute(sql`SELECT name FROM tenants WHERE id = ${tenantId}`));

    const projects = rows(await tx.execute(sql`
      SELECT p.id, p.code, p.name, p.status, p.health, p.progress_pct, p.start_date, p.end_date,
             u.display_name AS owner, pr.name AS programme, pf.name AS portfolio,
             g.id AS gate_id, g.seq, g.name AS gate_name,
             (SELECT count(*)::int FROM gate_criteria c WHERE c.gate_id=g.id)              AS crit_total,
             (SELECT count(*)::int FROM gate_criteria c WHERE c.gate_id=g.id AND c.is_met) AS crit_met,
             (SELECT count(*)::int FROM approvals a WHERE a.gate_id=g.id AND a.decision='pending') AS unsigned,
             (SELECT u2.display_name FROM approvals a JOIN users u2 ON u2.id=a.approver_id
               WHERE a.gate_id=g.id AND a.is_accountable LIMIT 1) AS accountable,
             coalesce((SELECT array_agg(r.title) FROM raid_items r
               WHERE r.blocks_gate_id=g.id AND r.status<>'closed'), '{}') AS blockers,
             (SELECT coalesce(sum(amount),0) FROM cost_entries c WHERE c.project_id=p.id AND c.kind='budget')   AS budget,
             (SELECT coalesce(sum(amount),0) FROM cost_entries c WHERE c.project_id=p.id AND c.kind='actual')   AS actual,
             (SELECT coalesce(sum(amount),0) FROM cost_entries c WHERE c.project_id=p.id AND c.kind='forecast') AS forecast
      FROM projects p
      LEFT JOIN users u ON u.id = p.owner_id
      LEFT JOIN programs pr ON pr.id = p.program_id
      LEFT JOIN portfolios pf ON pf.id = pr.portfolio_id
      LEFT JOIN gates g ON g.project_id = p.id AND g.status = 'active'
      ORDER BY p.code`));

    const register = rows(await tx.execute(sql`
      SELECT p.code AS project, r.kind, r.title, r.detail, r.severity, r.likelihood,
             r.status, u.display_name AS owner, r.due_date,
             CASE WHEN g.id IS NULL THEN NULL ELSE 'SG' || g.seq || ' ' || g.name END AS blocks_gate
      FROM raid_items r
      JOIN projects p ON p.id = r.project_id
      LEFT JOIN users u ON u.id = r.owner_id
      LEFT JOIN gates g ON g.id = r.blocks_gate_id
      ORDER BY (coalesce(r.severity,0) * coalesce(r.likelihood,0)) DESC, r.title`));

    const benefits = rows(await tx.execute(sql`
      SELECT p.code AS project, b.name, b.measure, b.baseline, b.target, b.actual, b.status
      FROM benefits b LEFT JOIN projects p ON p.id = b.project_id ORDER BY b.name`));

    const schedule = rows(await tx.execute(sql`
      SELECT p.code AS project, s.name AS item, s.baseline_end, s.end_date, s.is_critical,
             CASE WHEN s.baseline_end IS NOT NULL AND s.end_date IS NOT NULL
                  THEN (s.end_date - s.baseline_end) END AS slip_days
      FROM schedule_items s JOIN projects p ON p.id = s.project_id
      WHERE s.baseline_end IS NOT NULL AND s.end_date > s.baseline_end
      ORDER BY (s.end_date - s.baseline_end) DESC`));

    const approvals = rows(await tx.execute(sql`
      SELECT p.code AS project, 'SG' || g.seq || ' ' || g.name AS gate,
             u.display_name AS approver, a.is_accountable, a.decision,
             (SELECT count(*)::int FROM gate_criteria c WHERE c.gate_id=g.id AND NOT c.is_met) AS unmet,
             (SELECT count(*)::int FROM raid_items r WHERE r.blocks_gate_id=g.id AND r.status<>'closed') AS blk
      FROM approvals a
      JOIN gates g ON g.id = a.gate_id
      JOIN projects p ON p.id = g.project_id
      LEFT JOIN users u ON u.id = a.approver_id
      WHERE a.decision = 'pending' ORDER BY p.code`));

    const people = rows(await tx.execute(sql`
      SELECT u.display_name, u.email, m.role FROM users u
      JOIN memberships m ON m.user_id = u.id AND m.tenant_id = ${tenantId} AND m.is_active=true AND u.is_active=true
      ORDER BY u.display_name`));

    const proj = projects.map((p) => ({
      code: p.code, name: p.name, status: p.status, health: p.health,
      progressPct: n(p.progress_pct), budget: n(p.budget), actual: n(p.actual), forecast: n(p.forecast),
      startDate: p.start_date, endDate: p.end_date, owner: p.owner,
      programme: p.programme, portfolio: p.portfolio,
      gate: p.gate_id ? `SG${p.seq} ${p.gate_name}` : null,
      gateCriteria: p.gate_id ? `${n(p.crit_met)}/${n(p.crit_total)}` : '—',
      gateUnsigned: n(p.unsigned),
      gateAccountable: p.accountable,
      blockers: p.blockers ?? [],
      mayPass: Boolean(p.gate_id) && n(p.crit_total) > 0 && n(p.crit_met) === n(p.crit_total)
               && n(p.unsigned) === 0 && (p.blockers ?? []).length === 0,
      /*
       * Every comparison the assistant might otherwise have to work out.
       *
       * A language model asked "are we over budget anywhere?" will compare
       * numbers across rows, and that is precisely where it slips — it once
       * attributed one project's budget to another and called it an overrun.
       * The database can answer it exactly, so it does, and the model is left
       * with a lookup rather than a calculation. Same reasoning as mayPass.
       */
      drawnPct: n(p.budget) > 0 ? Math.round((n(p.actual) / n(p.budget)) * 100) : 0,
      overBudget: n(p.actual) > n(p.budget) && n(p.budget) > 0,
      forecastOverBudget: n(p.forecast) > n(p.budget) && n(p.budget) > 0 && n(p.forecast) > 0,
      varianceToBudget: (n(p.forecast) > 0 ? n(p.forecast) : n(p.actual)) - n(p.budget),
    }));

    return {
      workspace: t?.name ?? 'Workspace',
      asOf: new Date().toISOString().slice(0, 16).replace('T', ' '),
      projects: proj,
      register: register.map((r) => ({
        project: r.project, kind: r.kind, title: r.title, detail: r.detail,
        severity: r.severity, likelihood: r.likelihood,
        score: r.severity && r.likelihood ? r.severity * r.likelihood : null,
        status: r.status, owner: r.owner, dueDate: r.due_date, blocksGate: r.blocks_gate,
      })),
      benefits: benefits.map((b) => ({
        project: b.project, name: b.name, measure: b.measure,
        baseline: b.baseline == null ? null : n(b.baseline),
        target: b.target == null ? null : n(b.target),
        actual: b.actual == null ? null : n(b.actual),
        status: b.status,
      })),
      schedule: schedule.map((s) => ({
        project: s.project, item: s.item, baselineEnd: s.baseline_end, endDate: s.end_date,
        slipDays: s.slip_days == null ? null : n(s.slip_days), critical: Boolean(s.is_critical),
      })),
      approvals: approvals.map((a) => ({
        project: a.project, gate: a.gate, approver: a.approver,
        role: a.is_accountable ? 'accountable' : 'consulted',
        decision: a.decision, signable: n(a.unmet) === 0 && n(a.blk) === 0,
      })),
      people: people.map((p) => ({ name: p.display_name, email: p.email, role: p.role })),
      totals: {
        projects: proj.length,
        budget: proj.reduce((a, p) => a + p.budget, 0),
        actual: proj.reduce((a, p) => a + p.actual, 0),
        forecast: proj.reduce((a, p) => a + p.forecast, 0),
        gatesActive: proj.filter((p) => p.gate).length,
        gatesBlocked: proj.filter((p) => p.gate && !p.mayPass).length,
        openRegister: register.filter((r) => r.status !== 'closed').length,
      },
    };
  });
}

/** A compact digest for the audit record — not the whole payload. */
export const digest = (g: Grounding) => ({
  asOf: g.asOf,
  counts: {
    projects: g.projects.length, register: g.register.length, benefits: g.benefits.length,
    slippedItems: g.schedule.length, pendingApprovals: g.approvals.length, people: g.people.length,
  },
  totals: g.totals,
});
