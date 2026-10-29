import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { sql } from 'drizzle-orm';
import { db, withTenant } from '@pmo/db';
import { currentContext } from '../tenancy/tenant-context';
import { can } from '@pmo/contracts';

const rows = (r: unknown) => r as unknown as any[];
const n = (v: unknown) => Number(v ?? 0);

export type SCurvePoint = {
  period: string;
  budget: number; actual: number; forecast: number; committed: number;
  cumBudget: number; cumActual: number; cumForecast: number;
};

export type Trends = {
  /** Cumulative planned against cumulative spent, by month. */
  sCurve: SCurvePoint[];
  /** Gates passed per month — delivery velocity, not activity. */
  throughput: { period: string; passed: number }[];
  /** Portfolio health over time. Empty until snapshots accumulate. */
  history: {
    onDate: string; projects: number; onTrack: number; atRisk: number; critical: number;
    avgProgress: number; gatesActive: number; gatesBlocked: number; openRegister: number;
  }[];
  /** What the history can honestly support. */
  historyNote: { days: number; since: string | null; enough: boolean };
};

@Injectable()
export class TrendsService implements OnModuleInit {
  private readonly log = new Logger('Trends');

  /**
   * Take one on startup as well as nightly.
   *
   * The upsert is per day, so a restart cannot double-count — and without
   * this the chart would be empty on the first day of every deployment,
   * which reads as "broken" rather than "collecting".
   */
  async onModuleInit() {
    try { await this.capture(); }
    catch (e) { this.log.warn('First snapshot skipped; inspect restricted database telemetry.'); }
  }

  async trends(): Promise<Trends> {
    const { tenantId } = currentContext();
    return withTenant(tenantId, async (tx) => {
      /*
       * Months come from a generated series rather than from the rows, so a
       * month with no spending is a flat step on the curve instead of a gap
       * the eye reads as a straight line to the next point.
       */
      const curve = can(currentContext().capabilities ?? [], 'pmoa_view_financials')
        ? rows(await tx.execute(sql`
        WITH bounds AS (
          SELECT date_trunc('month', min(period))::date AS lo,
                 date_trunc('month', max(period))::date AS hi
          FROM cost_entries WHERE period IS NOT NULL
        ), months AS (
          SELECT generate_series(lo, hi, interval '1 month')::date AS period FROM bounds
        ), per AS (
          SELECT date_trunc('month', period)::date AS period,
                 coalesce(sum(amount) FILTER (WHERE kind='budget'), 0)     AS budget,
                 coalesce(sum(amount) FILTER (WHERE kind='actual'), 0)     AS actual,
                 coalesce(sum(amount) FILTER (WHERE kind='forecast'), 0)   AS forecast,
                 coalesce(sum(amount) FILTER (WHERE kind='commitment'), 0) AS committed
          FROM cost_entries WHERE period IS NOT NULL GROUP BY 1
        )
        SELECT m.period::text,
               coalesce(p.budget, 0)    AS budget,
               coalesce(p.actual, 0)    AS actual,
               coalesce(p.forecast, 0)  AS forecast,
               coalesce(p.committed, 0) AS committed,
               sum(coalesce(p.budget, 0))   OVER (ORDER BY m.period) AS cum_budget,
               sum(coalesce(p.actual, 0))   OVER (ORDER BY m.period) AS cum_actual,
               sum(coalesce(p.forecast, 0)) OVER (ORDER BY m.period) AS cum_forecast
        FROM months m LEFT JOIN per p ON p.period = m.period
        ORDER BY m.period`)) : [];

      const throughput = rows(await tx.execute(sql`
        SELECT to_char(date_trunc('month', decided_at), 'YYYY-MM') AS period,
               count(*)::int AS passed
        FROM gates WHERE status = 'approved' AND decided_at IS NOT NULL
        GROUP BY 1 ORDER BY 1`));

      const history = rows(await tx.execute(sql`
        SELECT on_date::text AS "onDate", projects, on_track AS "onTrack", at_risk AS "atRisk",
               critical, avg_progress AS "avgProgress", gates_active AS "gatesActive",
               gates_blocked AS "gatesBlocked", open_register AS "openRegister"
        FROM portfolio_snapshots ORDER BY on_date`));

      return {
        sCurve: curve.map((r) => ({
          period: r.period,
          budget: n(r.budget), actual: n(r.actual), forecast: n(r.forecast), committed: n(r.committed),
          cumBudget: n(r.cum_budget), cumActual: n(r.cum_actual), cumForecast: n(r.cum_forecast),
        })),
        throughput: throughput.map((r) => ({ period: r.period, passed: n(r.passed) })),
        history: history.map((h) => ({
          onDate: h.onDate, projects: n(h.projects), onTrack: n(h.onTrack), atRisk: n(h.atRisk),
          critical: n(h.critical), avgProgress: n(h.avgProgress), gatesActive: n(h.gatesActive),
          gatesBlocked: n(h.gatesBlocked), openRegister: n(h.openRegister),
        })),
        historyNote: {
          days: history.length,
          since: history[0]?.onDate ?? null,
          // Two points make a line but not a trend; below a week it is noise.
          enough: history.length >= 7,
        },
      };
    });
  }

