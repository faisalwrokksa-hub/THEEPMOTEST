import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stagingEdgeChecks, tlsMaterialChecks } from '../infra/staging/preflight.mjs';
import { checkStagingHealth } from '../infra/staging/health-probe.mjs';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const shaA = 'a'.repeat(40);
const shaB = 'b'.repeat(40);
const env = {
  DEPLOYMENT_ENV: 'staging', NODE_ENV: 'production',
  WEB_ORIGIN: 'https://staging.theepmo.com',
  PUBLIC_API_URL: 'https://api-staging.theepmo.com',
  WEB_BIND: '127.0.0.1', WEB_PORT: '3001',
  STAGING_EDGE_BIND: '127.0.0.1', STAGING_EDGE_HTTPS_PORT: '8443',
  STAGING_TLS_CERT_PATH: '/etc/epmo/tls.crt',
  STAGING_TLS_KEY_PATH: '/etc/epmo/tls.key',
  STRIPE_SECRET_KEY: 'sk_test_fixture_only',
};
const failed = e => stagingEdgeChecks(e).filter(c => !c.passed).map(c => c.name);

test('staging edge config allows only isolated HTTPS hostnames and loopback ports', () => {
  assert.deepEqual(failed(env), []);
  assert.ok(failed({ ...env, DEPLOYMENT_ENV: 'production' }).length >= 2);
  assert.ok(failed({ ...env, WEB_ORIGIN: 'https://theepmo.com' }).length > 0);
  assert.ok(failed({ ...env, PUBLIC_API_URL: 'http://api-staging.theepmo.com' }).length > 0);
  assert.ok(failed({ ...env, STAGING_EDGE_BIND: '0.0.0.0' }).length > 0);
  assert.ok(failed({ ...env, STAGING_EDGE_HTTPS_PORT: '3001' }).length > 0);
  assert.ok(failed({ ...env, STAGING_TLS_KEY_PATH: env.STAGING_TLS_CERT_PATH }).length > 0);
  assert.ok(failed({ ...env, STRIPE_SECRET_KEY: 'sk_live_never' }).length > 0);
});

test('missing staging certificate and key fail closed without revealing paths', () => {
  const checks = tlsMaterialChecks(env);
  assert.equal(checks.length, 4);
  assert.ok(checks.every(c => !c.passed));
  assert.ok(checks.every(c => !c.name.includes('/etc/epmo')));
});

test('staging edge publishes only the TLS proxy, never the API container', () => {
  const manifest = read('infra/staging/edge.compose.yml');
  const nginx = read('infra/staging/nginx.conf');
  assert.match(manifest, /staging-edge:/);
  assert.match(manifest, /STAGING_EDGE_BIND:-127\.0\.0\.1/);
  assert.match(manifest, /STAGING_EDGE_HTTPS_PORT:-8443/);
  assert.doesNotMatch(manifest, /\n  api:\s*\n\s*ports:/);
  assert.match(manifest, /STAGING_TLS_CERT_PATH/);
  assert.match(manifest, /STAGING_TLS_KEY_PATH/);
  assert.match(nginx, /server_name staging\.theepmo\.com;/);
  assert.match(nginx, /server_name api-staging\.theepmo\.com;/);
  assert.match(nginx, /return 421;/);
  assert.match(nginx, /resolver 127\.0\.0\.11/);
  assert.match(nginx, /proxy_pass http:\/\/\$epmo_api_upstream;/);
  assert.match(nginx, /proxy_set_header X-Forwarded-For \$remote_addr;/);
});

test('health probe is read-only and requires API identity, login HTML and anonymous denial', async () => {
  const calls = [];
  const fake = async (url, opts) => {
    calls.push({ url, opts });
    if (url.endsWith('/health'))
      return { status: 200, redirected: false, json: async () => ({ ok: true, service: 'pmo-api' }) };
    if (url.endsWith('/login'))
      return { status: 200, redirected: false, headers: { get: () => 'text/html; charset=utf-8' } };
    return { status: 401, redirected: false };
  };
  const result = await checkStagingHealth(fake);
  assert.equal(result.passed, true);
  assert.equal(result.checks.length, 3);
  assert.ok(calls.every(c => c.opts.method === 'GET' && c.opts.redirect === 'manual'));
  assert.ok(calls.every(c => c.url.startsWith('https://') && c.opts.headers?.authorization === undefined));
});

test('health probe fails on wrong API identity or redirect', async () => {
  const wrong = await checkStagingHealth(async url => url.endsWith('/health')
    ? { status: 200, redirected: false, json: async () => ({ ok: true, service: 'other' }) }
    : { status: 302, redirected: true });
  assert.equal(wrong.passed, false);
  assert.ok(wrong.checks.some(c => !c.passed));
});

