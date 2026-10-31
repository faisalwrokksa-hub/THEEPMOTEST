import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preflightReadiness, inspectReadiness, resolveComposeConfig, approvedEdgeMounts } from '../infra/staging/servitro-readiness.mjs';
import { tlsMaterialChecks } from '../infra/staging/preflight.mjs';

const sha = 'a'.repeat(40);
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const env = () => ({
  EPMO_SYNTHETIC_ONLY: 'YES', EPMO_DEPLOY_SHA: sha,
  DEPLOYMENT_ENV: 'staging', NODE_ENV: 'production', WEB_BIND: '127.0.0.1', WEB_PORT: '3001',
  STAGING_EDGE_BIND: '127.0.0.1', STAGING_EDGE_HTTPS_PORT: '8443',
  WEB_ORIGIN: 'https://staging.theepmo.com', PUBLIC_API_URL: 'https://api-staging.theepmo.com',
  STAGING_TLS_CERT_PATH: '/tmp/staging.crt', STAGING_TLS_KEY_PATH: '/tmp/staging.key',
  DATABASE_URL: 'postgres://pmo_app:very-long-staging-only-test-credential@postgres:5432/pmo',
  REDIS_URL: 'redis://:another-long-staging-only-test-credential@redis:6379',
  BILLING_REFERENCE_WEBHOOK_ENABLED: 'false', STRIPE_SECRET_KEY: 'sk_test_fixture',
});
const model = () => ({
  name: 'pmo-staging', networks: { 'staging-data': { internal: true }, 'staging-app': {} },
  volumes: { pgdata: { name: 'pmo-staging_pgdata' } },
  services: {
    postgres: { networks: { 'staging-data': null }, volumes: [
      { type: 'volume', source: 'pgdata', target: '/var/lib/postgresql/data' }] },
    redis: { networks: { 'staging-data': null } },
    api: { networks: { 'staging-data': null, 'staging-app': null },
      image: 'epmo-staging-api:sha-' + sha, environment: {
        NODE_ENV: 'production', DEPLOYMENT_ENV: 'staging', ALLOW_HEADER_AUTH: 'false',
        DATABASE_URL: env().DATABASE_URL, REDIS_URL: env().REDIS_URL,
        WEB_ORIGIN: env().WEB_ORIGIN, BILLING_REFERENCE_WEBHOOK_ENABLED: 'false',
        STRIPE_SECRET_KEY: 'sk_test_fixture' } },
    web: { networks: { 'staging-app': null }, image: 'epmo-staging-web:sha-' + sha,
      ports: [{ host_ip: '127.0.0.1', target: 3000, published: '3001' }],
      environment: { NODE_ENV: 'production', WEB_ORIGIN: env().WEB_ORIGIN,
        NEXT_PUBLIC_API_URL: env().PUBLIC_API_URL } },
    'staging-edge': { networks: { 'staging-app': null },
      volumes: [
        { type: 'bind', source: resolve(root, 'infra/staging/nginx.conf'), target: '/etc/nginx/conf.d/default.conf', read_only: true },
        { type: 'bind', source: env().STAGING_TLS_CERT_PATH, target: '/run/epmo-tls/tls.crt', read_only: true },
        { type: 'bind', source: env().STAGING_TLS_KEY_PATH, target: '/run/epmo-tls/tls.key', read_only: true },
      ],
      ports: [{ host_ip: '127.0.0.1', target: 8443, published: '8443' }] },
  },
});
const tlsOk = [{ name: 'Synthetic TLS fixture', passed: true }];
const failed = (e = env(), m = model(), t = tlsOk) =>
  inspectReadiness(e, sha, m, t).filter(c => !c.passed).map(c => c.name);

test('S35 approved synthetic-only staging model passes offline readiness', () =>
  assert.deepEqual(failed(), []));
