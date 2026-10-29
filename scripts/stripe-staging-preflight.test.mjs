import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkStripeStagingConfig } from './stripe-staging-preflight.mjs';
const good = {
  STRIPE_ENABLED: 'true',
  STRIPE_SECRET_KEY: 'sk_test_1234567890123456',
  STRIPE_WEBHOOK_SECRET: 'whsec_1234567890123456',
  DEPLOYMENT_ENV: 'staging',
  WEB_ORIGIN: 'https://staging.theepmo.com',
  STRIPE_WEBHOOK_PUBLIC_URL: 'https://api-staging.theepmo.com/api/v1/billing/stripe-webhook',
  DATABASE_URL: 'postgres://somebody:secret@example.com/theepmo',
  BILLING_REFERENCE_WEBHOOK_ENABLED: 'false',
  NODE_ENV: 'production',
  STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION: 'true',
};
const blocked=(env)=>checkStripeStagingConfig(env).filter(c=>!c.passed).map(c=>c.name);
test('fully configured staging passes configuration-only checks',()=>assert.deepEqual(blocked(good),[]));
test('missing keys fail',()=>assert.equal(blocked({...good,STRIPE_SECRET_KEY:''}).length,1));
test('live key fails the staging check',()=>assert.ok(blocked({...good,STRIPE_SECRET_KEY:'sk_live_1234567890123456'}).length));
test('missing signing secret fails',()=>assert.ok(blocked({...good,STRIPE_WEBHOOK_SECRET:''}).length));
test('HTTP staging site fails',()=>assert.ok(blocked({...good,WEB_ORIGIN:'http://staging.theepmo.com'}).length));
test('local callback URL fails',()=>assert.ok(blocked({...good,STRIPE_WEBHOOK_PUBLIC_URL:'https://localhost/api/v1/billing/stripe-webhook'}).length));
test('incorrect webhook path fails',()=>assert.ok(blocked({...good,STRIPE_WEBHOOK_PUBLIC_URL:'https://api-staging.theepmo.com/other'}).length));
test('production build without explicit staging exception fails',()=>assert.ok(blocked({...good,STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION:''}).length));
test('reference webhook must stay off',()=>assert.ok(blocked({...good,BILLING_REFERENCE_WEBHOOK_ENABLED:'true'}).length));
test('production designation fails staging check',()=>assert.ok(blocked({...good,DEPLOYMENT_ENV:'production'}).length));

test('private IP callback URL fails',()=>assert.ok(blocked({...good,STRIPE_WEBHOOK_PUBLIC_URL:'https://192.168.1.15/api/v1/billing/stripe-webhook'}).length));
test('IP localhost callback URL fails',()=>assert.ok(blocked({...good,STRIPE_WEBHOOK_PUBLIC_URL:'https://[::1]/api/v1/billing/stripe-webhook'}).length));
test('private internal DNS callback URL fails',()=>assert.ok(blocked({...good,STRIPE_WEBHOOK_PUBLIC_URL:'https://api-staging.internal/api/v1/billing/stripe-webhook'}).length));