function run(script, args, overrides = {}) {
  return spawnSync('bash', [resolve(root, script), ...args], {
    cwd: root, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, EPMO_EXPECTED_CURRENT_SHA: shaA,
      EPMO_ROLLBACK_SHA: shaB, EPMO_BUILD_SHA: shaA,
      EPMO_STAGING_ROLLBACK_CONFIRM: '', EPMO_STAGING_IMAGE_BUILD_CONFIRM: '', ...overrides },
  });
}

test('staging recovery and build scripts parse and default to non-mutating plans', () => {
  for (const script of ['infra/staging/rollback-app.sh',
    'infra/staging/verify-backup.sh', 'infra/staging/build-images.sh']) {
    const syntax = spawnSync('bash', ['-n', resolve(root, script)], { encoding: 'utf8' });
    assert.equal(syntax.status, 0, syntax.stderr);
  }
  const rollback = run('infra/staging/rollback-app.sh', ['--plan']);
  assert.equal(rollback.status, 0, rollback.stderr);
  assert.match(rollback.stdout, /PLAN ONLY/);
  assert.match(rollback.stdout, /No database restore/);
  const build = run('infra/staging/build-images.sh', ['--plan']);
  assert.equal(build.status, 0, build.stderr);
  assert.match(build.stdout, /PLAN ONLY/);
});

test('staging rollback and image build deny execution without action-specific confirmation', () => {
  const rollback = run('infra/staging/rollback-app.sh', ['--execute']);
  assert.equal(rollback.status, 2, rollback.stderr);
  assert.match(rollback.stderr, /confirmation/);
  const build = run('infra/staging/build-images.sh', ['--build']);
  assert.equal(build.status, 2, build.stderr);
  assert.match(build.stderr, /confirmation/);
  const bad = run('infra/staging/rollback-app.sh', ['--plan'], { EPMO_ROLLBACK_SHA: 'not-a-sha' });
  assert.equal(bad.status, 2);
  const archive = run('infra/staging/verify-backup.sh', ['staging', '/tmp/production.dump']);
  assert.equal(archive.status, 2);
});

const dockerCompose = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8', timeout: 5000 });
test('staging compose overrides parse and preserve private API and loopback edge', {
  skip: dockerCompose.status !== 0,
}, () => {
  const result = spawnSync('docker', [
    'compose', '-f', 'docker-compose.prod.yml',
    '-f', 'infra/staging/images.compose.yml',
    '-f', 'infra/staging/edge.compose.yml',
    '-p', 'pmo-staging', 'config', '--format', 'json',
  ], {
    cwd: root, encoding: 'utf8', timeout: 15000,
    env: {
      ...process.env, PG_USER: 'ci_admin', PG_PASSWORD: 'ci_placeholder_only',
      PG_DB: 'pmo', REDIS_PASSWORD: 'ci_placeholder_only',
      DATABASE_URL: 'postgres://pmo_app:ci_placeholder_only@postgres:5432/pmo',
      REDIS_URL: 'redis://:ci_placeholder_only@redis:6379',
      WEB_ORIGIN: 'https://staging.theepmo.com',
      PUBLIC_API_URL: 'https://api-staging.theepmo.com',
      WEB_BIND: '127.0.0.1', WEB_PORT: '3001',
      STAGING_EDGE_BIND: '127.0.0.1', STAGING_EDGE_HTTPS_PORT: '8443',
      STAGING_TLS_CERT_PATH: '/tmp/epmo-ci-staging.crt',
      STAGING_TLS_KEY_PATH: '/tmp/epmo-ci-staging.key',
      EPMO_DEPLOY_SHA: shaA,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.services.api.ports, undefined, 'API must remain Docker-private');
  assert.equal(config.services.web.ports[0].host_ip, '127.0.0.1');
  assert.equal(config.services['staging-edge'].ports[0].host_ip, '127.0.0.1');
  assert.equal(config.services['staging-edge'].ports[0].published, '8443');
  assert.equal(config.services.api.image, 'epmo-staging-api:sha-' + shaA);
  assert.equal(config.services.web.image, 'epmo-staging-web:sha-' + shaA);
});

test('staging image build sends only immutable tracked files to Docker', () => {
  const script = read('infra/staging/build-images.sh');
  assert.match(script, /git archive --format=tar/);
  assert.match(script, /tracked secret-like file in immutable build context/);
  assert.match(script, /docker build --file "\$context\/apps\/api\/Dockerfile"/);
  assert.match(script, /docker build --file "\$context\/apps\/web\/Dockerfile"/);
  assert.doesNotMatch(script, /--tag "\$api_image" \./);
});
