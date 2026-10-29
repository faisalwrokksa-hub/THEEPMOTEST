import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const insights = read('apps/api/src/modules/insights.service.ts');
const trends = read('apps/api/src/modules/trends.service.ts');
const portfolio = read('apps/api/src/portfolio/portfolio.service.ts');
const ask = read('apps/api/src/askx/askx.service.ts');
const exports = read('apps/api/src/exports/exports.service.ts');
const excel = read('apps/api/src/excel/excel.service.ts');
const creates = read('apps/api/src/creates/creates.service.ts');
const home = read('apps/web/src/app/(app)/page.tsx');
const shell = read('apps/web/src/app/(app)/layout.tsx');
const slice = (s, a, b) => s.split(a)[1].split(b)[0];

test('overview returns no financial aggregate to users without financial view', () => {
  const body = slice(insights, 'async overview() {', 'async myWork()');
  assert.match(body, /can\(this\.ctx\(\)\.capabilities \?\? \[\], 'pmoa_view_financials'\)/);
  assert.match(body, /FROM per_cat`\)\) : \[null\]/);
});
test('dashboard tolerates omitted financial aggregate without depicting false 0% spend', () => {
  assert.match(home, /d\.money\?\.budget/);
  assert.match(home, /\{d\.money && <div className="tile">/);
});
test('analytics leaves nonfinancial health intact while withholding spend-by-project', () => {
  const body = slice(insights, 'async analytics() {', 'async documents()');
  assert.match(body, /const byHealth = rows/);
  assert.match(body, /const spendByProject = can\(this\.ctx\(\)\.capabilities \?\? \[\], 'pmoa_view_financials'\)/);
  assert.match(body, /GROUP BY p\.code ORDER BY budget DESC`\)\) : \[\]/);
});
test('S-curve is restricted but other trends remain available', () => {
  const body = slice(trends, 'async trends(): Promise<Trends> {', 'async captureTenant(');
  assert.match(body, /const curve = can\(currentContext\(\)\.capabilities \?\? \[\], 'pmoa_view_financials'\)/);
  assert.match(body, /ORDER BY m\.period`\)\) : \[\]/);
  assert.match(body, /const throughput = rows/);
});
test('project lists mask budgets for readers without financial permission', () => {
  assert.match(portfolio, /allowed \? p : \{ \.\.\.p, budgetAmount: null \}/);
  assert.match(portfolio, /\? row : \{ \.\.\.row, budgetAmount: null \}/);
});
test('all sensitive Ask X entry points guard finance permission before queries or Bedrock', () => {
  for (const method of ['async ask(', 'async thread(', 'async threads(', 'async facts()']) {
    const part = ask.slice(ask.indexOf(method), ask.indexOf(method) + 480);
    assert.match(part, /requireCapability\('pmoa_view_financials'\)/, method);
  }
});
test('Ask X historical prompts cannot be retrieved across user identities', () => {
  assert.match(ask, /async history\(tx: any, threadId: string, userId: string\)/);
  assert.match(ask, /WHERE thread_id = \$\{threadId\} AND user_id = \$\{userId\}/);
  assert.match(ask, /this\.history\(tx, thread, userId\)/);
});
test('Guessing a foreign conversation ID cannot append a new conversation or see a transcript', () => {
  assert.match(ask, /if \(threadId && prior\.length === 0\) throw new NotFoundException/);
  assert.match(ask, /if \(!messages\.length\) throw new NotFoundException/);
});
test('AI conversation listing is user-owned, not tenant-wide', () => {
  const body = slice(ask, 'async threads() {', 'async facts()');
  assert.match(body, /WHERE role = 'user' AND user_id = \$\{userId\}/);
});
test('AI interface does not offer a widget to roles blocked by the API', () => {
  assert.match(shell, /enabled=\{enabledModules\.includes\('ai360'\) && can\(caps, 'pmoa_view_financials'\)\}/);
});
test('all board pack formats require financial viewing at their shared data boundary', () => {
  const body = slice(exports, 'private async pack(', 'async docx(');
  assert.match(body, /requireCapability\('pmoa_view_financials'\)/);
});
test('Excel project workbook is finance-gated because it contains costs and benefits', () => {
  const body = slice(excel, 'async exportProject(', 'async importWorkbook(');
  assert.match(body, /requireCapability\('pmoa_view_financials'\)/);
});
test('Excel import demands project-management AND financial-write capabilities', () => {
  const body = excel.slice(excel.indexOf('async importWorkbook('), excel.indexOf('async importWorkbook(')+420);
  assert.match(body, /requireCapability\('pmoa_manage_projects'\)/);
  assert.match(body, /requireCapability\('pmoa_manage_finance'\)/);
});
test('project creation with approved budget requires finance-write capability', () => {
  const body = slice(creates, 'async project(', 'async task(');
  assert.match(body, /if \(b\.budgetAmount != null\) requireCapability\('pmoa_manage_finance'\)/);
});

test('general activity hides audit diff payloads that can contain private costs', () => {
  const body = slice(insights, 'async activity() {', 'async financials()');
  assert.match(body, /CASE WHEN \$\{can\(this\.ctx\(\)\.capabilities \?\? \[\], 'pmoa_view_financials'\)\}/);
  assert.match(body, /THEN e\.diff ELSE NULL::jsonb END AS diff/);
});

test('AI rejects malformed conversation IDs before any database access', () => {
  assert.match(ask, /if \(threadId && !\/\^\[0-9a-f\]\{8\}/);
  assert.match(ask, /Invalid conversation reference/);
});
