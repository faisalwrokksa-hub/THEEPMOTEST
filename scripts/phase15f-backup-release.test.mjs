import test from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
const backup=join(root,'infra/backup-db.sh');
const deploy=join(root,'infra/deploy.sh');
const deploySource=readFileSync(deploy,'utf8');
function withWorkspace(callback) {
  const dir=mkdtempSync(join(tmpdir(),'epmo-phase15f-'));
  try {
    const project=join(dir,'project');
    mkdirSync(project);
    writeFileSync(join(project,'.env.staging'),'PG_USER=postgres\nPG_DB=pmo\n');
    writeFileSync(join(dir,'docker'),`#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$EPMO_TEST_TRACE"
case " $* " in
  *' pg_isready '*) exit 0 ;;
  *' pg_dump '*)
    if [[ "\${EPMO_TEST_DUMP_FAIL:-}" == '1' ]]; then exit 7; fi
    printf 'SIMULATED_CUSTOM_ARCHIVE' ;;
  *' pg_restore --list '*)
    cat >/dev/null
    if [[ "\${EPMO_TEST_VERIFY_FAIL:-}" == '1' ]]; then exit 9; fi
    echo 'simulated TOC' ;;
  *) exit 22 ;;
esac
`);
    chmodSync(join(dir,'docker'),0o755);
    return callback(dir);
  } finally {rmSync(dir,{recursive:true,force:true});}
}
function run(dir, overrides={}) {
  return spawnSync('bash',[backup,'staging'],{cwd:join(dir,'project'),encoding:'utf8',timeout:8000,
    env:{...process.env,PATH:`${dir}:${process.env.PATH}`,EPMO_BACKUP_DIR:join(dir,'backups'),EPMO_TEST_TRACE:join(dir,'docker.log'),...overrides}});
}
test('backup and deployment scripts have valid shell syntax',()=>{
  assert.equal(spawnSync('bash',['-n',backup]).status,0);
  assert.equal(spawnSync('bash',['-n',deploy]).status,0);
});
test('pre-migration backup succeeds and verifies SHA256 checksum',()=>withWorkspace(dir=>{
  const outcome=run(dir);
  assert.equal(outcome.status,0,outcome.stderr||outcome.stdout);
  const folder=join(dir,'backups');
  const files=readdirSync(folder);
  assert.equal(files.filter(x=>x.endsWith('.dump')).length,1);
  assert.equal(files.filter(x=>x.endsWith('.sha256')).length,1);
  assert.equal(files.filter(x=>x.startsWith('.')).length,0);
  const check=spawnSync('sha256sum',['-c',files.find(x=>x.endsWith('.sha256'))],{cwd:folder,encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
  const trace=readFileSync(join(dir,'docker.log'),'utf8');
  assert.match(trace,/pg_dump --format=custom/);
  assert.match(trace,/pg_restore --list/);
}));
test('pg_dump failure blocks deployment and cleans partial archive',()=>withWorkspace(dir=>{
  const outcome=run(dir,{EPMO_TEST_DUMP_FAIL:'1'});
  assert.equal(outcome.status,1);
  assert.match(outcome.stderr,/pg_dump failed/);
  assert.deepEqual(readdirSync(join(dir,'backups')),[]);
}));
test('invalid archive blocks deployment and cleans partial archive',()=>withWorkspace(dir=>{
  const outcome=run(dir,{EPMO_TEST_VERIFY_FAIL:'1'});
  assert.equal(outcome.status,1);
  assert.match(outcome.stderr,/pg_restore could not read/);
  assert.deepEqual(readdirSync(join(dir,'backups')),[]);
}));
test('unsafe relative backup destination fails closed',()=>withWorkspace(dir=>{
  const outcome=run(dir,{EPMO_BACKUP_DIR:'../../unsafe'});
  assert.equal(outcome.status,2);
  assert.match(outcome.stderr,/safe, non-symlink absolute path/);
  assert.equal(existsSync(join(dir,'backups')),false);
}));
test('deployment builds before dump, migrations, and service switch',()=>{
  const build=deploySource.indexOf('$COMPOSE build api web');
  const backupIndex=deploySource.indexOf("infra/backup-db.sh '$MODE'");
  const migrate=deploySource.indexOf("infra/bootstrap-db.sh '$MODE'");
  const switchOver=deploySource.indexOf('$COMPOSE up -d api web');
  assert.ok(build>=0 && build<backupIndex && backupIndex<migrate && migrate<switchOver,
    `${build}, ${backupIndex}, ${migrate}, ${switchOver}`);
  assert.match(deploySource,/if \[\[ "\$MODE" == staging \|\| "\$MODE" == prod \]\]/);
});

test('backup refuses destination inside deployed project before pg_dump',()=>withWorkspace(dir=>{
  const inside=join(dir,'project','backups');
  const result=run(dir,{EPMO_BACKUP_DIR:inside});
  assert.equal(result.status,2,result.stderr);
  assert.match(result.stderr,/inside the deployment tree/);
  assert.equal(existsSync(inside),false);
  assert.equal(existsSync(join(dir,'docker.log')),false);
}));
test('backup refuses deployment directory itself',()=>withWorkspace(dir=>{
  const result=run(dir,{EPMO_BACKUP_DIR:join(dir,'project')});
  assert.equal(result.status,2,result.stderr);
  assert.match(result.stderr,/inside the deployment tree/);
  assert.equal(existsSync(join(dir,'docker.log')),false);
}));
test('backup refuses a symlinked parent pointing into deployment tree',()=>withWorkspace(dir=>{
  symlinkSync(join(dir,'project'),join(dir,'linked'));
  const inside=join(dir,'linked','backups');
  const result=run(dir,{EPMO_BACKUP_DIR:inside});
  assert.equal(result.status,2,result.stderr);
  assert.match(result.stderr,/inside the deployment tree/);
  assert.equal(existsSync(join(dir,'project','backups')),false);
}));
test('backup permits external directory even with similar path prefix',()=>withWorkspace(dir=>{
  const safe=join(dir,'project-backups');
  const result=run(dir,{EPMO_BACKUP_DIR:safe});
  assert.equal(result.status,0,result.stderr);
  assert.equal(readdirSync(safe).filter(x=>x.endsWith('.dump')).length,1);
}));

test('checksum verification failure removes published archive and blocks migration',()=>withWorkspace(dir=>{
  // The first hash is generated normally; fail only the final -c check.
  writeFileSync(join(dir,'sha256sum'),`#!/usr/bin/env bash
if [[ "\$1" == '-c' ]]; then exit 8; fi
exec /usr/bin/sha256sum "\$@"
`.replaceAll('\\$', '$'));
  chmodSync(join(dir,'sha256sum'),0o755);
  const result=run(dir);
  assert.equal(result.status,1,result.stderr||result.stdout);
  assert.match(result.stderr,/checksum verification failed/);
  assert.deepEqual(readdirSync(join(dir,'backups')),[]);
}));
