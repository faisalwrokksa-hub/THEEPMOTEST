import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');
const overview = read('apps/api/src/modules/insights.service.ts');
const shared = read('apps/api/src/governance/executive-gate-query.ts');
const trends = read('apps/api/src/modules/trends.service.ts');
const governance = read('apps/api/src/governance/governance.service.ts');
const home = read('apps/web/src/app/(app)/page.tsx');
const dictionary = read('packages/contracts/src/i18n.ts');

test('the gate metric counts all authoritative gate blockers, not only RAID', () => {
  for (const expression of ['criteria_total=0', 'criteria_unmet>0', 'approvers_total=0',
    'accountable_total=0', 'approvals_pending>0', 'approvals_rejected>0',
    'raid_blockers>0', 'prior_unapproved>0']) {
    assert.ok(shared.includes(expression), `missing blocker rule: ${expression}`);
  }
});
test('attention uses left join so gate-less projects remain visible', () => {
  assert.match(shared, /FROM projects p\s+LEFT JOIN LATERAL/);
  assert.match(shared, /p\.health<>'on_track'/);
  assert.match(shared, /coalesce\(r\.critical_raid,0\)>0/);
  assert.match(shared, /coalesce\(r\.overdue_raid,0\)>0/);
});
test('attention shows one project per row and limits executive page size', () => {
  assert.match(shared, /SELECT gs\.\* FROM gate_state gs WHERE gs\.project_id=p\.id/);
  assert.match(shared, /LIMIT 50/);
  assert.match(shared, /count\(\*\) OVER \(\)::int AS "totalAttention"/);
});
test('gate summary and attention execute under tenant RLS', () => {
  assert.match(overview, /async overview\(\) \{\s+return withTenant\(this\.tenant\(\)/);
});
test('the historical gate snapshot includes missing approval ownership', () => {
  assert.match(trends, /NOT EXISTS \(SELECT 1 FROM approvals a WHERE a\.gate_id=g\.id AND a\.is_accountable\)/);
  assert.match(trends, /previous\.status<>'approved'/);
});
test('governance board does not green-light missing accountable approvals', () => {
  assert.match(governance, /row\.approversTotal > 0/);
  assert.match(governance, /row\.accountableTotal > 0/);
  assert.match(governance, /row\.rejectedApprovals === 0/);
});
test('executive UI links directly to relevant tenant-scoped workflow', () => {
  assert.match(home, /attentionReasons\(a\)/);
  assert.match(home, /attentionLink\(a\)/);
});
test('Arabic dictionary includes all executive reason labels', () => {
  for (const name of ['Missing gate checklist', 'Unmet criteria', 'Pending signatures',
    'Rejected approvals', 'Open gate blockers', 'Critical RAID items', 'Overdue RAID items']) {
    assert.ok(dictionary.includes(`'${name}':`));
  }
});

test('board-pack HTML consumes the current executive attention schema', () => {
  const board = read('apps/web/src/app/(app)/reports/board-pack/page.tsx');
  assert.match(board, /attentionReasonText\(a, t, lang\)/);
  assert.match(board, /a\.gateSeq === null/);
  assert.doesNotMatch(board, /a\.reason\b/);
});

test('Word and PowerPoint use the same priority queue with Arabic-safe reason codes', () => {
  const pack = read('apps/api/src/exports/pack-data.ts');
  const word = read('apps/api/src/exports/word.ts');
  const slides = read('apps/api/src/exports/slides.ts');
  assert.match(pack, /tx.execute\(executiveAttentionQuery\)/);
  assert.match(pack, /tx.execute\(sql`\s+\$\{activeGateState\}/);
  assert.match(word, /localizedExportReasons\(a, t\)/);
  assert.match(slides, /localizedExportReasons\(a, t\)/);
});