test('S35 rejects production domain, public edge and wrong SHA', () => {
  for (const delta of [{ EPMO_DEPLOY_SHA: 'b'.repeat(40) },
    { WEB_ORIGIN: 'https://app.theepmo.com' }, { EPMO_SYNTHETIC_ONLY: 'NO' },
    { EPMO_DNS_CHANGE_APPROVED: 'YES' }, { STAGING_EDGE_BIND: '0.0.0.0' },
    { STRIPE_SECRET_KEY: 'sk_live_not_allowed' }])
    assert.ok(failed({ ...env(), ...delta }).length > 0, JSON.stringify(delta));
});
test('S35 rejects private data exposure, Compose project substitution and credential redirect', () => {
  const exposed = model(); exposed.services.postgres.ports = [{ host_ip: '0.0.0.0', target: 5432, published: '5432' }];
  assert.ok(failed(env(), exposed).some(x => x.includes('published ports')));
  const prod = model(); prod.name = 'pmo-prod';
  assert.ok(failed(env(), prod).some(x => x.includes('project')));
  const redirect = model(); redirect.services.api.environment.PGHOST = 'production-db';
  assert.ok(failed(env(), redirect).some(x => x.includes('PG variables')));
});
test('S35 rejects production TLS key and arbitrary nginx config bind sources', () => {
  const prodKey = model(); prodKey.services['staging-edge'].volumes[2].source = '/etc/production.key';
  assert.ok(failed(env(), prodKey).some(x => x.includes('exact staging certificate')));
  const replacedNginx = model(); replacedNginx.services['staging-edge'].volumes[0].source = '/tmp/other-nginx.conf';
  assert.ok(failed(env(), replacedNginx).some(x => x.includes('exact staging certificate')));
  assert.equal(approvedEdgeMounts(model(), env()), true);
});
test('S35 Compose inspection uses config only and strips ambient Docker and secret overrides', () => {
  const calls = [];
  const resolved = resolveComposeConfig({ cwd: '/tmp/synthetic-checkout', runner: (bin, args, opts) => {
    calls.push({ bin, args, opts });
    return { status: 0, stdout: JSON.stringify(model()) };
  } });
  assert.equal(resolved.name, 'pmo-staging');
  assert.equal(calls[0].bin, 'docker');
  assert.ok(calls[0].args.includes('config'));
  assert.ok(!calls[0].args.includes('up'));
  assert.ok(!calls[0].args.includes('pull'));
  assert.deepEqual(Object.keys(calls[0].opts.env), ['PATH']);
  assert.ok(calls[0].args.includes('.env.staging'));
  assert.throws(() => resolveComposeConfig({ runner: () => ({ status: 1, stderr: 'secret-sentinel' }) }),
    /could not be resolved locally/);
});
test('S35 certificate SAN, key match and owner-only file are checked without public DNS', (t) => {
  const probe = spawnSync('openssl', ['version'], { encoding: 'utf8' });
  if (probe.status !== 0) { t.skip('openssl unavailable'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'epmo-s35-tls-'));
  try {
    const cert = join(dir, 'cert.pem'), key = join(dir, 'key.pem');
    const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-days', '3', '-subj', '/CN=staging.theepmo.com',
      '-addext', 'subjectAltName=DNS:staging.theepmo.com,DNS:api-staging.theepmo.com',
      '-keyout', key, '-out', cert], { encoding: 'utf8', timeout: 15000 });
    assert.equal(r.status, 0, 'test certificate generation failed');
    chmodSync(key, 0o600);
    const e = { ...env(), STAGING_TLS_CERT_PATH: cert, STAGING_TLS_KEY_PATH: key };
    assert.ok(tlsMaterialChecks(e).every(x => x.passed));
    chmodSync(key, 0o644);
    assert.ok(tlsMaterialChecks(e).some(x => !x.passed));
    assert.ok(preflightReadiness(e, sha, tlsMaterialChecks(e)).some(x => !x.passed));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
