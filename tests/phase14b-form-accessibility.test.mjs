import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const text = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const form = text('apps/web/src/components/NewRecord.tsx');
const route = text('apps/web/src/app/api/create/route.ts');
const css = text('apps/web/src/app/globals.css');
const field = page => text(`apps/web/src/app/(app)/${page}/page.tsx`);

test('client validation runs before any submission', () => {
  assert.ok(form.indexOf('validateCreateForm(kind, values)') > 0);
  assert.ok(form.indexOf('validateCreateForm(kind, values)') < form.indexOf('await fetch(form.action'));
});
test('rapid duplicate submissions are prevented', () => {
  assert.match(form, /if \(busyGuard\.current\) return/);
  assert.match(form, /busyGuard\.current = true/);
  assert.match(form, /finally \{\s*busyGuard\.current = false/);
});
test('form input is preserved when API refuses save', () => {
  // A 2xx status alone is insufficient: require the API's explicit create acknowledgement.
  assert.match(form, /if \(!isCreateSuccess\(res\.status, j, window\.location\.origin\)\)/);
  assert.match(form, /window\.location\.assign\(j\.redirect\)/);
  assert.ok(form.indexOf('window.location.assign(j.redirect)') > form.indexOf('if (!isCreateSuccess(res.status, j, window.location.origin))'));
  assert.match(form, /setError\(/);
  assert.match(form, /return;\s*}\s*\/\/ Navigate only after confirmed success/);
});
test('API route preserves structured field-level validation without leaking upstream messages', () => {
  assert.match(route, /const issues = safeCreateIssues\(payload\)/);
  assert.match(route, /NextResponse\.json\(\{ error: message, issues \}/);
  assert.doesNotMatch(route, /issues: Array\.isArray\(j\?\.issues\) \? j\.issues : \[\]/);
});
test('server field names are allow-listed against form fields', () => {
  assert.match(form, /new Set\(fields\.map\(field => field\.name\)\)/);
  assert.match(form, /validNames\.has\(issue\.path\)/);
});
test('field errors are announced and connected to inputs', () => {
  assert.match(form, /aria-invalid=\{invalid\}/);
  assert.match(form, /aria-describedby=\{describedBy\}/);
  assert.match(form, /id=\{errId\}/);
  assert.match(form, /role="alert"/);
});
test('focus moves after field errors are committed', () => {
  assert.match(form, /useEffect\(\(\) => \{/);
  assert.match(form, /focusFirstInvalid\(formRef\.current, fieldErrors\)/);
});
test('field errors have visible styles including RTL-safe margins', () => {
  assert.match(css, /\[aria-invalid="true"\]/);
  assert.match(css, /\.newform \.field-error/);
});
test('create form keeps no-JavaScript POST fallback and csrf checks', () => {
  assert.match(form, /method="post" action="\/api\/create"/);
  assert.match(route, /rejectUnsafeBrowserMutation\(req\)/);
});
test('project creation advertises code, budget constraints', () => {
  assert.match(field('projects'), /pattern: '\[A-Za-z0-9-\]\{2,16\}'/);
  assert.match(field('projects'), /budgetAmount'.*min: 0/);
});
test('allocation, schedule, and risk entries carry numeric bounds', () => {
  assert.match(field('resources'), /allocationPct'.*min: 1, max: 100, step: 1/);
  assert.match(field('planner'), /progressPct'.*min: 0, max: 100, step: 1/);
  assert.match(field('raid'), /severity'.*min: 1, max: 5, step: 1/);
});
test('financial amounts allow decimals and currency is limited to three letters', () => {
  assert.match(field('financials'), /amount'.*step: 'any'/);
  assert.match(field('financials'), /currency'.*pattern: '\[A-Za-z\]\{3\}'/);
});
test('stakeholder email uses native HTML5 validation', () => {
  assert.match(field('stakeholders'), /name: 'email', label: 'Email', type: 'email'/);
});
