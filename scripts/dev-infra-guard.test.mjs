import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./dev-infra-guard.sh', import.meta.url));
const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) =>
  !['DEPLOYMENT_ENV','NODE_ENV','EPMO_DEPLOYMENT_PROFILE','EPMO_DEPLOYMENT_ID','EPMO_DEPLOYMENT_REGION',
     'EPMO_DEPLOYMENT_API_ORIGIN','COMPOSE_FILE','COMPOSE_PROJECT_NAME','DOCKER_TLS_VERIFY',
     'DOCKER_CERT_PATH','DOCKER_HOST','DOCKER_CONTEXT'].includes(k)));
const dir = mkdtempSync(join(tmpdir(), 'epmo-s23-'));
const marker = join(dir, 'called');
const docker = join(dir, 'docker');
writeFileSync(docker, `#!/bin/sh
if [ "$1" = context ] && [ "$2" = show ]; then echo "${S23_CONTEXT:-default}"; exit 0; fi
if [ "$1" = context ] && [ "$2" = inspect ]; then echo "${S23_ENDPOINT:-unix:///var/run/docker.sock}"; exit 0; fi
printf "%s\\n" "$*" >> "$S23_DOCKER_MARKER"
`);
chmodSync(docker, 0o700);
const invoke = (op='up', overrides={}) => {
  rmSync(marker, {force:true});
  const result = spawnSync('bash', [script, op], {encoding:'utf8', env:{...clean, PATH:`${dir}:${process.env.PATH}`, S23_DOCKER_MARKER:marker, ...overrides}});
  return {result, invoked: (()=>{try{return readFileSync(marker,'utf8')}catch{return ''}})()};
};
test('S23 allows local up/down using fixed project and compose path', () => {
  for (const op of ['up','down']) {
    const {result,invoked}=invoke(op,{DEPLOYMENT_ENV:'development'});
    assert.equal(result.status,0,result.stderr);
    assert.match(invoked,/^compose --project-name pmo-dev --file .*\/docker-compose\.yml (up -d|down)\n$/);
  }
});
test('S23 blocks production and staging contexts before Docker', () => {
  for (const overrides of [{DEPLOYMENT_ENV:'staging'},{DEPLOYMENT_ENV:'production'},
    {NODE_ENV:'production'},{EPMO_DEPLOYMENT_PROFILE:'shared'},
    {EPMO_DEPLOYMENT_ID:'test'},{EPMO_DEPLOYMENT_REGION:'sa'},
    {EPMO_DEPLOYMENT_API_ORIGIN:'https://api-staging.theepmo.com'}]) {
    const {result,invoked}=invoke('up',overrides);
    assert.equal(result.status,2,JSON.stringify(overrides));
    assert.equal(invoked,'');
  }
});
test('S23 blocks Docker and Compose environment redirection', () => {
  for (const overrides of [{DOCKER_HOST:'tcp://remote:2375'},{DOCKER_CONTEXT:'remote'},
    {DOCKER_TLS_VERIFY:'1'},{DOCKER_CERT_PATH:'/tmp/cert'},
    {COMPOSE_FILE:'other.yml'},{COMPOSE_PROJECT_NAME:'production'}]) {
    const {result,invoked}=invoke('up',overrides);
    assert.equal(result.status,2,JSON.stringify(overrides));
    assert.equal(invoked,'');
  }
});
test('S23 rejects active remote Docker contexts and endpoints',()=>{
  for (const overrides of [{S23_CONTEXT:'remote'},{S23_ENDPOINT:'tcp://remote:2376'}]) {
    const {result,invoked}=invoke('up',overrides);
    assert.equal(result.status,2,JSON.stringify(overrides));
    assert.equal(invoked,'');
  }
});
test('S23 rejects arbitrary Docker commands',()=>{
  for (const op of ['run','--help','']) {
    const {result,invoked}=invoke(op);
    assert.equal(result.status,2);
    assert.equal(invoked,'');
  }
});
test('S23 development compose does not fix globally shared container names',()=>{
  const compose=readFileSync(fileURLToPath(new URL('../docker-compose.yml', import.meta.url)),'utf8');
  assert.doesNotMatch(compose,/^\s*container_name\s*:/m);
  assert.match(compose,/^name:\s*pmo-dev\s*$/m);
  assert.match(compose,/127\.0\.0\.1:5433:5432/);
  assert.match(compose,/127\.0\.0\.1:6380:6379/);
});
process.on('exit',()=>rmSync(dir,{recursive:true,force:true}));
