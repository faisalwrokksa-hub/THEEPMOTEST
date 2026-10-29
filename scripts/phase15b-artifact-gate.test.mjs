import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkBuildArtifacts } from './verify-build-artifacts.mjs';
const root = new URL('../', import.meta.url);
const ci = readFileSync(new URL('.github/workflows/ci.yml', root), 'utf8');
const cli = new URL('verify-build-artifacts.mjs', import.meta.url).pathname;
const fakeFiles = [
  'packages/contracts/dist/index.js', 'packages/contracts/dist/index.d.ts',
  'packages/db/dist/index.js', 'packages/db/dist/index.d.ts',
  'apps/api/dist/main.js', 'apps/web/.next-prod/BUILD_ID',
  'apps/web/.next-prod/standalone/apps/web/server.js',
  'apps/web/.next-prod/static/chunks/runtime.js',
];
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'epmo-artifact-'));
  for (const file of fakeFiles) {
    const dest = join(dir, file);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, 'artifact contents\n');
  }
  return dir;
}

test('fresh production output passes all eight checks', t => {
  const dir = fixture();t.after(() => rmSync(dir, { recursive: true, force: true }));
  const result = checkBuildArtifacts(dir, 'all');
  assert.equal(result.passed, true);
  assert.equal(result.checks.length, 8);
});
test('package-only and API scopes require only their own dependencies', t => {
  const dir = fixture();t.after(() => rmSync(dir, { recursive: true, force: true }));
  rmSync(join(dir, 'apps/web/.next-prod'), { recursive: true });
  assert.equal(checkBuildArtifacts(dir, 'packages').passed, true);
  assert.equal(checkBuildArtifacts(dir, 'api').passed, true);
  assert.equal(checkBuildArtifacts(dir, 'all').passed, false);
});
test('wrong Next output directory must not satisfy production check', t => {
  const dir = fixture();t.after(() => rmSync(dir, { recursive: true, force: true }));
  const newDir = join(dir, 'apps/web/.next');
  mkdirSync(newDir, {recursive: true});
  writeFileSync(join(newDir, 'BUILD_ID'), 'dev\n');
  rmSync(join(dir, 'apps/web/.next-prod'), { recursive: true });
  assert.equal(checkBuildArtifacts(dir, 'all').passed, false);
});
test('empty or missing JavaScript bundle fails closed', t => {
  const dir = fixture();t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'apps/api/dist/main.js'), '');
  assert.equal(checkBuildArtifacts(dir, 'api').passed, false);
});
test('CLI exits nonzero and reports missing artifacts', t => {
  const dir = mkdtempSync(join(tmpdir(), 'epmo-artifact-empty-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const result = spawnSync(process.execPath, [cli, '--scope', 'all'], {
    env: {...process.env, EPMO_ARTIFACT_ROOT: dir}, encoding:'utf8'
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /BLOCKED NestJS API entrypoint/);
});
test('CLI rejects unknown scope', () => {
  const result = spawnSync(process.execPath, [cli, '--scope', 'wat'], {encoding:'utf8'});
  assert.equal(result.status, 2);
});
test('CI runs artifact checks after package and application builds', () => {
  const packages = ci.indexOf('- run: pnpm build:packages');
  const pkgCheck = ci.indexOf('node scripts/verify-build-artifacts.mjs --scope packages');
  const apiBuild = ci.indexOf('pnpm --filter @pmo/api build');
  const apiCheck = ci.indexOf('node scripts/verify-build-artifacts.mjs --scope api');
  const webBuild = ci.indexOf('run: pnpm --filter @pmo/web build');
  const fullCheck = ci.indexOf('node scripts/verify-build-artifacts.mjs --scope all');
  assert.ok(packages >= 0 && pkgCheck > packages);
  assert.ok(apiBuild >= 0 && apiCheck > apiBuild);
  assert.ok(webBuild >= 0 && fullCheck > webBuild);
});
