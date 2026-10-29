/** Offline integration tests for the admin SQL-ledger runner.
 * Mock psql is only a protocol fixture, NOT a PostgreSQL execution test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const runner = resolve(root, 'scripts/apply-sql-migrations.sh');
const expected = readFileSync(resolve(root, 'packages/db/migrations/meta/_journal.json'),'utf8');
const expectedCount = JSON.parse(expected).entries.length;
const shim = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const ledger = process.env.EPMO_TEST_LEDGER;
const trace = process.env.EPMO_TEST_TRACE;
const applied = fs.existsSync(ledger) ? JSON.parse(fs.readFileSync(ledger,'utf8')) : [];
if (args.includes('-c')) {
  const sql = args.at(-1);
  if (sql.includes('drizzle.__drizzle_migrations')) {
    console.log(process.env.EPMO_TEST_DRIZZLE === 'true' ? '1' : '0');
  } else if (sql.includes('SELECT 1 FROM public.schema_migrations')) {
    const name = /filename = '([^']+)'/.exec(sql)?.[1];
    if (applied.includes(name)) console.log('1');
  } else if (sql.includes('SELECT filename FROM public.schema_migrations')) {
    console.log([...applied].sort().join('\\n'));
  } else process.exit(4);
} else {
  const chunks=[];
  process.stdin.on('data', chunk => chunks.push(chunk));
  process.stdin.on('end', () => {
    const sql = Buffer.concat(chunks).toString('utf8');
    const name = /INSERT INTO public\\.schema_migrations\\(filename\\) VALUES \\('([^']+)'\\)/.exec(sql)?.[1];
    if (name) {
      fs.appendFileSync(trace, name+'\\n');
      if (name === process.env.EPMO_TEST_FAIL_AT) process.exit(7);
      if (!/^BEGIN;\\s/.test(sql) || !/COMMIT;\\s*$/.test(sql)) process.exit(8);
      fs.writeFileSync(ledger, JSON.stringify([...applied,name]));
    }
  });
}
`;

function fixture(options = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'epmo-sql-runner-'));
  const bin = join(tmp, 'psql');
  const ledger = join(tmp, 'ledger.json');
  const trace = join(tmp, 'trace.log');
  writeFileSync(bin, shim);
  chmodSync(bin, 0o755);
  const env = {
    ...process.env,
    PATH: `${tmp}:${process.env.PATH}`,
    PGHOST: 'localhost', PGPORT:'5433', PGUSER:'postgres', PGDATABASE:'pmo',
    PGPASSWORD:'ci-only-testing', EPMO_TEST_LEDGER:ledger,
    EPMO_TEST_TRACE:trace, EPMO_TEST_DRIZZLE:'false', EPMO_TEST_FAIL_AT:'',
    ...options,
  };
  return {
    run: extra => spawnSync('bash',[runner],{ cwd:root,env:{...env,...extra},encoding:'utf8',timeout:15000 }),
    applied: () => JSON.parse(readFileSync(ledger,'utf8')),
    trace: () => readFileSync(trace,'utf8'),
    cleanup: () => rmSync(tmp,{recursive:true,force:true}),
  };
}
test('runner shell syntax and application-role guard', () => {
  const result=spawnSync('bash',['-n',runner],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const f=fixture();
  try {
    const blocked=f.run({PGUSER:'pmo_app'});
    assert.equal(blocked.status,1);
    assert.match(blocked.stderr,/administrator, not pmo_app/);
  } finally {f.cleanup();}
});
test('runner refuses an existing Drizzle journal before altering database', () => {
  const f=fixture();
  try {
    const blocked=f.run({EPMO_TEST_DRIZZLE:'true'});
    assert.equal(blocked.status,1,blocked.stderr);
    assert.match(blocked.stderr,/never mix migration ledgers/);
  } finally {f.cleanup();}
});
test('runner applies ordered migrations, journals transactionally and skips on retry', () => {
  const f=fixture();
  try {
    const first=f.run();
    assert.equal(first.status,0,first.stderr);
    assert.equal(f.applied().length,expectedCount);
    assert.match(first.stdout,new RegExp(`PASS: ${expectedCount} SQL migrations`));
    const second=f.run();
    assert.equal(second.status,0,second.stderr);
    assert.equal(f.applied().length,expectedCount);
    assert.equal(f.trace().trim().split('\n').length,expectedCount);
    assert.match(second.stdout,/SKIP: 0015_stripe_checkout_sessions.sql/);
  } finally {f.cleanup();}
});
test('failed migration blocks release and leaves ledger short', () => {
  const f=fixture({EPMO_TEST_FAIL_AT:'0002_module_status_roadmap.sql'});
  try {
    const result=f.run();
    assert.equal(result.status,1,result.stderr);
    assert.match(result.stderr,/migration and ledger insertion rolled back/);
    assert.equal(f.applied().length,2);
    assert.doesNotMatch(result.stdout,/PASS:/);
  } finally {f.cleanup();}
});
test('CI invokes the SQL runner with an admin role before applying RLS', () => {
  const ci=readFileSync(resolve(root,'.github/workflows/ci.yml'),'utf8');
  assert.match(ci,/run: bash scripts\/apply-sql-migrations\.sh/);
  assert.doesNotMatch(ci,/^\s+run: pnpm db:migrate$/m);
  assert.ok(ci.indexOf('run: bash scripts/apply-sql-migrations.sh') < ci.indexOf('name: Apply RLS policies'));
  assert.match(ci,/PGUSER: postgres/);
  assert.match(ci,/PGPASSWORD: postgres/);
});
