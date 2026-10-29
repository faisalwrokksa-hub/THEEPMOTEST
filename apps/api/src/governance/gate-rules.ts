import { sql } from 'drizzle-orm';
import type { GateBlocker } from '@pmo/contracts';

type Tx = { execute: (q: any) => Promise<unknown> };
const rows = (r: unknown) => r as unknown as any[];

/**
 * The gate rule, in one place.
 *
 * Evaluated inside the same transaction that performs the advance, so the
 * answer cannot go stale between the check and the write. The UI calls this
 * too, but only to explain itself — the server never trusts what it was told.
 */
export async function gateBlockers(tx: Tx, gateId: string): Promise<GateBlocker[]> {
  const out: GateBlocker[] = [];

  const [g] = rows(await tx.execute(sql`
    SELECT g.id, g.seq, g.name, g.status, g.project_id AS "projectId"
    FROM gates g WHERE g.id = ${gateId}`));
  if (!g) return [{ kind: 'status', message: 'Gate not found' }];

  if (g.status !== 'active') {
    out.push({ kind: 'status', message: `Gate is ${g.status}, so it cannot be advanced` });
    return out;
  }

  // Every earlier gate must already be approved: no skipping ahead.
  const [prior] = rows(await tx.execute(sql`
    SELECT count(*)::int AS n FROM gates
    WHERE project_id = ${g.projectId} AND seq < ${g.seq} AND status <> 'approved'`));
  if (prior.n > 0)
    out.push({ kind: 'sequence', message: `${prior.n} earlier gate(s) are not approved yet` });

  const [crit] = rows(await tx.execute(sql`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE is_met)::int AS met
    FROM gate_criteria WHERE gate_id = ${gateId}`));
  if (crit.total === 0)
    out.push({ kind: 'criteria', message: 'No entry criteria are defined for this gate' });
  else if (crit.met < crit.total)
    out.push({ kind: 'criteria', message: `${crit.total - crit.met} of ${crit.total} criteria still unmet` });

  const [appr] = rows(await tx.execute(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE decision = 'pending')::int  AS pending,
           count(*) FILTER (WHERE decision = 'rejected')::int AS rejected,
           count(*) FILTER (WHERE is_accountable)::int        AS accountable
    FROM approvals WHERE gate_id = ${gateId}`));
  if (appr.total === 0) out.push({ kind: 'approval', message: 'No approvers are assigned' });
  if (appr.accountable === 0)
    out.push({ kind: 'approval', message: 'No accountable owner is named for this decision' });
  if (appr.pending > 0)
    out.push({ kind: 'approval', message: `${appr.pending} signature(s) outstanding` });
  if (appr.rejected > 0)
    out.push({ kind: 'approval', message: `${appr.rejected} approver(s) rejected this gate` });

  const blockers = rows(await tx.execute(sql`
    SELECT title FROM raid_items
    WHERE blocks_gate_id = ${gateId} AND status <> 'closed'`));
  for (const b of blockers)
    out.push({ kind: 'register', message: `Blocked by: ${b.title}` });

  return out;
}
