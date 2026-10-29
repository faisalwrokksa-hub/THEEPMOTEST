/** Dependency-free enforcement assertions. These do not replace API/database tests. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const service = read('../apps/api/src/platform/billing.service.ts');
const controller = read('../apps/api/src/platform/billing.controller.ts');
const policy = read('../apps/api/src/platform/billing-reconciliation.ts');
const env = read('../apps/api/src/common/env.ts');
const checks = [
  ['reconciliation route is under authenticated billing controller', /@Controller\('api\/v1\/subscription\/billing'\)[\s\S]*@Get\('reconciliation'\)/.test(controller)],
  ['permission required before ledger read', /async reconciliation\(\)\s*\{\s*requireCapability\('pmoa_platform'\)/.test(service)],
  ['tenant taken from authenticated context', /async reconciliation\(\)[\s\S]*?const \{ tenantId \} = currentContext\(\)/.test(service)],
  ['ledger query wrapped in tenant-scoped transaction', /async reconciliation\(\)[\s\S]*?withTenant\(tenantId, async tx =>/.test(service)],
  ['ledger tenant predicate enforced', /FROM billing_invoices i[\s\S]*?WHERE i.tenant_id = \$\{tenantId\}/.test(service)],
  ['join enforces tenant and invoice pairing', /p.tenant_id = i.tenant_id AND p.invoice_id = i.id/.test(service)],
  ['bounded scan announces truncation', /LIMIT 201/.test(service) && /truncated: result.length > 200/.test(service)],
  ['no external settlement verification claimed', /settlementReconciledWithProvider: false/.test(service)],
  ['paid invoices without ledger rows flagged', /paid_without_payment/.test(policy)],
  ['amount/currency mismatches flagged', /payment_amount_mismatch/.test(policy) && /payment_currency_mismatch/.test(policy)],
  ['reference adapter cannot be enabled in production', /env.NODE_ENV === 'production' && env.BILLING_REFERENCE_WEBHOOK_ENABLED === 'true'/.test(env)],
  ['runtime reference adapter production guard', /process.env.NODE_ENV === 'production' \|\|/.test(service)],
];
for (const [label, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); assert.ok(ok, label); }
console.log(`Billing reconciliation security assertions: ${checks.length}/${checks.length} passed`);
