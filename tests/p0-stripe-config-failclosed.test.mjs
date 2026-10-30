import test from 'node:test';
import assert from 'node:assert/strict';
import { checkStripeStagingConfig } from '../scripts/stripe-staging-preflight.mjs';
const valid = { STRIPE_ENABLED:'true', STRIPE_SECRET_KEY:'sk_test_abcdefghijklmno1234', STRIPE_WEBHOOK_SECRET:'whsec_abcdefghijklmnop1234', DEPLOYMENT_ENV:'staging', WEB_ORIGIN:'https://staging.example.com', STRIPE_WEBHOOK_PUBLIC_URL:'https://api.example.com/api/v1/billing/stripe-webhook', DATABASE_URL:'postgresql://limited:strongtestpass@db.example.com/epmo', BILLING_REFERENCE_WEBHOOK_ENABLED:'false', NODE_ENV:'production', STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION:'true' };
const allPass = env => checkStripeStagingConfig(env).every(x=>x.passed);
test('configured test-only Stripe staging preflight passes without accessing credentials',()=> assert.equal(allPass(valid),true));
test('Stripe staging preflight fails closed on live key and reference webhook',()=>{
  assert.equal(allPass({...valid,STRIPE_SECRET_KEY:'sk_live_abcdefghijklmno1234'}),false);
  assert.equal(allPass({...valid,BILLING_REFERENCE_WEBHOOK_ENABLED:'true'}),false);
});
test('Stripe staging preflight rejects local callback and unapproved production build',()=>{
  assert.equal(allPass({...valid,STRIPE_WEBHOOK_PUBLIC_URL:'http://localhost:4000/api/v1/billing/stripe-webhook'}),false);
  assert.equal(allPass({...valid,STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION:'false'}),false);
});
