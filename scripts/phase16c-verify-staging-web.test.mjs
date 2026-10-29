import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateStagingTarget, verifyStagingWeb } from './phase16c-verify-staging-web.mjs';
const ID = 'a'.repeat(64);
const env = { DEPLOYMENT_ENV:'staging', WEB_PORT:'3210', WEB_BIND:'127.0.0.1' };
const container = () => ({
  Id: ID,
  Config: { Labels: {'com.docker.compose.project':'pmo-staging','com.docker.compose.service':'web'} },
  State: { Running:true, Health:{ Status:'healthy' } },
  NetworkSettings: { Ports: {'3000/tcp': [{HostIp:'127.0.0.1',HostPort:'3210'}]} },
});
const response=(status,html='',headers={})=>({status, headers:{get:k=>headers[k.toLowerCase()]??null}, text:async()=>html});
function fakeFetch() {
  return async (url, options) => {
    const path = new URL(url).pathname;
    if (path==='/login') {
      const ar=options.headers.cookie==='pmo_lang=ar';
      return response(200,`<html lang="${ar?'ar':'en'}" dir="${ar?'rtl':'ltr'}"><body>${ar?'تسجيل الدخول':'Sign in'}<form action="/api/session"></form></body></html>`,{'content-type':'text/html'});
    }
    return response(307,'',{location:'/login'});
  };
}
test('accepts the healthy pmo-staging web container and its local published port',()=>
  assert.equal(validateStagingTarget(env,container(),ID),'http://127.0.0.1:3210'));
test('rejects production environment before HTTP',()=>
  assert.throws(()=>validateStagingTarget({...env,DEPLOYMENT_ENV:'production'},container(),ID),/staging/));
test('rejects publicly bound staging port',()=>
  assert.throws(()=>validateStagingTarget({...env,WEB_BIND:'0.0.0.0'},container(),ID),/127.0.0.1/));
test('rejects unsafe and privileged ports',()=>{
  for (const port of ['80','0','99999','3000;curl','01234','']) {
    const config={...env,WEB_PORT:port};
    if (port==='') config.WEB_PORT='70000';
    assert.throws(()=>validateStagingTarget(config,container(),ID),/WEB_PORT|port 3000/);
  }
});
test('rejects absent or mismatched container ID',()=>{
  assert.throws(()=>validateStagingTarget(env,container(),'not-an-id'),/container ID/);
  assert.throws(()=>validateStagingTarget(env,container(),'b'.repeat(64)),/did not match/);
});
test('rejects mismatched compose project and service labels',()=>{
  const wrongProject=container();wrongProject.Config.Labels['com.docker.compose.project']='pmo-prod';
  assert.throws(()=>validateStagingTarget(env,wrongProject,ID),/pmo-staging/);
  const wrongService=container();wrongService.Config.Labels['com.docker.compose.service']='api';
  assert.throws(()=>validateStagingTarget(env,wrongService,ID),/pmo-staging/);
});
test('rejects stopped or unhealthy containers',()=>{
  const stopped=container();stopped.State.Running=false;
  assert.throws(()=>validateStagingTarget(env,stopped,ID),/running and healthy/);
  const unhealthy=container();unhealthy.State.Health.Status='unhealthy';
  assert.throws(()=>validateStagingTarget(env,unhealthy,ID),/running and healthy/);
});
test('rejects exposed, mismatched, or duplicated container-port mappings',()=>{
  for (const ports of [null,[{HostIp:'0.0.0.0',HostPort:'3210'}],[{HostIp:'127.0.0.1',HostPort:'9999'}],[{HostIp:'127.0.0.1',HostPort:'3210'},{HostIp:'::1',HostPort:'3210'}]]) {
    const other=container();other.NetworkSettings.Ports['3000/tcp']=ports;
    assert.throws(()=>validateStagingTarget(env,other,ID),/map exactly/);
  }
});
test('runs bilingual and anonymous-access tests against verified port',async()=>{
  const result=await verifyStagingWeb(env,container(),ID,fakeFetch());
  assert.equal(result.passed,true);
  assert.equal(result.checks.length,6);
  assert.equal(result.localOrigin,'http://127.0.0.1:3210');
});
test('fails when protected route serves private content',async()=>{
  const fetcher=fakeFetch();
  await assert.rejects(verifyStagingWeb(env,container(),ID,(url,opts)=>new URL(url).pathname==='/billing'?Promise.resolve(response(200,'private content')):fetcher(url,opts)),/did not redirect/);
});
test('staging deploy performs smoke acceptance after the health check',()=>{
  const content=readFileSync(resolve(import.meta.dirname,'../infra/deploy.sh'),'utf8');
  const smoke=content.indexOf('node scripts/phase16c-verify-staging-web.mjs');
  const health=content.indexOf('web did not become healthy');
  const success=content.indexOf('echo "PASS: $MODE web container healthy');
  assert.ok(health>=0 && smoke>health && success>smoke);
  assert.match(content,/if \[\[ "\$MODE" == staging \]\]; then\s+ssh_remote.*phase16c-verify-staging-web/s);
});
test('simulated staging deploy aborts if the post-deploy smoke fails',()=>{
  const folder=mkdtempSync(join(tmpdir(),'epmo-phase16c-deploy-'));
  try {
    const log=join(folder,'calls.txt');
    for(const app of ['ssh','rsync']) {
      const dest=join(folder,app);
      writeFileSync(dest,`#!/bin/bash\nprintf '%s: %s\\n' '${app}' "$*" >> "$EPMO_DEPLOY_TRACE"\ncase "$*" in\n  *"infra/backup-db.sh 'staging'"*) printf '%s\\n' 'PASS: verified pre-migration PostgreSQL backup: /opt/backup/epmo-staging-20261026T120000Z-abc123.dump' ;;\n  *"phase16c-verify-staging-web.mjs"*) exit 9 ;;\nesac\nexit 0\n`);
      chmodSync(dest,0o755);
    }
    const result=spawnSync('bash',[resolve(import.meta.dirname,'../infra/deploy.sh'),'staging'],{
      cwd:resolve(import.meta.dirname,'..'), encoding:'utf8',timeout:10000,
      env:{...process.env,EPMO_DEPLOY_HOST:'deploy@stage.test',EPMO_DEPLOY_TRACE:log,PATH:`${folder}:${process.env.PATH}`}
    });
    assert.equal(result.status,9,result.stderr||result.stdout);
    assert.doesNotMatch(result.stdout,/PASS: staging web container healthy/);
    assert.match(readFileSync(log,'utf8'),/phase16c-verify-staging-web\.mjs/);
  }finally{rmSync(folder,{recursive:true,force:true});}
});
test('the acceptance tool has valid Node syntax',()=>{
  const result=spawnSync(process.execPath,['--check',resolve(import.meta.dirname,'phase16c-verify-staging-web.mjs')],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