  /** Capture only the caller's authenticated workspace. The HTTP controller
   * must NEVER initiate snapshots for other tenants. */
  async captureTenant(tenantId: string): Promise<void> {
    await withTenant(tenantId, async (tx) => {
      await tx.execute(sql`
        INSERT INTO portfolio_snapshots (
          tenant_id, on_date, projects, on_track, at_risk, critical, avg_progress,
          gates_active, gates_blocked, open_register, budget, actual, forecast)
        SELECT ${tenantId}, current_date,
          (SELECT count(*)::int FROM projects),
          (SELECT count(*)::int FROM projects WHERE health='on_track'),
          (SELECT count(*)::int FROM projects WHERE health='at_risk'),
          (SELECT count(*)::int FROM projects WHERE health='critical'),
          (SELECT coalesce(round(avg(progress_pct)), 0)::int FROM projects),
          (SELECT count(*)::int FROM gates WHERE status='active'),
          (SELECT count(*)::int FROM gates g WHERE g.status='active' AND (
              NOT EXISTS (SELECT 1 FROM gate_criteria c WHERE c.gate_id=g.id)
           OR EXISTS (SELECT 1 FROM gate_criteria c WHERE c.gate_id=g.id AND NOT c.is_met)
           OR NOT EXISTS (SELECT 1 FROM approvals a WHERE a.gate_id=g.id)
           OR NOT EXISTS (SELECT 1 FROM approvals a WHERE a.gate_id=g.id AND a.is_accountable)
           OR EXISTS (SELECT 1 FROM approvals a WHERE a.gate_id=g.id AND a.decision<>'approved')
           OR EXISTS (SELECT 1 FROM gates previous WHERE previous.project_id=g.project_id
                AND previous.seq<g.seq AND previous.status<>'approved')
           OR EXISTS (SELECT 1 FROM raid_items r WHERE r.blocks_gate_id=g.id AND r.status<>'closed'))),
          (SELECT count(*)::int FROM raid_items WHERE status <> 'closed'),
          (SELECT coalesce(sum(amount),0) FROM cost_entries WHERE kind='budget'),
          (SELECT coalesce(sum(amount),0) FROM cost_entries WHERE kind='actual'),
          (SELECT coalesce(sum(amount),0) FROM cost_entries WHERE kind='forecast')
        ON CONFLICT (tenant_id, on_date) DO UPDATE SET
          projects=excluded.projects, on_track=excluded.on_track, at_risk=excluded.at_risk,
          critical=excluded.critical, avg_progress=excluded.avg_progress,
          gates_active=excluded.gates_active, gates_blocked=excluded.gates_blocked,
          open_register=excluded.open_register, budget=excluded.budget,
          actual=excluded.actual, forecast=excluded.forecast`);
    });
  }

  /** System-only maintenance (startup/cron), never invoked by tenant API. */
  async capture(): Promise<number> {
    const tenants = rows(await db.execute(sql`SELECT id FROM tenants`));
    for (const t of tenants) {
      await this.captureTenant(t.id);
    }
    return tenants.length;
  }

  /** Just after midnight, so a day's row describes that day as it ended. */
  @Cron('7 0 * * *', { name: 'snapshot' })
  async nightly() {
    try {
      const n2 = await this.capture();
      this.log.log(`Snapshot taken for ${n2} workspace(s).`);
    } catch (e) {
      this.log.error('Snapshot failed; inspect restricted database telemetry.');
    }
  }
}
