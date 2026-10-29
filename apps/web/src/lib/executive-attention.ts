/** Safe, translated reason codes for the executive priority queue.
 * Presentation-only: the API performs authoritative authorization/queries.
 */
export type AttentionItem = {
  projectId: string;
  gateSeq: number | null;
  health: string;
  criteriaTotal: number;
  criteriaUnmet: number;
  approversTotal: number;
  accountableTotal: number;
  approvalsPending: number;
  approvalsRejected: number;
  raidBlockers: number;
  priorUnapproved: number;
  criticalRaid: number;
  overdueRaid: number;
};

export type AttentionReason = { key: string; count?: number };

export function attentionReasons(a: AttentionItem): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  if (a.gateSeq !== null && a.gateSeq !== undefined) {
    if (a.criteriaTotal === 0) reasons.push({ key: 'Missing gate checklist' });
    if (a.criteriaUnmet > 0) reasons.push({ key: 'Unmet criteria', count: a.criteriaUnmet });
    if (a.approversTotal === 0) reasons.push({ key: 'No approvers assigned' });
    if (a.accountableTotal === 0 && a.approversTotal > 0)
      reasons.push({ key: 'No accountable approver' });
    if (a.approvalsPending > 0)
      reasons.push({ key: 'Pending signatures', count: a.approvalsPending });
    if (a.approvalsRejected > 0)
      reasons.push({ key: 'Rejected approvals', count: a.approvalsRejected });
    if (a.priorUnapproved > 0)
      reasons.push({ key: 'Unapproved prior gates', count: a.priorUnapproved });
    if (a.raidBlockers > 0)
      reasons.push({ key: 'Open gate blockers', count: a.raidBlockers });
  }
  if (a.criticalRaid > 0) reasons.push({ key: 'Critical RAID items', count: a.criticalRaid });
  if (a.overdueRaid > 0) reasons.push({ key: 'Overdue RAID items', count: a.overdueRaid });
  if (reasons.length === 0) reasons.push({ key: 'health flag, no blocker recorded' });
  return reasons;
}

export function attentionLink(a: Pick<AttentionItem, 'projectId' | 'gateSeq'>): string {
  // Project identifiers are never used as arbitrary URLs.
  return a.gateSeq === null || a.gateSeq === undefined
    ? '/raid'
    : `/governance/${encodeURIComponent(a.projectId)}`;
}

/** Board-pack / exports use the same reason vocabulary as the overview. */
export function attentionReasonText(a: AttentionItem, t: (key: string) => string,
  lang: 'ar' | 'en' = 'en'): string {
  const locale = lang === 'ar' ? 'ar-SA' : 'en-US';
  return attentionReasons(a).map(({ key, count }) =>
    count === undefined ? t(key) : `${count.toLocaleString(locale)} ${t(key)}`,
  ).join(' · ');
}
