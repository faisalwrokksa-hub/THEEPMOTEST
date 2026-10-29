/** Dependency-free source-level safeguards; these are NOT Postgres integration tests. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../packages/db/migrations/0014_billing_foundation.sql');
const service = read('../apps/api/src/platform/billing.service.ts');
const controller = read('../apps/api/src/platform/billing.controller.ts');
const app = read('../apps/api/src/app.module.ts');
const main = read('../apps/api/src/main.ts');
const env = read('../apps/api/src/common/env.ts');
const rls = read('../packages/db/sql/rls.sql');
const checks = [
  ['invoice tenant/subscription FK', /CONSTRAINT billing_invoice_subscription_fk FOREIGN KEY \(tenant_id, subscription_id\)/.test(migration)],
  ['payments tenant/invoice FK', /CONSTRAINT billing_payments_invoice_fk FOREIGN KEY \(tenant_id, invoice_id\)/.test(migration)],
  ['webhook receipt tenant/invoice FK', /CONSTRAINT billing_receipts_invoice_fk FOREIGN KEY \(tenant_id, invoice_id\)/.test(migration)],
  ['globally unique event ID', /UNIQUE \(provider, provider_event_id\)/.test(migration)],
  ['globally unique payment ID', /UNIQUE \(provider, provider_payment_id\)/.test(migration)],
  ['RLS forced on all billing tables', /ALTER TABLE %I FORCE ROW LEVEL SECURITY/.test(migration)],
  ['payment receipts cannot be edited by app role', /REVOKE UPDATE, DELETE ON billing_payments, billing_webhook_receipts/.test(rls)],
  ['no body-based tenant accepted for invoice creation', /const \{ tenantId \} = currentContext\(\)/.test(service)],
  ['reference adapter disabled by default', /BILLING_REFERENCE_WEBHOOK_ENABLED.*default\('false'\)/.test(env)],
  ['signed webhook gates service', /verifyReferenceSignature\(rawBody, timestamp, signature, secret\)/.test(service)],
  ['event idempotency via database conflict', /ON CONFLICT \(provider, provider_event_id\) DO NOTHING/.test(service)],
  ['atomic renewal in tenant transaction', /return withTenant\(tenantId, async tx =>/.test(service) && /UPDATE tenant_subscriptions/.test(service)],
  ['raw bytes enabled in NestJS', /rawBody: true/.test(main)],
  ['webhook bypasses cookie middleware only by exact route', /exclude\(\{ path: 'api\/v1\/billing\/reference-webhook', method: RequestMethod.POST \}\)/.test(app)],
  ['no authenticated-session bypass on other billing routes', /@Controller\('api\/v1\/subscription\/billing'\)/.test(controller)],
];
for (const [label, result] of checks) { console.log(`${result ? 'PASS' : 'FAIL'} ${label}`); assert.ok(result, label); }
console.log(`Billing foundation static checks: ${checks.length}/${checks.length} passed`);
