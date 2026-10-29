import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const checks = [
  ['raw webhook enabled at boot', () => assert.match(file('apps/api/src/main.ts'), /rawBody:\s*true/)],
  ['session middleware bypass only signed webhook', () => assert.match(file('apps/api/src/app.module.ts'), /api\/v1\/billing\/stripe-webhook/)],
  ['Stripe endpoint receives raw bytes', () => assert.match(file('apps/api/src/platform/billing.controller.ts'), /stripeWebhook\(@Req\(\).*req\.rawBody/s)],
  ['verified signature precedes DB mutation', () => {
    const t = file('apps/api/src/platform/stripe.service.ts');
    assert.ok(t.indexOf('verifyStripeSignature(') > 0 && t.indexOf('verifyStripeSignature(') < t.indexOf('return withTenant(tenantId, async tx => {', t.indexOf('async webhook(')));
  }],
  ['Stripe webhooks fail closed without configuration', () => assert.match(file('apps/api/src/platform/stripe.service.ts'), /STRIPE_ENABLED !== 'true'/)],
  ['checkout retry derives idempotency from persisted attempts', () => {
    const t=file('apps/api/src/platform/stripe.service.ts');
    assert.match(t, /COUNT\(\*\)::int AS "count" FROM billing_stripe_checkout_sessions/);
    assert.match(t, /stripeCheckoutIdempotencyKey\(invoiceId, attempts\)/);
    assert.match(t, /'Idempotency-Key': idempotencyKey/);
  }],
  ['test Stripe keys in production builds require staging-specific opt-in', () => {
    const t=file('apps/api/src/platform/stripe.service.ts');
    assert.match(t, /stripeDeploymentModeAllowed\(/);
    assert.match(t, /STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION/);
  }],
  ['stripe checkout requires tenant billing admin', () => assert.match(file('apps/api/src/platform/stripe.service.ts'), /requireCapability\('pmoa_admin'\)/)],
  ['Checkout HTTP uses secret only on server', () => assert.match(file('apps/api/src/platform/stripe.service.ts'), /Authorization: `Bearer \$\{config\.key\}`/)],
  ['checkout session persisted against invoice', () => assert.match(file('apps/api/src/platform/stripe.service.ts'), /INSERT INTO billing_stripe_checkout_sessions/)],
  ['webhook requires the recorded Stripe session', () => assert.match(file('apps/api/src/platform/stripe.service.ts'), /AND stripe_session_id = \$\{session\.id\}/)],
  ['webhook checks latest subscription and quarantines obsolete captured payments', () => {
    const body=file('apps/api/src/platform/stripe.service.ts');
    assert.match(body,/latest\.id !== invoice\.subscriptionId/);
    assert.match(body,/recordUnfulfilledSettlement\(tx, tenantId, invoiceId, invoice\.subscriptionId/);
  }],
  ['webhook uses verified settlement before payment insert', () => {
    const t=file('apps/api/src/platform/stripe.service.ts');
    const w=t.slice(t.indexOf('async webhook('));
    assert.ok(w.indexOf('assertStripeSettlement(') < w.indexOf('INSERT INTO billing_payments'));
  }],
  ['webhook protects provider payment uniqueness', () => assert.match(file('packages/db/migrations/0014_billing_foundation.sql'), /billing_payments_provider_payment_unique/)],
  ['event replays guarded in DB', () => assert.match(file('apps/api/src/platform/stripe.service.ts'), /ON CONFLICT \(provider, provider_event_id\) DO NOTHING/)],
  ['subscription only updated after settlement', () => assert.match(file('apps/api/src/platform/stripe.service.ts'), /subscription\.renewed_after_verified_settlement/)],
  ['database enforces Stripe session tenant FK and RLS', () => {
    const t=file('packages/db/migrations/0015_stripe_checkout_sessions.sql');
    assert.match(t,/FOREIGN KEY \(tenant_id, invoice_id\)/);
    assert.match(t,/FORCE ROW LEVEL SECURITY/);
  }],
  ['tenant schema inventory updated', () => assert.match(file('packages/db/src/schema.ts'), /'billing_stripe_checkout_sessions'/)],
  ['migration journal updated', () => {
    const m=JSON.parse(file('packages/db/migrations/meta/_journal.json'));
    assert.ok(m.entries.some(entry => entry.tag === '0015_stripe_checkout_sessions'));
  }],
  ['payment browser mutation uses csrf protection', () => assert.match(file('apps/web/src/app/api/billing/checkout/route.ts'), /rejectUnsafeBrowserMutation\(req\)/)],
  ['no client-controlled payment redirect', () => assert.match(file('apps/web/src/app/api/billing/checkout/route.ts'), /url\.hostname !== 'checkout\.stripe\.com'/)],
  ['reference webhook gated by deployment identity', () => {
    assert.match(file('apps/api/src/platform/billing.service.ts'), /referenceBillingModeAllowed\(process\.env\.NODE_ENV, process\.env\.DEPLOYMENT_ENV\)/);
    assert.match(file('apps/api/src/platform/billing-policy.ts'), /deploymentEnv === 'development'/);
  }],
];
for (const [name, check] of checks) {
  try { check(); console.log('PASS', name); }
  catch (error) { console.error('FAIL', name, error.message); process.exitCode = 1; }
}
console.log(`${checks.length} Stripe integration checks completed`);
