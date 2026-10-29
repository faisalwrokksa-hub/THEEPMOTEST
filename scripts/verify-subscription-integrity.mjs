import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../packages/db/migrations/0012_subscription_event_tenant_integrity.sql');
const guard = read('../apps/api/src/platform/module.guard.ts');
const assertions = [
 ['audit events cross-tenant preflight', /e\.tenant_id\s*<>\s*s\.tenant_id/.test(migration)],
 ['audit events composite foreign key', /FOREIGN KEY\s*\(tenant_id, subscription_id\)/i.test(migration)],
 ['subscription tenant-scoped unique key', /UNIQUE\s*\(tenant_id, id\)/i.test(migration)],
 ['subscription API guard fail-closed', /if \(!active && !trial\)/.test(guard)],
 ['module entitlement API check', /if \(!row\.enabled\)/.test(guard)],
 ['subscription query tenant scoped', /s\.tenant_id\s*=\s*\$\{tenantId\}/.test(guard)],
];
for (const [label, ok] of assertions) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); assert.ok(ok, label); }
console.log(`Subscription integrity static checks: ${assertions.length}/${assertions.length} passed`);
