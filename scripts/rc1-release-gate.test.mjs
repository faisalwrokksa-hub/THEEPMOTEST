import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSimpleEnvFile,validateRc1Configuration,checkRepository,validateRc1Repository } from './rc1-release-gate.mjs';
const good = {
  DEPLOYMENT_ENV:'staging', WEB_ORIGIN:'https://staging.theepmo.com',
  PUBLIC_API_URL:'https://api-staging.theepmo.com',
  STRIPE_WEBHOOK_PUBLIC_URL:'https://api-staging.theepmo.com/api/v1/billing/stripe-webhook',
  STRIPE_ENABLED:'true', STRIPE_SECRET_KEY:'sk_test_12345678901234567890',
  STRIPE_WEBHOOK_SECRET:'whsec_1234567890123456789012',
  STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION:'true', BILLING_REFERENCE_WEBHOOK_ENABLED:'false',
  PG_USER:'pmo_admin', PG_PASSWORD:'strong-admin-password_123', PG_DB:'pmo',
  DATABASE_URL:'postgres://pmo_app:strong-app-password_123@postgres:5432/pmo',
  REDIS_PASSWORD:'strong-redis-password_123',
  REDIS_URL:'redis://:strong-redis-password_123@redis:6379',
};
const failed=(v,mode='staging')=>validateRc1Configuration(v,mode).filter(c=>!c.passed).map(c=>c.name);
test('staging configuration passes when complete and safe',()=>assert.deepEqual(failed(good),[]));
test('production accepts only live keys and no staging exemption',()=>{
 const env={...good,DEPLOYMENT_ENV:'production',STRIPE_SECRET_KEY:'sk_live_12345678901234567890',STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION:'false'};
 assert.deepEqual(failed(env,'production'),[]);
});
test('staging rejects live keys even with override',()=>assert.ok(failed({...good,STRIPE_SECRET_KEY:'sk_live_12345678901234567890'}).some(c=>c.includes('test key'))));
test('production rejects staging test keys',()=>assert.ok(failed({...good,DEPLOYMENT_ENV:'production',STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION:'false'},'production').length));
test('production rejects test-mode exemption',()=>assert.ok(failed({...good,DEPLOYMENT_ENV:'production',STRIPE_SECRET_KEY:'sk_live_12345678901234567890'},'production').length));
test('URL must point to exact webhook path and host',()=>assert.ok(failed({...good,STRIPE_WEBHOOK_PUBLIC_URL:'https://attacker.test/api/v1/billing/stripe-webhook'}).length));
test('production-looking web origins required',()=>assert.ok(failed({...good,WEB_ORIGIN:'http://localhost:3000'}).length));
test('application cannot authenticate as database admin',()=>assert.ok(failed({...good,DATABASE_URL:'postgres://pmo_admin:strong-app-password_123@postgres:5432/pmo'}).length));
test('application database password cannot remain default',()=>assert.ok(failed({...good,DATABASE_URL:'postgres://pmo_app:pmo_app@postgres:5432/pmo'}).length));
test('redis password must match actual URL',()=>assert.ok(failed({...good,REDIS_PASSWORD:'different-strong-password_123'}).length));
test('reference adapter cannot be enabled',()=>assert.ok(failed({...good,BILLING_REFERENCE_WEBHOOK_ENABLED:'true'}).length));
test('missing Stripe secrets must block',()=>assert.ok(failed({...good,STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:''}).length >= 2));
test('parse env without executing shell commands',()=>{
 const parsed=parseSimpleEnvFile("# comment\nFOO=bar # note\nQUOTED='has spaces'\n");
 assert.deepEqual(parsed,{FOO:'bar',QUOTED:'has spaces'});
});
test('duplicate env keys rejected',()=>assert.throws(()=>parseSimpleEnvFile('A=1\nA=2')));
test('env interpolation rejected to prevent disagreement with compose',()=>assert.throws(()=>parseSimpleEnvFile('A=${B}')));
test('current repository wires API and keeps Stripe secrets off web',()=>assert.deepEqual(checkRepository().filter(c=>!c.passed),[]));
test('missing API secret mapping is caught',()=>{
 const composed=checkRepository();
 assert.equal(composed.length,9);
 const source={compose:'\n  api:\n    environment:\n      STRIPE_ENABLED: true\n  web:\n    environment:\n',apiEnv:'',stripePolicy:'',ci:''};
 assert.ok(validateRc1Repository(source).some(c=>!c.passed));
});

test('rejects publicly bound web container port in staging or production', () => {
  assert.ok(failed({...good, WEB_BIND:'0.0.0.0'}).some(c=>c.includes('loopback')));
  assert.ok(failed({...good, WEB_BIND:'::'}).some(c=>c.includes('loopback')));
  assert.deepEqual(failed({...good, WEB_BIND:'127.0.0.1'}),[]);
});
