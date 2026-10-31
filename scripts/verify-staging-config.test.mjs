import test from 'node:test';
import assert from 'node:assert/strict';
import { checkStagingSecurity } from './verify-staging-config.mjs';
const env = {
 DEPLOYMENT_ENV:'staging', WEB_BIND:'127.0.0.1', WEB_ORIGIN:'https://staging.theepmo.com',
 PUBLIC_API_URL:'https://api-staging.theepmo.com', DATABASE_URL:`postgres://app:${'A'.repeat(32)}@postgres:5432/pmo`,
 REDIS_URL:`redis://:${'B'.repeat(32)}@redis:6379`, STRIPE_SECRET_KEY:'sk_test_dummy', BILLING_REFERENCE_WEBHOOK_ENABLED:'false', NODE_ENV:'production'
};
const failed = e => checkStagingSecurity(e).filter(c=>!c.passed).map(c=>c.name);
test('accepts structurally safe staging configuration',()=>assert.deepEqual(failed(env),[]));
test('rejects production mode and public bind',()=>assert.equal(failed({...env,DEPLOYMENT_ENV:'production',WEB_BIND:'0.0.0.0'}).length,3));
test('rejects http origin and duplicate origins',()=>assert.ok(failed({...env,WEB_ORIGIN:'http://staging.example.com',PUBLIC_API_URL:'http://staging.example.com'}).length>=2));
test('rejects database and redis placeholders',()=>assert.ok(failed({...env,DATABASE_URL:'postgres://app:REPLACE_PASSWORD@db/pmo',REDIS_URL:'redis://:changeme@redis:6379'}).length>=2));
test('rejects live stripe keys',()=>{
 for (const key of ['sk_live_fake', 'rk_live_fake'])
  assert.ok(failed({...env,STRIPE_SECRET_KEY:key}).some(x=>x.includes('live key')), key);
});
test('rejects reference billing webhook',()=>assert.ok(failed({...env,BILLING_REFERENCE_WEBHOOK_ENABLED:'true'}).length>0));
test('rejects credential-bearing URL and local origin',()=>assert.ok(failed({...env,WEB_ORIGIN:'https://user:pass@localhost'}).length>0));

test('rejects staging accidentally pointed at canonical production endpoints', () => {
 const failures = failed({ ...env, WEB_ORIGIN:'https://theepmo.com', PUBLIC_API_URL:'https://api.theepmo.com' });
 assert.ok(failures.includes('Canonical staging web origin'));
 assert.ok(failures.includes('Canonical staging API origin'));
});
test('rejects alternate staging API and spoofed staging domains', () => {
 assert.ok(failed({...env,PUBLIC_API_URL:'https://api.staging.theepmo.com'}).includes('Canonical staging API origin'));
 assert.ok(failed({...env,WEB_ORIGIN:'https://staging.theepmo.com.evil.example'}).includes('Canonical staging web origin'));
});

test('S26 rejects debug, test, preview and missing NODE_ENV for staging', () => {
 for (const mode of ['development', 'test', 'preview', '', undefined])
  assert.ok(failed({...env,NODE_ENV:mode}).includes('Production Node runtime required for staging'), String(mode));
});

test('S26 rejects PostgreSQL URI query redirects and fragments', () => {
 for (const suffix of ['?host=prod.example', '?hostaddr=203.0.113.1', '?sslmode=disable', '#ignored'])
  assert.ok(failed({...env,DATABASE_URL:env.DATABASE_URL + suffix})
    .includes('Database connection has non-placeholder credentials'), suffix);
});

test('S26 rejects Redis URI query and fragment overrides', () => {
 for (const suffix of ['?tls=false', '?db=1', '#ignored'])
  assert.ok(failed({...env,REDIS_URL:env.REDIS_URL + suffix})
    .includes('Redis connection has non-placeholder password'), suffix);
});

test('S27 blocks cross-environment PostgreSQL endpoints even with valid credentials', () => {
 const password = 'A'.repeat(32);
 for (const target of [
   'db', 'postgres-prod', 'postgres.internal', 'prod-db.theepmo.com',
   'localhost', '127.0.0.1', '10.0.0.9', 'postgres.evil.example'
 ]) {
   const url = `postgres://app:${password}@${target}:5432/pmo`;
   assert.ok(failed({...env, DATABASE_URL:url})
     .includes('PostgreSQL uses isolated staging Compose service'), target);
 }
 for (const port of ['5433', '6432', '15432']) {
   assert.ok(failed({...env, DATABASE_URL:`postgres://app:${password}@postgres:${port}/pmo`})
     .includes('PostgreSQL uses isolated staging Compose service'), port);
 }
 assert.ok(!failed({...env, DATABASE_URL:`postgres://app:${password}@postgres:5432/pmo`})
   .includes('PostgreSQL uses isolated staging Compose service'));
});

test('S27 blocks Redis production, alternate Compose services and wrong ports', () => {
 const password = 'B'.repeat(32);
 for (const target of ['redis-prod', 'cache', 'redis.internal', 'localhost', '127.0.0.1', '10.0.0.9']) {
   const url = `redis://:${password}@${target}:6379`;
   assert.ok(failed({...env, REDIS_URL:url})
     .includes('Redis uses isolated staging Compose service'), target);
 }
 for (const port of ['6380', '16379']) {
   assert.ok(failed({...env, REDIS_URL:`redis://:${password}@redis:${port}`})
     .includes('Redis uses isolated staging Compose service'), port);
 }
 assert.ok(!failed({...env, REDIS_URL:`redis://:${password}@redis:6379`})
   .includes('Redis uses isolated staging Compose service'));
});
