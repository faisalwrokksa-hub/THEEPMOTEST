import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const script = resolve(root, 'infra/sync-catalogue.sh');
const source = readFileSync(script, 'utf8');
const run = (mode, env = {}) => spawnSync('bash', [script, mode], {
  cwd: root, encoding: 'utf8', timeout: 10000,
  env: {...process.env, EPMO_DEPLOY_HOST: '', EPMO_DEPLOY_SSH_KEY: '', ...env},
});

test('module sync bash syntax is valid', () => {
  const result = spawnSync('bash', ['-n', script], {encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
test('module sync refuses to infer a server', () => {
  const result = run('prod');
  assert.equal(result.status,2);
  assert.match(result.stderr,/EPMO_DEPLOY_HOST/);
});
test('module sync refuses remote-command injection', () => {
  assert.equal(run('staging',{EPMO_DEPLOY_HOST:'u@h;rm -rf /'}).status,2);
  assert.equal(run('staging',{EPMO_DEPLOY_HOST:'u@h',EPMO_DEPLOY_DIR:'/opt/../etc'}).status,2);
});
test('module sync refuses missing SSH key', () => {
  const result=run('staging',{EPMO_DEPLOY_HOST:'deploy@stage.test',EPMO_DEPLOY_SSH_KEY:'/missing/key'});
  assert.equal(result.status,2);
});
test('module sync has no legacy host or embedded private key', () => {
  assert.doesNotMatch(source,/3\.111\.66\.127|mumbai\.pem|StrictHostKeyChecking=no/);
  assert.match(source,/StrictHostKeyChecking=yes/);
});
test('staging module sync uses approved host and isolated project', () => {
  const dir=mkdtempSync(join(tmpdir(),'epmo-module-sync-'));
  try {
    const trace=join(dir,'trace');
    const pnpm=join(dir,'pnpm');
    const ssh=join(dir,'ssh');
    writeFileSync(pnpm,'#!/bin/sh\nprintf "SELECT 1;\\n"\n');
    writeFileSync(ssh,'#!/bin/sh\nprintf "%s\\n" "$*" >> "$SYNC_TRACE"\ncat >/dev/null\n');
    chmodSync(pnpm,0o755);chmodSync(ssh,0o755);
    const result=run('staging',{EPMO_DEPLOY_HOST:'deploy@staging.theepmo.com',SYNC_TRACE:trace,PATH:`${dir}:${process.env.PATH}`});
    assert.equal(result.status,0,result.stderr);
    const calls=readFileSync(trace,'utf8');
    assert.match(calls,/StrictHostKeyChecking=yes/);
    assert.match(calls,/pmo-staging/);
    assert.match(calls,/\.env\.staging/);
    assert.match(calls,/deploy@staging\.theepmo\.com/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
