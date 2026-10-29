import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const create = read('apps/api/src/creates/creates.service.ts');
const portfolio = read('apps/api/src/portfolio/portfolio.service.ts');
const controller = read('apps/api/src/portfolio/portfolio.controller.ts');
const listing = read('apps/web/src/app/(app)/projects/page.tsx');
const portfolios = read('apps/web/src/app/(app)/portfolios/page.tsx');
const table = read('apps/web/src/app/(app)/projects/ProjectsTable.tsx');

test('main create route validates programme visibility before insert', () => {
 assert.match(create,/SELECT id FROM programs WHERE id = \$\{b\.programId\}/);
 assert.ok(create.indexOf('SELECT id FROM programs WHERE id') < create.indexOf('INSERT INTO projects'));
});
test('main create route validates owner membership before insert', () => assert.match(create,/SELECT user_id FROM memberships WHERE user_id = \$\{b\.ownerId\}/));
test('both project create routes validate dates', () => {
 assert.match(create,/projectDateError\(b\.startDate, b\.endDate\)/);
 assert.match(portfolio,/projectDateError\(input\.startDate, input\.endDate\)/);
});
test('secondary create route requires project-management permission', () => assert.match(portfolio,/requireCapability\('pmoa_manage_projects'\)/));
test('secondary create route validates programme and owner', () => {
 assert.match(portfolio,/if \(input\.programId\)/);
 assert.match(portfolio,/if \(input\.ownerId\)/);
 assert.match(portfolio,/from\(memberships\)/);
});
test('project list uses validated programme filter on server', () => {
 assert.match(controller,/projectPageQuery = pageQuery\.extend/);
 assert.match(portfolio,/opts\.programId \? eq\(projects\.programId, opts\.programId\)/);
});
test('portfolio programmes deep-link into project list', () => assert.match(portfolios,/href=\{`\/projects\?program=/));
test('project table links to governance details', () => assert.match(table,/href=\{`\/governance\/\$\{r\.id\}`\}/));
test('programme filter is reflected on projects screen', () => assert.match(listing,/programFilter && <p className="filtered"/));

test('programme-linked create form preselects the selected programme', () => {
 const record = read('apps/web/src/components/NewRecord.tsx');
 assert.match(record,/defaultValue=\{f\.defaultValue \?\? ''\}/);
 assert.match(listing,/defaultValue: o\.programs\.some/);
});
test('project creation opens its new governance page after success', () => {
 const createRoute = read('apps/web/src/app/api/create/route.ts');
 assert.match(createRoute,/if \(kind === 'project'\)/);
 assert.match(createRoute,/publicUrl\(req, `\/governance\/\$\{created\.id\}`\)/);
});
