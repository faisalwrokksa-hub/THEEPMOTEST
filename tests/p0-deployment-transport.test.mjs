import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requiresSecureTransport } from '../apps/api/src/common/deployment-policy.ts';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const auth = read('apps/api/src/auth/auth.controller.ts');
const env = read('apps/api/src/common/env.ts');
const stripe = read('apps/api/src/platform/stripe.service.ts');

test('staging enforces HTTPS and secure cookies even with NODE_ENV=development', () => {
  assert.equal(requiresSecureTransport('development', 'staging'), true);
});
test('production deployment enforces HTTPS even with NODE_ENV=test', () => {
  assert.equal(requiresSecureTransport('test', 'production'), true);
});
test('NODE_ENV=production enforces HTTPS even without deployment identity', () => {
  assert.equal(requiresSecureTransport('production', undefined), true);
});
test('local development and tests can use HTTP', () => {
  assert.equal(requiresSecureTransport('development', undefined), false);
  assert.equal(requiresSecureTransport('test', 'development'), false);
});
test('auth session cookie security is derived from deployment identity', () => {
  assert.match(auth, /secure: requiresSecureTransport\(process\.env\.NODE_ENV, process\.env\.DEPLOYMENT_ENV\)/);
  assert.doesNotMatch(auth, /secure: prod\(\)/);
});
test('environment refuses unknown deployment modes', () => {
  assert.match(env, /DEPLOYMENT_ENV: z\.enum\(\['development', 'staging', 'production'\]\)\.optional\(\)/);
});
test('staging and production HTTP browser origins are rejected by boot validation', () => {
  assert.match(env, /if \(secureDeployment && url\.protocol !== 'https:'\)/);
});
test('reference payment simulator is blocked in all secure deployments', () => {
  assert.match(env, /if \(secureDeployment && env\.BILLING_REFERENCE_WEBHOOK_ENABLED === 'true'\)/);
});
test('Stripe browser redirects require HTTPS in secure deployments', () => {
  assert.match(stripe, /requiresSecureTransport\(process\.env\.NODE_ENV, process\.env\.DEPLOYMENT_ENV\) && base\.protocol !== 'https:'/);
});
test('login and session constraints remain enforced in secure deployments', () => {
  assert.match(env, /if \(secureDeployment\) \{/);
  assert.match(env, /SESSION_ABSOLUTE_DAYS > 30/);
  assert.match(env, /LOGIN_RATE_LIMIT > 20/);
});
