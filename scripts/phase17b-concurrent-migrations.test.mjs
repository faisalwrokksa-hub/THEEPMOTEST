/** Phase 17B regression checks for concurrent SQL-ledger migration runners.
 * This checks the SQL commands emitted via an instrumented psql executable;
 * PostgreSQL lock scheduling must still be verified against a real database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ciRunner = readFileSync(resolve(root, 'scripts/apply-sql-migrations.sh'), 'utf8');
const deployRunner = readFileSync(resolve(root, 'infra/bootstrap-db.sh'), 'utf8');
const numberOfMigrations = JSON.parse(readFileSync(resolve(root, 'packages/db/migrations/meta/_journal.json'), 'utf8')).entries.length;

// This fixture observes SQL but is NOT a PostgreSQL interpreter.
const shim = `#!/usr/bin/env node
const fs=require('node:fs');
const args=process.argv.slice(2);
const ledger=process.env.EPMO_MOCK_LEDGER;
const applied=fs.existsSync(ledger)?JSON.parse(fs.readFileSync(ledger,'utf8')):[];
if(args.includes('-c')){
 const query=args.at(-1);
 if(query.includes('drizzle.__drizzle_migrations'))console.log('0');
 else if(query.includes('SELECT 1 FROM public.schema_migrations')){
  const file=/filename = '([^']+)'/.exec(query)?.[1];
  if(applied.includes(file)) console.log('1');
 }else if(query.includes('SELECT COALESCE(source_sha256')){
  const name=/filename = '([^']+)'/.exec(query)?.[1];
  if(applied.includes(name)){
   const {createHash}=require('node:crypto');
   const {join}=require('node:path');
   console.log(createHash('sha256').update(fs.readFileSync(join(process.cwd(),'packages/db/migrations',name))).digest('hex'));
  }
 }else if(query.includes('SELECT filename FROM public.schema_migrations'))console.log([...applied].sort().join('\\n'));
 else process.exit(2);
}else{
 const parts=[];
 process.stdin.on('data',v=>parts.push(v));
 process.stdin.on('end',()=>{
  const sql=Buffer.concat(parts).toString('utf8');
  if(sql.includes('INSERT INTO public.schema_migrations(filename)')){
    const name=/INSERT INTO public\\.schema_migrations\\(filename\\) VALUES \\('([^']+)'\\)/.exec(sql)?.[1];
    if(!name)process.exit(3);
    if(!sql.includes('LOCK TABLE public.schema_migrations IN EXCLUSIVE MODE;')||
       !sql.includes('AS needs_apply \\\\gset')||
       !sql.includes('\\\\if :needs_apply')||
       !sql.includes('\\\\else')||!sql.includes('\\\\endif'))process.exit(4);
    fs.appendFileSync(process.env.EPMO_MOCK_SQL_LOG,sql.slice(0,350)+'\\n===END===\\n');
    fs.writeFileSync(ledger,JSON.stringify([...applied,name]));
  }
 });
}
`;

function fixture() {
  const temp=mkdtempSync(join(tmpdir(), 'epmo-phase17b-'));
  const psql=join(temp,'psql');
  const ledger=join(temp,'ledger.json');
  const log=join(temp,'sql.log');
  writeFileSync(psql,shim); chmodSync(psql,0o755);
  const env={...process.env, PATH:`${temp}:${process.env.PATH}`,
    PGHOST:'localhost',PGUSER:'postgres',PGDATABASE:'pmo',PGPASSWORD:'ci-test',
    EPMO_MOCK_LEDGER:ledger,EPMO_MOCK_SQL_LOG:log};
  return { run:()=>spawnSync('bash',[resolve(root,'scripts/apply-sql-migrations.sh')],{cwd:root,env,encoding:'utf8',timeout:20000}),
    log, ledger, cleanup:()=>rmSync(temp,{recursive:true,force:true})};
}

test('CI runner protects first-time ledger creation with a PostgreSQL advisory lock',()=>{
  assert.match(ciRunner,/BEGIN;[\s\S]*pg_advisory_xact_lock\(1717, 2026\)[\s\S]*CREATE TABLE IF NOT EXISTS public\.schema_migrations[\s\S]*COMMIT;/);
});
test('deployment runner protects first-time ledger creation with the same lock',()=>{
  assert.match(deployRunner,/BEGIN;[\s\S]*pg_advisory_xact_lock\(1717, 2026\)[\s\S]*CREATE TABLE IF NOT EXISTS schema_migrations[\s\S]*COMMIT;/);
});
test('both runners recheck ledger row under an exclusive transaction lock',()=>{
  for (const source of [ciRunner,deployRunner]) {
    assert.match(source,/LOCK TABLE public\.schema_migrations IN EXCLUSIVE MODE/);
    assert.match(source,/SELECT NOT EXISTS \(SELECT 1 FROM public\.schema_migrations WHERE filename =/);
    assert.match(source,/AS needs_apply \\\\gset/);
    assert.match(source,/printf '\\\\if :needs_apply/);
    assert.match(source,/printf '\\\\else/);
    assert.match(source,/\\\\endif\\nCOMMIT;/);
  }
});
test('CI emits transactional SQL guards for every previously unapplied migration',()=>{
  const f=fixture();
  try {
    const result=f.run();
    assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(readFileSync(f.ledger,'utf8')).length,numberOfMigrations);
    const sql=readFileSync(f.log,'utf8');
    assert.equal(sql.split('===END===').length-1,numberOfMigrations);
    assert.match(sql,/LOCK TABLE public\.schema_migrations IN EXCLUSIVE MODE/);
  }finally{f.cleanup();}
});
test('re-running the CI runner skips recorded migrations without re-emitting DDL',()=>{
  const f=fixture();
  try {
    assert.equal(f.run().status,0);
    const before=readFileSync(f.log,'utf8');
    const result=f.run();
    assert.equal(result.status,0,result.stderr);
    assert.equal(readFileSync(f.log,'utf8'),before);
    assert.match(result.stdout,/SKIP: 0017_tenant_membership_status.sql/);
  }finally{f.cleanup();}
});
test('CI keeps the SQL runner before applying PostgreSQL RLS policies',()=>{
  const ci=readFileSync(resolve(root,'.github/workflows/ci.yml'),'utf8');
  assert.ok(ci.indexOf('bash scripts/apply-sql-migrations.sh')>=0);
  assert.ok(ci.indexOf('bash scripts/apply-sql-migrations.sh')<ci.indexOf('name: Apply RLS policies'));
});

test('both deployment entrypoints refuse unattested historical migration bytes',()=>{
  for (const source of [ciRunner,deployRunner]) {
    assert.match(source,/source_sha256 IS DISTINCT FROM/);
    assert.match(source,/never auto-backfill/);
    assert.match(source,/UPDATE public\.schema_migrations SET source_sha256/);
  }
});
