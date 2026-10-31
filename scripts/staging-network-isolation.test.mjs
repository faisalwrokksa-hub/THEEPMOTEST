import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectResolvedStagingCompose } from '../infra/staging/verify-resolved-compose.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = readFileSync(new URL('../infra/staging/edge.compose.yml', import.meta.url), 'utf8');
function declaredNetworks(name) {
  const re = new RegExp('^  ' + name + ':\\n    networks: \\[([^\\]]+)\\]', 'm');
  const found = source.match(re);
  assert.ok(found, 'missing explicit networks for ' + name);
  return found[1].split(',').map(x => x.trim()).sort();
}
test('S29: web and TLS edge cannot reach private PostgreSQL or Redis network', () => {
  assert.deepEqual(declaredNetworks('postgres'), ['staging-data']);
  assert.deepEqual(declaredNetworks('redis'), ['staging-data']);
  assert.deepEqual(declaredNetworks('api'), ['staging-app', 'staging-data']);
  assert.deepEqual(declaredNetworks('web'), ['staging-app']);
  assert.deepEqual(declaredNetworks('staging-edge'), ['staging-app']);
  assert.match(source, /^  staging-data:\n    internal: true$/m);
  assert.match(source, /^  staging-app: \{\}$/m);
  assert.doesNotMatch(source, /^\s+network_mode:/m);
});
const docker = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8', timeout: 5000 });
test('S29: resolved Compose isolates private services without published data ports', {
  skip: docker.status !== 0,
}, () => {
  const env = {
    ...process.env, PG_USER: 'ci_admin', PG_PASSWORD: 'ci_placeholder_only',
    PG_DB: 'pmo', REDIS_PASSWORD: 'ci_placeholder_only',
    DATABASE_URL: 'postgres://pmo_app:ci_placeholder_only@postgres:5432/pmo',
    REDIS_URL: 'redis://:ci_placeholder_only@redis:6379',
    WEB_ORIGIN: 'https://staging.theepmo.com',
    PUBLIC_API_URL: 'https://api-staging.theepmo.com',
    WEB_BIND: '127.0.0.1', WEB_PORT: '3001',
    STAGING_EDGE_BIND: '127.0.0.1', STAGING_EDGE_HTTPS_PORT: '8443',
    STAGING_TLS_CERT_PATH: '/tmp/epmo-ci-staging.crt',
    STAGING_TLS_KEY_PATH: '/tmp/epmo-ci-staging.key', EPMO_DEPLOY_SHA: 'a'.repeat(40),
  };
  const r = spawnSync('docker', ['compose', '-f', 'docker-compose.prod.yml',
    '-f', 'infra/staging/images.compose.yml', '-f', 'infra/staging/edge.compose.yml',
    '-p', 'pmo-staging', 'config', '--format', 'json'],
    { cwd: root, encoding: 'utf8', timeout: 15000, env });
  assert.equal(r.status, 0, r.stderr);
  const config = JSON.parse(r.stdout);
  const nets = name => Object.keys(config.services[name].networks || {}).sort();
  assert.deepEqual(nets('postgres'), ['staging-data']);
  assert.deepEqual(nets('redis'), ['staging-data']);
  assert.deepEqual(nets('api'), ['staging-app', 'staging-data']);
  assert.deepEqual(nets('web'), ['staging-app']);
  assert.deepEqual(nets('staging-edge'), ['staging-app']);
  assert.equal(config.networks['staging-data'].internal, true);
  for (const name of ['api', 'postgres', 'redis'])
    assert.equal(config.services[name].ports, undefined, name + ' must not publish ports');
  assert.equal(config.services['staging-edge'].ports[0].host_ip, '127.0.0.1');
  // Check the actual resolved Compose model, not just hand-authored fixture JSON.
  const safety = inspectResolvedStagingCompose(config, 'a'.repeat(40));
  assert.deepEqual(safety.filter(check => !check.passed).map(check => check.name), []);
});
