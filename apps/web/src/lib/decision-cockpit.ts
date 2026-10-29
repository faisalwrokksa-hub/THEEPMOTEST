/** Deterministic, explainable recommendations based ONLY on API-authorized
 * executive-attention data. No finance figures or personal fields required.
 * The API / RLS is the authoritative security boundary. */
import { attentionLink, attentionReasons, type AttentionItem } from './executive-attention.ts';

export type ExecutiveException = {
  projectId: string; code: string; name: string; health: string;
  severity: 'critical' | 'high' | 'review';
  reasons: ReturnType<typeof attentionReasons>;
  recommendation: string; source: string;
};

type Input = AttentionItem & { code: string; name: string };

export function executiveException(row: Input): ExecutiveException {
  const reasons = attentionReasons(row);
  const gateBlock = row.gateSeq !== null && (
    row.criteriaTotal === 0 || row.criteriaUnmet > 0 || row.approversTotal === 0 ||
    row.accountableTotal === 0 || row.approvalsPending > 0 ||
    row.approvalsRejected > 0 || row.raidBlockers > 0 || row.priorUnapproved > 0
  );
  const severity = row.criticalRaid > 0 || row.health === 'critical' || row.approvalsRejected > 0
    ? 'critical' : gateBlock || row.overdueRaid > 0 || row.health === 'at_risk' ? 'high' : 'review';
  const recommendation = row.criticalRaid > 0 ? 'Review critical risks and assign mitigation owners'
    : row.raidBlockers > 0 ? 'Resolve open blockers before gate approval'
    : row.approvalsRejected > 0 ? 'Review rejected approvals and required corrective evidence'
    : row.criteriaUnmet > 0 ? 'Complete outstanding gate criteria and supporting evidence'
    : row.approvalsPending > 0 ? 'Follow up with assigned approvers'
    : row.overdueRaid > 0 ? 'Review overdue register items and adjust recovery actions'
    : gateBlock ? 'Review gate setup and approval responsibilities'
    : 'Validate project health assessment and supporting evidence';
  return { projectId: row.projectId, code: row.code, name: row.name,
    health: row.health, severity, reasons, recommendation,
    source: attentionLink(row) };
}

export function executiveSummary(rows: Input[]) {
  const items = rows.map(executiveException);
  return {
    items,
    critical: items.filter(x => x.severity === 'critical').length,
    high: items.filter(x => x.severity === 'high').length,
    // These counts describe the returned window, not the whole portfolio.
    shown: items.length,
    total: rows.length ? Number((rows[0] as Input & {totalAttention?: number}).totalAttention ?? rows.length) : 0,
  };
}
