import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateDevSchemaPush } from './guard-dev-schema-push.mjs';

const root = resolve(import.meta.dirname, '..');
const scripts = JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).scripts;
const dbScripts = JSON.parse(readFileSync(resolve(root,'packages/db/package.json'),'utf8')).scripts;
const local = {
  EPMO_ALLOW_LOCAL_SCHEMA_PUSH:'YES_I_UNDERSTAND',
  DEPLOYMENT_ENV:'development',
  DATABASE_URL_ADMIN:'postgres://postgres:local-only@localhost:5433/pmo',
};
const safe = config => evaluateDevSchemaPush(config).every(item=>item.passed);

test('explicit local-only development push is allowed',()=>assert.equal(safe(local),true));
test('production and staging cannot invoke schema push',()=>{
  for (const mode of ['production','staging',undefined]) assert.equal(safe({...local,DEPLOYMENT_ENV:mode}),false);
});
test('missing opt-in is blocked even with valid development URL',()=>assert.equal(safe({...local,EPMO_ALLOW_LOCAL_SCHEMA_PUSH:undefined}),false));
test('remote, production, and changed-port admin URLs are blocked',()=>{
  for (const url of [
    'postgres://postgres:secret@db.example.net:5433/pmo',
    'postgres://postgres:secret@postgres:5432/pmo',
    'postgres://postgres:secret@localhost:5432/pmo',
    'postgres://postgres:secret@localhost:5433/customer_prod',
    'postgres://pmo_app:secret@localhost:5433/pmo',
    'postgres://postgres:secret@localhost:5433/pmo?sslmode=disable',
  ]) assert.equal(safe({...local,DATABASE_URL_ADMIN:url}),false,url);
});
test('CLI refuses absent opt-in and never prints a database password',()=>{
  const env={...process.env,DEPLOYMENT_ENV:'development',DATABASE_URL_ADMIN:local.DATABASE_URL_ADMIN};
  delete env.EPMO_ALLOW_LOCAL_SCHEMA_PUSH;
  const result=spawnSync('node',[resolve(root,'scripts/guard-dev-schema-push.mjs')],{cwd:root,env,encoding:'utf8'});
  assert.equal(result.status,1);
  assert.match(result.stdout,/BLOCKED.*Explicit destructive development opt-in/);
  assert.doesNotMatch(result.stdout+result.stderr,/local-only/);
});
test('CLI passes with explicit opt-in on disposable local database',()=>{
  const result=spawnSync('node',[resolve(root,'scripts/guard-dev-schema-push.mjs')],{
    cwd:root,env:{...process.env,...local},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal((result.stdout.match(/^PASS /gm)||[]).length,3);
});
test('root db:migrate uses the checked SQL ledger; package migrator is disabled',()=>{
  assert.equal(scripts['db:migrate'],'bash scripts/apply-sql-migrations.sh');
  assert.equal(dbScripts.migrate,'node ../../scripts/deny-drizzle-migrate.mjs');
  assert.match(readFileSync(resolve(root,'packages/db/src/migrate.ts'),'utf8'),/Unsafe Drizzle migration entrypoint disabled/);
});
test('schema push no longer uses force and always invokes safety guard',()=>{
  assert.match(dbScripts.push,/node \.\.\/\.\.\/scripts\/guard-dev-schema-push\.mjs && drizzle-kit push/);
  assert.doesNotMatch(dbScripts.push,/--force/);
});
test('legacy Drizzle migration launcher fails closed',()=>{
  const result=spawnSync('node',[resolve(root,'scripts/deny-drizzle-migrate.mjs')],{cwd:root,encoding:'utf8'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/BLOCKED.*Drizzle migrator/);
});
