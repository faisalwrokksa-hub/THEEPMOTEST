import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, chmodSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const workflow = read('.github/workflows/ci.yml');
const probe = read('scripts/verify-ci-docker-images.sh');

function withMockDocker(failCase) {
  const dir = mkdtempSync(join(tmpdir(), 'epmo-docker-probe-'));
  try {
    const file = join(dir, 'docker');
    writeFileSync(file, `#!/usr/bin/env node\nconst a=process.argv.slice(2);\nconst bad=process.env.MOCK_DOCKER_FAILURE;\nif(a[0]==='image' && a[1]==='inspect') {\n  const fmt=a[3];\n  const image=a[4];\n  if(!['epmo-api:ci','epmo-web:ci'].includes(image)) process.exit(8);\n  if(fmt.includes('.Config.User')) console.log(bad==='user'?'root':'pmo');\n  else if(fmt.includes('Healthcheck')) console.log(bad==='health'?'null':'["CMD-SHELL","exit 0"]');\n  else if(fmt.includes('ExposedPorts')) console.log(bad==='port'?'{}':image==='epmo-api:ci'?'{"4000/tcp":{}}':'{"3000/tcp":{}}');\n  else process.exit(9);\n} else if(a[0]==='run') {\n  if(!a.includes('--network') || !a.includes('none') || !a.includes('--read-only') || !a.includes('--entrypoint') || !a.includes('sh')) process.exit(7);\n  if (bad==='run') process.exit(4);\n  if (!a.includes('/app/apps/api/dist/main.js') && !a.includes('/app/apps/web/server.js')) process.exit(5);\n} else process.exit(6);\n`);
    chmodSync(file, 0o755);
    return spawnSync('bash', ['scripts/verify-ci-docker-images.sh'], {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, MOCK_DOCKER_FAILURE: failCase ?? '' },
      encoding: 'utf8', timeout: 15_000,
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('CI builds both actual Dockerfiles before recording production evidence', () => {
  const api = workflow.indexOf('docker build --file apps/api/Dockerfile --tag epmo-api:ci .');
  const web = workflow.indexOf('docker build --file apps/web/Dockerfile --tag epmo-web:ci .');
  const verify = workflow.indexOf('bash scripts/verify-ci-docker-images.sh');
  const receipt = workflow.indexOf('record production_build');
  assert.ok(api > 0 && web > api && verify > web && receipt > verify);
});
test('CI Docker steps do not publish images or require credentials', () => {
  assert.doesNotMatch(workflow, /docker (?:push|login)/);
  assert.doesNotMatch(probe, /docker (?:push|login)/);
  assert.match(probe, /--network none --read-only/);
});
test('both runtime Dockerfiles use a non-root account and health checks', () => {
  for (const name of ['apps/api/Dockerfile', 'apps/web/Dockerfile']) {
    const dockerfile = read(name);
    assert.match(dockerfile, /USER pmo/);
    assert.match(dockerfile, /HEALTHCHECK/);
  }
});
test('image probe succeeds for two well-formed disposable images', () => {
  const result = withMockDocker();
  assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
  assert.match(result.stdout, /PASS epmo-api:ci/);
  assert.match(result.stdout, /PASS epmo-web:ci/);
});
for (const kind of ['user', 'health', 'port', 'run']) {
  test(`image probe rejects invalid ${kind}`, () => {
    const result = withMockDocker(kind);
    assert.notEqual(result.status, 0, `probe unexpectedly accepted ${kind}`);
  });
}
