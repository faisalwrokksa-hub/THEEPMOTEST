import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { attestStagingApi, verifyApiBoundary } from './phase16d-verify-staging-api.mjs';

const id = 'b'.repeat(64);
const env = { DEPLOYMENT_ENV: 'staging' };
const dockerApi = () => ({
  Id: id,
  Config: {
    Labels: { 'com.docker.compose.project':'pmo-staging','com.docker.compose.service':'api' },
    Env: ['NODE_ENV=production','ALLOW_HEADER_AUTH=false','DEPLOYMENT_ENV=staging'],
  },
  State: { Running:true, Health:{ Status:'healthy' } },
  NetworkSettings: { Ports: { '4000/tcp':null } },
});
const response = (status, jsonData = {}) => ({ status, json:async()=>jsonData });
function rejectUnauthorized(url, options) {
  if (new URL(url).pathname==='/health') return Promise.resolve(response(200,{ok:true,service:'pmo-api'}));
  return Promise.resolve(response(401));
}

test('accepts authenticated container identity but never credentials from untrusted environment',()=>{
  assert.equal(attestStagingApi(env,dockerApi(),id),true);
});
test('rejects production target and mismatched/stale container identities',()=>{
  assert.throws(()=>attestStagingApi({DEPLOYMENT_ENV:'production'},dockerApi(),id),/staging/);
  assert.throws(()=>attestStagingApi(env,dockerApi(),'a'.repeat(64)),/identity/);
  assert.throws(()=>attestStagingApi(env,dockerApi(),'garbage'),/identity/);
});
test('rejects incorrect Docker project/service and unhealthy API',()=>{
  const wrongProject=dockerApi();wrongProject.Config.Labels['com.docker.compose.project']='pmo-prod';
  assert.throws(()=>attestStagingApi(env,wrongProject,id),/pmo-staging/);
  const wrongService=dockerApi();wrongService.Config.Labels['com.docker.compose.service']='web';
  assert.throws(()=>attestStagingApi(env,wrongService,id),/pmo-staging/);
  const unhealthy=dockerApi();unhealthy.State.Health.Status='starting';
  assert.throws(()=>attestStagingApi(env,unhealthy,id),/healthy/);
});
test('rejects development header-auth and wrong runtime deployment mode',()=>{
  for (const flag of ['NODE_ENV=production','ALLOW_HEADER_AUTH=false','DEPLOYMENT_ENV=staging']) {
    const config=dockerApi();config.Config.Env=config.Config.Env.filter(x=>x!==flag);
    assert.throws(()=>attestStagingApi(env,config,id),/requires/);
  }
});
test('refuses staging API exposed through a host-published port',()=>{
  const exposed=dockerApi();exposed.NetworkSettings.Ports['4000/tcp']=[{HostIp:'127.0.0.1',HostPort:'4000'}];
  assert.throws(()=>attestStagingApi(env,exposed,id),/must not be published/);
});
test('checks health, billing, licensing and Super Admin endpoints with no credentials',async()=>{
  const result=await verifyApiBoundary(rejectUnauthorized);
  assert.equal(result.passed,true);
  assert.equal(result.checks.length,11);
});
test('rejects a wrong or unhealthy service on the local API port',async()=>{
  await assert.rejects(verifyApiBoundary(async()=>response(200,{ok:true,service:'other-api'})),/wrong local service/);
  await assert.rejects(verifyApiBoundary(async()=>response(503)),/health returned/);
});
test('rejects a nonlocal or alternate target even if requests could succeed',async()=>{
  await assert.rejects(verifyApiBoundary(rejectUnauthorized,'https://production.example.com'),/container-local/);
});
test('fails when a protected endpoint returns HTTP 200, HTTP 403, or redirects instead of 401',async()=>{
  for(const status of [200,403,302]) {
    await assert.rejects(verifyApiBoundary((url,opts)=>new URL(url).pathname==='/api/v1/subscription/current'
      ?Promise.resolve(response(status)):rejectUnauthorized(url,opts)),/expected HTTP 401|unexpected redirect/);
  }
});
test('fails if forged tenant identity headers bypass authentication',async()=>{
  await assert.rejects(verifyApiBoundary((url,opts)=>opts.headers['x-tenant-id']
    ?Promise.resolve(response(200)):rejectUnauthorized(url,opts)),/forged tenant\/user headers/);
});
test('all requests are read-only, disallow redirects and target the fixed local API',async()=>{
  const observed=[];
  const result=await verifyApiBoundary((url,opts)=>{
    observed.push({url,opts});return rejectUnauthorized(url,opts);
  });
  assert.equal(result.checks.length,11);
  for(const {url,opts} of observed){
    assert.equal(new URL(url).origin,'http://127.0.0.1:4000');
    assert.equal(opts.method,'GET');
    assert.equal(opts.redirect,'manual');
  }
});
test('deployment verifies staging API only after web acceptance and before claiming success',()=>{
  const shell=readFileSync(resolve(import.meta.dirname,'../infra/deploy.sh'),'utf8');
  const web=shell.indexOf('node scripts/phase16c-verify-staging-web.mjs');
  const api=shell.indexOf('node scripts/phase16d-verify-staging-api.mjs');
  const success=shell.lastIndexOf('echo "PASS: $MODE web container healthy');
  assert.ok(web>=0 && api>web && success>api);
  assert.match(shell,/if \[\[ "\$MODE" == staging \]\]; then[\s\S]*?phase16d-verify-staging-api/);
  const syntax=spawnSync('bash',['-n',resolve(import.meta.dirname,'../infra/deploy.sh')],{encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr);
});
test('API smoke script passes Node syntax check',()=>{
  const result=spawnSync(process.execPath,['--check',resolve(import.meta.dirname,'phase16d-verify-staging-api.mjs')],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

test('Docker API build includes staging API verifier and env parser',()=>{
  const docker=readFileSync(resolve(import.meta.dirname,'../apps/api/Dockerfile'),'utf8');
  assert.match(docker,/COPY scripts\/phase16d-verify-staging-api\.mjs scripts\/phase16d-verify-staging-api\.mjs/);
  assert.match(docker,/COPY scripts\/rc1-release-gate\.mjs scripts\/rc1-release-gate\.mjs/);
});
