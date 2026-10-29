import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { disposableRestoreConfig, DATA_CHECK_SQL } from './verify-ci-database-restore.mjs';
import { CI_GATES, verifyReceipts, recordGate } from './phase15e-release-evidence.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const env = { CI: 'true', GITHUB_ACTIONS: 'true', NODE_ENV: 'test',
  PHASE15_ACCEPT_DISPOSABLE_DB: 'YES_RESEED_DISPOSABLE_TEST_DATABASE',
  DATABASE_URL: 'postgres://pmo_app:local_dummy@localhost:5433/pmo',
  DATABASE_URL_ADMIN: 'postgres://postgres:local_dummy@localhost:5433/pmo' };
const valid = e => disposableRestoreConfig({...env,...e});

test('accepts only the seeded disposable GitHub CI database', () => {
  assert.deepEqual(valid({}), {host:'localhost',port:'5433',database:'pmo',user:'postgres',password:'local_dummy'});
});
test('requires actual GitHub Actions identity and explicit disposable acknowledgement', () => {
  for (const changed of [{CI:'false'},{GITHUB_ACTIONS:'false'},{PHASE15_ACCEPT_DISPOSABLE_DB:''},
    {NODE_ENV:'production'},{NODE_ENV:'development'},{DEPLOYMENT_ENV:'staging'},{DEPLOYMENT_ENV:'production'}])
    assert.throws(() => valid(changed), /Blocked/);
});
test('rejects remote and public database addresses', () => {
  for (const remote of ['db.example.com', '10.0.0.5', '169.254.169.254', 'postgres.internal'])
    assert.throws(() => valid({DATABASE_URL_ADMIN:`postgres://postgres:pw@${remote}:5433/pmo`}),/disposable PostgreSQL|same local database/);
});
test('refuses a different source or destination database and port', () => {
  for (const changed of [
    { DATABASE_URL_ADMIN:'postgres://postgres:pw@localhost:5432/pmo' },
    { DATABASE_URL_ADMIN:'postgres://postgres:pw@localhost:5433/customer_production' },
    { DATABASE_URL:'postgres://pmo_app:pw@localhost:5433/other' },
    { DATABASE_URL:'postgres://postgres:pw@localhost:5433/pmo' },
    { DATABASE_URL_ADMIN:'postgres://pmo_app:pw@localhost:5433/pmo' },
  ]) assert.throws(() => valid(changed), /Blocked|disposable PostgreSQL|expected restricted/);
});
test('rejects URL parameters that could inject PostgreSQL connection settings', () => {
  for(const changed of [
    {DATABASE_URL_ADMIN:'postgres://postgres:pw@localhost:5433/pmo?options=-c%20search_path%3Dfoo'},
    {DATABASE_URL:'postgres://pmo_app:pw@localhost:5433/pmo#bad'},
  ]) assert.throws(() => valid(changed), /disposable PostgreSQL/);
});
test('restore drill does not issue DROP against the seeded source database', () => {
  const code = readFileSync(new URL('./verify-ci-database-restore.mjs', import.meta.url),'utf8');
  assert.match(code, /const destination = `epmo_ci_restore_\$\{randomBytes\(10\)\.toString\('hex'\)\}`/);
  assert.match(code, /if \(created\) \{/);
  assert.match(code, /'dropdb', \[\.\.\.args, '--if-exists', '--', destination\]/);
  assert.match(code, /'pg_restore', \[\.\.\.args, '--exit-on-error', '--single-transaction'/);
});
test('restore must validate seeded tenant and user rows and migration count', () => {
  assert.match(DATA_CHECK_SQL,/public\.users/);
  assert.match(DATA_CHECK_SQL,/public\.tenants/);
  assert.match(DATA_CHECK_SQL,/public\.memberships/);
  assert.match(DATA_CHECK_SQL,/public\.schema_migrations/);
});
test('CI records a successful restore before typechecking and refuses missing evidence', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const restore = workflow.indexOf('node scripts/verify-ci-database-restore.mjs');
  const receipt = workflow.indexOf('record db_restore');
  const types = workflow.indexOf('run: pnpm typecheck');
  assert.ok(restore > 0 && receipt > restore && types > receipt);
  assert.ok(CI_GATES.includes('db_restore'));
  const dir=mkdtempSync(join(tmpdir(),'epmo-restore-receipt-'));
  try {
    const context={sha:'a'.repeat(40),runId:'456'};
    for (const gate of CI_GATES) if (gate!=='db_restore') recordGate(dir,gate,context);
    const result=verifyReceipts(dir,'ci',context);
    assert.equal(result.passed,false);
    assert.equal(result.checks.find(c=>c.gate==='db_restore')?.passed,false);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('libpq child processes cannot inherit PGHOSTADDR or arbitrary service overrides', () => {
  const code = readFileSync(new URL('./verify-ci-database-restore.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /const childEnv = \{ \.\.\.env/);
  assert.match(code, /const childEnv = \{/);
  assert.match(code, /PGHOST: cfg.host/);
  assert.match(code, /PGDATABASE: cfg.database/);
  assert.doesNotMatch(code, /PGHOSTADDR: env\.PGHOSTADDR/);
});

test('disposable restore requires CI-only source and explicitly generated destination', () => {
  const code = readFileSync(new URL('./verify-ci-database-restore.mjs', import.meta.url), 'utf8');
  assert.match(code, /NODE_ENV !== 'test'/);
  assert.match(code, /GITHUB_ACTIONS !== 'true'/);
  assert.match(code, /mkdtempSync\(join\(tmpdir\(\), 'epmo-ci-restore-'\)\)/);
});
