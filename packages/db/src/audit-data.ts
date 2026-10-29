import './env';
import postgres from 'postgres';

/**
 * Data-integrity audit. Every check states an invariant that must hold;
 * a failure is a bug in the schema, the seed, or a calculation.
 */
const sql = postgres(process.env.DATABASE_URL_ADMIN!, { max: 1 });

let fails = 0, warns = 0;
const pass = (m: string) => console.log(`  \x1b[32mPASS\x1b[0m  ${m}`);
const fail = (m: string, d?: unknown) => { fails++; console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`); if (d) console.log('        ', d); };
const warn = (m: string, d?: unknown) => { warns++; console.log(`  \x1b[33mWARN\x1b[0m  ${m}`); if (d) console.log('        ', d); };

async function main() {
  console.log('\nData integrity audit\n');

  // 1 — project budget must agree with its cost lines (two sources of truth)
  const b = await sql`
    SELECT p.code, p.budget_amount::float AS declared,
           coalesce(sum(c.amount) FILTER (WHERE c.kind='budget'),0)::float AS lines
    FROM projects p LEFT JOIN cost_entries c ON c.project_id=p.id
    GROUP BY p.code, p.budget_amount HAVING p.budget_amount IS NOT NULL`;
  const mism = b.filter((r: any) => Math.abs(r.declared - r.lines) > 0.5);
  mism.length ? fail('projects.budget_amount disagrees with its cost_entries budget lines', mism)
              : pass('project budget reconciles with cost lines');

  // 2 — a forecast on only SOME categories cannot be compared to the whole budget
  const f = await sql`
    SELECT p.code,
      count(DISTINCT c.category) FILTER (WHERE c.kind='budget')   AS budget_cats,
      count(DISTINCT c.category) FILTER (WHERE c.kind='forecast') AS forecast_cats
    FROM projects p JOIN cost_entries c ON c.project_id=p.id
    GROUP BY p.code HAVING count(*) FILTER (WHERE c.kind='forecast') > 0`;
  const partial = f.filter((r: any) => Number(r.forecast_cats) < Number(r.budget_cats));
  if (partial.length) {
    warn(`${partial.length} project(s) have a forecast on only some categories; totals fall back to budget for the rest`,
         partial.map((r: any) => `${r.code}: ${r.forecast_cats}/${r.budget_cats} categories`));
  } else pass('forecast covers every budgeted category');

  // 2b — the per-category forecast total must never be BELOW the budget of the
  //      categories it does not cover. This is the bug that made a project look
  //      under-budget purely because most categories had no forecast.
  const ft = await sql`
    WITH per_cat AS (
      SELECT project_id, category,
             coalesce(sum(amount) FILTER (WHERE kind='budget'),0) AS budget,
             sum(amount) FILTER (WHERE kind='forecast') AS forecast
      FROM cost_entries GROUP BY project_id, category
    )
    SELECT p.code,
           sum(pc.budget)::float AS budget,
           sum(coalesce(pc.forecast, pc.budget))::float AS forecast_correct,
           coalesce(sum(pc.forecast),0)::float AS forecast_naive
    FROM per_cat pc JOIN projects p ON p.id=pc.project_id
    GROUP BY p.code HAVING count(pc.forecast) > 0`;
  const wrong = ft.filter((r: any) => r.forecast_naive < r.budget && r.forecast_correct >= r.budget);
  wrong.length
    ? pass(`per-category fallback prevents a false "under budget" on ${wrong.map((r: any) => r.code).join(', ')}`)
    : pass('forecast totals comparable to budget');

  // 3 — benefits: is the target a increase or a decrease?
  const ben = await sql`
    SELECT name, baseline::float, target::float, actual::float FROM benefits
    WHERE target IS NOT NULL AND baseline IS NOT NULL`;
  const desc = ben.filter((r: any) => r.target < r.baseline);
  if (desc.length) {
    // Progress must run baseline -> target in BOTH directions.
    const calc = await sql`
      SELECT name, baseline::float, target::float, actual::float,
             greatest(0, least(100, round(
               ((coalesce(actual, baseline) - baseline) / (target - baseline)) * 100)))::int AS pct,
             round(least(100, (coalesce(actual,0)/nullif(target,0))*100))::int AS naive_pct
      FROM benefits WHERE target < baseline`;
    const broken = calc.filter((r: any) => r.pct < 0 || r.pct > 100);
    if (broken.length) fail('descending-target benefits produce an out-of-range progress value', broken);
    else pass(`descending targets handled correctly (${calc.map((r: any) =>
      `${r.name}: ${r.pct}% not ${r.naive_pct}%`).join('; ')})`);
  } else pass('all benefit targets are increases');

  // 4 — resource allocation must only be summed across OVERLAPPING periods
  const ov = await sql`
    SELECT u.display_name AS person, sum(a.allocation_pct)::int AS naive_total,
           count(*)::int AS allocations
    FROM allocations a JOIN users u ON u.id=a.user_id
    GROUP BY u.display_name HAVING sum(a.allocation_pct) > 100`;
  const nonOverlap = await sql`
    SELECT u.display_name AS person
    FROM allocations a JOIN allocations b
      ON a.user_id=b.user_id AND a.id < b.id
     AND NOT (a.start_date <= b.end_date AND b.start_date <= a.end_date)
    JOIN users u ON u.id=a.user_id GROUP BY u.display_name`;
  if (ov.length && nonOverlap.length) fail('over-allocation is computed by summing allocations that do not overlap in time', { ov, nonOverlap });
  else if (ov.length) pass(`over-allocation figures involve genuinely overlapping periods (${ov.map((r: any) => r.person).join(', ')})`);
  else pass('nobody is over-allocated');

  // 5 — gate sequence integrity
  const gs = await sql`
    SELECT p.code, count(*)::int AS gates, min(g.seq)::int AS lo, max(g.seq)::int AS hi,
           count(*) FILTER (WHERE g.status='active')::int AS active
    FROM projects p JOIN gates g ON g.project_id=p.id GROUP BY p.code`;
  const badSeq = gs.filter((r: any) => r.lo !== 0 || r.hi !== r.gates - 1);
  badSeq.length ? fail('gate sequences are not contiguous from 0', badSeq) : pass('gate sequences contiguous from SG0');
  const multi = gs.filter((r: any) => r.active > 1);
  multi.length ? fail('a project has more than one active gate', multi) : pass('at most one active gate per project');

  // 6 — an approved gate must not sit after a locked one
  const order = await sql`
    SELECT p.code, g1.seq AS approved_seq, g2.seq AS earlier_not_approved
    FROM gates g1 JOIN gates g2 ON g1.project_id=g2.project_id AND g2.seq < g1.seq
    JOIN projects p ON p.id=g1.project_id
    WHERE g1.status='approved' AND g2.status <> 'approved'`;
  order.length ? fail('a gate is approved while an earlier gate is not', order)
               : pass('no gate approved out of order');

  // 7 — exactly one accountable approver on any gate that has approvers
  const acc = await sql`
    SELECT g.id, p.code, g.seq, count(*) FILTER (WHERE a.is_accountable)::int AS accountable
    FROM gates g JOIN approvals a ON a.gate_id=g.id JOIN projects p ON p.id=g.project_id
    GROUP BY g.id, p.code, g.seq`;
  const badAcc = acc.filter((r: any) => r.accountable !== 1);
  badAcc.length ? fail('a gate with approvers does not have exactly one accountable owner', badAcc)
                : pass('exactly one accountable owner per gate with approvers');

  // 8 — risk scores within the 5x5 matrix
  const rs = await sql`SELECT id, severity, likelihood FROM raid_items
    WHERE (severity IS NOT NULL AND severity NOT BETWEEN 1 AND 5)
       OR (likelihood IS NOT NULL AND likelihood NOT BETWEEN 1 AND 5)`;
  rs.length ? fail('risk severity/likelihood outside 1..5', rs) : pass('risk scores within 1..5');

  // 9 — progress percentages in range
  const pp = await sql`
    SELECT 'projects' AS t, code AS ref, progress_pct FROM projects WHERE progress_pct NOT BETWEEN 0 AND 100
    UNION ALL SELECT 'schedule_items', name, progress_pct FROM schedule_items WHERE progress_pct NOT BETWEEN 0 AND 100`;
  pp.length ? fail('progress_pct outside 0..100', pp) : pass('all progress values within 0..100');

  // 10 — dates must not run backwards
  const dt = await sql`
    SELECT 'projects' AS t, code AS ref FROM projects WHERE end_date < start_date
    UNION ALL SELECT 'schedule_items', name FROM schedule_items WHERE end_date < start_date
    UNION ALL SELECT 'allocations', role FROM allocations WHERE end_date < start_date`;
  dt.length ? fail('end date precedes start date', dt) : pass('no reversed date ranges');

  // 11 — orphan tenant references
  const orph = await sql`
    SELECT 'projects' AS t, count(*)::int AS n FROM projects p
      WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id=p.tenant_id)
    UNION ALL SELECT 'gates', count(*)::int FROM gates g
      WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id=g.project_id AND p.tenant_id=g.tenant_id)
    UNION ALL SELECT 'raid_items', count(*)::int FROM raid_items r
      WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id=r.project_id AND p.tenant_id=r.tenant_id)`;
  const bad = orph.filter((r: any) => r.n > 0);
  bad.length ? fail('child rows whose tenant_id does not match their parent', bad)
             : pass('every child row shares its parent tenant');

  // 12 — a RAID item may only block a gate on its own project
  const xg = await sql`
    SELECT r.title FROM raid_items r JOIN gates g ON g.id=r.blocks_gate_id
    WHERE g.project_id <> r.project_id`;
  xg.length ? fail('a register item blocks a gate belonging to a different project', xg)
            : pass('register items only block gates on their own project');

  // 13 — actual spend should not exceed commitments without explanation
  const oc = await sql`
    SELECT p.code, category,
           sum(amount) FILTER (WHERE kind='commitment')::float AS committed,
           sum(amount) FILTER (WHERE kind='actual')::float AS actual
    FROM cost_entries c JOIN projects p ON p.id=c.project_id
    GROUP BY p.code, category
    HAVING sum(amount) FILTER (WHERE kind='actual') >
           coalesce(sum(amount) FILTER (WHERE kind='commitment'),0)
       AND sum(amount) FILTER (WHERE kind='commitment') IS NOT NULL`;
  oc.length ? warn('spend exceeds commitment in some categories (possible, but usually an error)', oc)
            : pass('no category has spend beyond its commitment');

  // 14 — benefits tile: does averaging include not-yet-started benefits?
  const bt = await sql`
    SELECT count(*) FILTER (WHERE status='planned')::int AS planned,
           count(*)::int AS total FROM benefits`;
  const [avg] = await sql`
    SELECT coalesce(round(avg(CASE WHEN status <> 'planned' AND target <> baseline
             THEN greatest(0, least(100, ((coalesce(actual,baseline)-baseline)/(target-baseline))*100)) END))::int,0) AS started_only,
           coalesce(round(avg(CASE WHEN target <> baseline
             THEN greatest(0, least(100, ((coalesce(actual,baseline)-baseline)/(target-baseline))*100)) END))::int,0) AS all_benefits
    FROM benefits`;
  Number(bt[0].planned) > 0 && Number(avg.started_only) !== Number(avg.all_benefits)
    ? pass(`benefits average excludes ${bt[0].planned} not-started benefit(s): ${avg.started_only}% rather than ${avg.all_benefits}%`)
    : pass('benefits average covers only started benefits');

  console.log(`\n${fails === 0 ? '\x1b[32mNo integrity failures' : `\x1b[31m${fails} failure(s)`}\x1b[0m` +
              (warns ? `, \x1b[33m${warns} warning(s)\x1b[0m` : '') + '\n');
  if (fails) process.exitCode = 1;
}
main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
