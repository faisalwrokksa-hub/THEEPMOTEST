import test from 'node:test';
import assert from 'node:assert/strict';
import { checkStagingSecurity } from './verify-staging-config.mjs';
const env = {
 DEPLOYMENT_ENV:'staging', WEB_BIND:'127.0.0.1', WEB_ORIGIN:'https://staging.theepmo.com',
 PUBLIC_API_URL:'https://api-staging.theepmo.com', DATABASE_URL:`postgres://app:${'A'.repeat(32)}@db:5432/pmo`,
 REDIS_URL:`redis://:${'B'.repeat(32)}@redis:6379`, STRIPE_SECRET_KEY:'sk_test_dummy', BILLING_REFERENCE_WEBHOOK_ENABLED:'false', NODE_ENV:'production'
};
const failed = e => checkStagingSecurity(e).filter(c=>!c.passed).map(c=>c.name);
test('accepts structurally safe staging configuration',()=>assert.deepEqual(failed(env),[]));
test('rejects production mode and public bind',()=>assert.equal(failed({...env,DEPLOYMENT_ENV:'production',WEB_BIND:'0.0.0.0'}).length,3));
test('rejects http origin and duplicate origins',()=>assert.ok(failed({...env,WEB_ORIGIN:'http://staging.example.com',PUBLIC_API_URL:'http://staging.example.com'}).length>=2));
test('rejects database and redis placeholders',()=>assert.ok(failed({...env,DATABASE_URL:'postgres://app:REPLACE_PASSWORD@db/pmo',REDIS_URL:'redis://:changeme@redis:6379'}).length>=2));
test('rejects live stripe keys',()=>assert.ok(failed({...env,STRIPE_SECRET_KEY:'sk_live_fake'}).some(x=>x.includes('live key'))));
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
