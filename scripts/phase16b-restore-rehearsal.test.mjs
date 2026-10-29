import test from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const script=resolve(import.meta.dirname,'../infra/rehearse-db-restore.sh');
const filename='epmo-staging-20261026T120000Z-abc123.dump';
function fixture(run) {
  const dir=mkdtempSync(join(tmpdir(),'epmo-phase16b-'));
  try {
    const project=join(dir,'project');
    const backups=join(dir,'backups');
    mkdirSync(project);mkdirSync(backups);
    writeFileSync(join(project,'.env.staging'),'DEPLOYMENT_ENV=staging\nPG_USER=postgres\nPG_DB=pmo\n');
    const archive=join(backups,filename);
    const contents='synthetic test archive - no customer data';
    writeFileSync(archive,contents);
    const hash=createHash('sha256').update(contents).digest('hex');
    writeFileSync(archive+'.sha256',`${hash}  ${filename}\n`);
    const docker=join(dir,'docker');
    writeFileSync(docker,`#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$EPMO_TEST_DOCKER_LOG"
case " $* " in
  *' createdb '*) [[ "\${EPMO_TEST_CREATE_FAIL:-}" != 1 ]] ;;
  *' pg_restore '*) [[ "\${EPMO_TEST_RESTORE_FAIL:-}" != 1 ]] ;;
  *' psql '*)
    if [[ " $* " == *' -d pmo '* ]]; then
      printf '%s\n' "\${EPMO_TEST_SOURCE_STATE:-111}"
    elif [[ " $* " == *' -d epmo_restore_'* ]]; then
      printf '%s\n' "\${EPMO_TEST_RESTORED_STATE:-111}"
    else
      exit 40
    fi ;;
  *' dropdb '*) [[ "\${EPMO_TEST_DROP_FAIL:-}" != 1 ]] ;;
  *) exit 39 ;;
esac
`);
    chmodSync(docker,0o755);
    const execute=(args=['staging',archive],env={})=>spawnSync('bash',[script,...args],{
      cwd:project,encoding:'utf8',timeout:8000,
      env:{...process.env,PATH:`${dir}:${process.env.PATH}`,
        EPMO_TEST_DOCKER_LOG:join(dir,'docker.log'),...env}
    });
    return run({dir,project,archive,execute,dockerLog:()=>readFileSync(join(dir,'docker.log'),'utf8')});
  }finally{rmSync(dir,{recursive:true,force:true});}
}
test('restore rehearsal shell syntax is valid',()=>{
  assert.equal(spawnSync('bash',['-n',script]).status,0);
});
test('staging-only rehearsal restores and drops an isolated random database',()=>fixture(({execute,dockerLog})=>{
  const result=execute();
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/PASS: verified isolated PostgreSQL restore/);
  const log=dockerLog();
  assert.match(log,/createdb -U postgres -- epmo_restore_[0-9a-f]{16}/);
  assert.match(log,/pg_restore --exit-on-error --single-transaction --no-owner --no-acl/);
  assert.match(log,/psql -X -tA -v ON_ERROR_STOP=1 -U postgres -d epmo_restore_/);
  assert.match(log,/dropdb --if-exists -U postgres -- epmo_restore_/);
  assert.doesNotMatch(log,/createdb .* -- pmo(?: |$)/);
}));
test('production mode is rejected without invoking Docker',()=>fixture(({execute,dir})=>{
  const result=execute(['prod',join(dir,'backups',filename)]);
  assert.equal(result.status,2);
  assert.match(result.stderr,/staging-only/);
}));
test('requires explicitly marked staging environment',()=>fixture(({execute,project})=>{
  writeFileSync(join(project,'.env.staging'),'DEPLOYMENT_ENV=production\nPG_USER=postgres\nPG_DB=pmo\n');
  const result=execute();
  assert.equal(result.status,2);
  assert.match(result.stderr,/DEPLOYMENT_ENV must explicitly be staging/);
}));
test('rejects tampered backup before any database commands',()=>fixture(({execute,archive,dir})=>{
  writeFileSync(archive,'tampered data');
  const result=execute();
  assert.equal(result.status,1);
  assert.match(result.stderr,/checksum verification failed/);
  assert.equal(readdirSync(dir).includes('docker.log'),false);
}));
test('rejects an archive outside the expected staging backup naming scheme',()=>fixture(({execute,archive,dir})=>{
  const other=join(dir,'backups','customer-live.dump');
  writeFileSync(other,'fake');
  const result=execute(['staging',other]);
  assert.equal(result.status,2);
  assert.equal(readdirSync(dir).includes('docker.log'),false);
}));
test('failed restore always removes newly created temporary database',()=>fixture(({execute,dockerLog})=>{
  const result=execute(undefined,{EPMO_TEST_RESTORE_FAIL:'1'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/restoring backup into isolated staging database failed/);
  assert.match(dockerLog(),/dropdb --if-exists/);
}));
test('missing restored tables fails and removes temporary database',()=>fixture(({execute,dockerLog})=>{
  const result=execute(undefined,{EPMO_TEST_RESTORED_STATE:'110'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/restored schema state does not match/);
  assert.match(dockerLog(),/dropdb --if-exists/);
}));
test('failed database creation must not drop preexisting database',()=>fixture(({execute,dockerLog})=>{
  const result=execute(undefined,{EPMO_TEST_CREATE_FAIL:'1'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/could not create isolated/);
  assert.doesNotMatch(dockerLog(),/dropdb /);
}));
test('failed cleanup blocks approval and identifies temporary database for cleanup',()=>fixture(({execute})=>{
  const result=execute(undefined,{EPMO_TEST_DROP_FAIL:'1'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/Manual cleanup required/);
}));

test('checksum sidecar cannot reference a different backup file',()=>fixture(({execute,archive,dir})=>{
  const other=join(dir,'backups','epmo-staging-20261026T120001Z-other.dump');
  writeFileSync(other,'different valid archive');
  const hash=createHash('sha256').update('different valid archive').digest('hex');
  writeFileSync(archive+'.sha256',`${hash}  ${other.split('/').at(-1)}\n`);
  const result=execute();
  assert.equal(result.status,1);
  assert.match(result.stderr,/sidecar does not name/);
  assert.equal(readdirSync(dir).includes('docker.log'),false);
}));

test('fresh staging database restores an empty schema and allows first bootstrap',()=>fixture(({execute,dockerLog})=>{
  const result=execute(undefined,{EPMO_TEST_SOURCE_STATE:'000',EPMO_TEST_RESTORED_STATE:'000'});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/fresh schema/);
  assert.match(dockerLog(),/createdb/);
}));
test('partially initialized source fails before creating temporary database',()=>fixture(({execute,dockerLog})=>{
  const result=execute(undefined,{EPMO_TEST_SOURCE_STATE:'110'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/partially initialized/);
  assert.doesNotMatch(dockerLog(),/createdb/);
}));
test('existing source rejects an incorrectly selected empty backup',()=>fixture(({execute,dockerLog})=>{
  const result=execute(undefined,{EPMO_TEST_SOURCE_STATE:'111',EPMO_TEST_RESTORED_STATE:'000'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/does not match the source/);
  assert.match(dockerLog(),/dropdb/);
}));
test('fresh source rejects restored application tables from the wrong backup',()=>fixture(({execute,dockerLog})=>{
  const result=execute(undefined,{EPMO_TEST_SOURCE_STATE:'000',EPMO_TEST_RESTORED_STATE:'111'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/does not match the source/);
  assert.match(dockerLog(),/dropdb/);
}));
test('failure inspecting the source database blocks before creating a temporary database',()=>fixture(({execute,dockerLog})=>{
  const result=execute(undefined,{EPMO_TEST_SOURCE_STATE:'unknown'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/partially initialized/);
  assert.doesNotMatch(dockerLog(),/createdb/);
}));
