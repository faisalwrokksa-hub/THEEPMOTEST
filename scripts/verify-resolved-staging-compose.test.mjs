import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectResolvedStagingCompose } from '../infra/staging/verify-resolved-compose.mjs';

const sha = 'a'.repeat(40);
const fixture = () => ({
  name: 'pmo-staging',
  networks: { 'staging-data': { internal: true, name: 'pmo-staging_staging-data' },
    'staging-app': { name: 'pmo-staging_staging-app' } },
  volumes: { pgdata: { name: 'pmo-staging_pgdata' } },
  services: {
    postgres: { networks: { 'staging-data': null }, volumes: [
      { type: 'volume', source: 'pgdata', target: '/var/lib/postgresql/data' }] },
    redis: { networks: { 'staging-data': null } },
    api: { networks: { 'staging-data': null, 'staging-app': null },
      image: 'epmo-staging-api:sha-' + sha, environment: {
        NODE_ENV: 'production', DEPLOYMENT_ENV: 'staging', ALLOW_HEADER_AUTH: 'false',
        DATABASE_URL: 'postgres://app:fixture@postgres:5432/pmo',
        REDIS_URL: 'redis://:fixture@redis:6379',
        WEB_ORIGIN: 'https://staging.theepmo.com',
        BILLING_REFERENCE_WEBHOOK_ENABLED: 'false', STRIPE_SECRET_KEY: 'sk_test_fixture' } },
    web: { networks: { 'staging-app': null }, image: 'epmo-staging-web:sha-' + sha,
      ports: [{ host_ip: '127.0.0.1', target: 3000, published: '3001' }],
      environment: { NODE_ENV: 'production', WEB_ORIGIN: 'https://staging.theepmo.com',
        NEXT_PUBLIC_API_URL: 'https://api-staging.theepmo.com' } },
    'staging-edge': { networks: { 'staging-app': null },
      ports: [{ host_ip: '127.0.0.1', target: 8443, published: '8443' }] },
  },
});
const failed = model => inspectResolvedStagingCompose(model, sha).filter(c => !c.passed).map(c => c.name);
test('safe isolated staging Compose model passes', () => assert.deepEqual(failed(fixture()), []));
test('rejects production project name and production volume reuse', () => {
  const model = fixture(); model.name = 'pmo-prod'; model.volumes.pgdata.name = 'pmo-prod_pgdata';
  assert.ok(failed(model).some(x => x.includes('project')));
  assert.ok(failed(model).some(x => x.includes('volume')));
});
test('rejects host ports on data services and non-loopback web/edge', () => {
  for (const name of ['postgres', 'redis', 'api']) {
    const model = fixture(); model.services[name].ports = [{ host_ip: '0.0.0.0', target: 5432, published: '5432' }];
    assert.ok(failed(model).some(x => x.includes('published ports')));
  }
  for (const name of ['web', 'staging-edge']) {
    const model = fixture(); model.services[name].ports[0].host_ip = '0.0.0.0';
    assert.ok(failed(model).some(x => x.includes('loopback')));
  }
});
test('rejects private network removal, external networks and privileged overrides', () => {
  const model = fixture(); model.networks['staging-data'].internal = false;
  model.services.web.networks['staging-data'] = null;
  model.services.api.privileged = true;
  assert.ok(failed(model).some(x => x.includes('internal')));
  assert.ok(failed(model).some(x => x.includes('assigned')));
  assert.ok(failed(model).some(x => x.includes('privileged')));
});
test('rejects cross-environment URLs, wrong candidate images and live Stripe', () => {
  const model = fixture(); model.services.api.environment.DATABASE_URL = 'postgres://app:pw@production-db:5432/pmo';
  model.services.api.environment.REDIS_URL = 'redis://:pw@redis-prod:6379';
  model.services.api.environment.STRIPE_SECRET_KEY = 'sk_live_fake';
  model.services.web.image = 'epmo-staging-web:latest';
  assert.ok(failed(model).some(x => x.includes('runtime and database')));
  assert.ok(failed(model).some(x => x.includes('Stripe')));
  assert.ok(failed(model).some(x => x.includes('images')));
});
test('rejects wrong candidate SHA and invalid resolved JSON without leaking secret values', () => {
  const model = fixture();
  assert.ok(inspectResolvedStagingCompose(model, 'b'.repeat(40)).some(c => !c.passed));
  const script = fileURLToPath(new URL('../infra/staging/verify-resolved-compose.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '--candidate-sha', sha], {
    input: '{"DATABASE_URL":"postgres://secret-sentinel@prod"', encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout + result.stderr, /secret-sentinel/);
});

test('rejects unapproved sidecars and named volumes in resolved staging', () => {
  const sidecar = fixture();
  sidecar.services.debug = { image: 'alpine:latest', volumes: [
    { type: 'bind', source: '/var/run/docker.sock', target: '/var/run/docker.sock' }] };
  assert.ok(failed(sidecar).some(x => x.includes('approved staging services')));
  const volume = fixture();
  volume.volumes.production = { name: 'pmo-prod_pgdata', external: true };
  assert.ok(failed(volume).some(x => x.includes('named volumes')));
});

test('rejects arbitrary bind mounts on API, web, PostgreSQL and Redis', () => {
  for (const name of ['api', 'web', 'postgres', 'redis']) {
    const model = fixture();
    model.services[name].volumes = [
      ...(model.services[name].volumes || []),
      { type: 'bind', source: '/var/run/docker.sock', target: '/var/run/docker.sock', read_only: true },
    ];
    assert.ok(failed(model).some(x => x.includes('unapproved bind mounts')), name);
  }
});

test('allows only read-only staging TLS edge configuration and certificate bind targets', () => {
  const good = fixture();
  good.services['staging-edge'].volumes = [
    { type: 'bind', source: '/staging/cert.pem', target: '/run/epmo-tls/tls.crt', read_only: true },
    { type: 'bind', source: '/staging/key.pem', target: '/run/epmo-tls/tls.key', read_only: true },
    { type: 'bind', source: '/staging/nginx.conf', target: '/etc/nginx/conf.d/default.conf', read_only: true },
  ];
  assert.deepEqual(failed(good), []);
  for (const mount of [
    { type: 'bind', source: '/var/run/docker.sock', target: '/var/run/docker.sock', read_only: true },
    { type: 'bind', source: '/staging/key.pem', target: '/run/epmo-tls/tls.key', read_only: false },
  ]) {
    const model = fixture();
    model.services['staging-edge'].volumes = [mount];
    assert.ok(failed(model).some(x => x.includes('unapproved bind mounts')));
  }
});

test('rejects device passthrough and volumes_from overrides', () => {
  for (const field of ['devices', 'volumes_from', 'device_cgroup_rules']) {
    const model = fixture();
    model.services.api[field] = ['/dev/sda'];
    assert.ok(failed(model).some(x => x.includes('host device passthrough')), field);
  }
});
