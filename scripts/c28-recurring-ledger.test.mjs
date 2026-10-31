import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { verifyMigrationSnapshot } from './verified-migration-snapshot.mjs';

const sql = readFileSync(new URL('../packages/db/migrations/0021_stripe_recurring_ledger.sql', import.meta.url), 'utf8');
const rls = readFileSync(new URL('../packages/db/sql/rls.sql', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../packages/db/migrations/meta/_sha256.json', import.meta.url), 'utf8'));
const journal = JSON.parse(readFileSync(new URL('../packages/db/migrations/meta/_journal.json', import.meta.url), 'utf8'));

test('C28 recurring ledger is a pinned, additive, ordered migration', () => {
  const filename = '0021_stripe_recurring_ledger.sql';
  const hash = createHash('sha256').update(sql).digest('hex');
  assert.equal(verifyMigrationSnapshot(filename, Buffer.from(sql), manifest), hash);
  assert.equal(journal.entries.at(-1).tag, '0021_stripe_recurring_ledger');
  assert.equal(journal.entries.at(-1).idx, 21);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|DELETE\s+FROM|UPDATE\s+tenant_subscriptions)\b/i);
});

test('C28 checkout identity and binding cannot cross tenants or substitute plans', () => {
  assert.match(sql, /CREATE TABLE billing_stripe_recurring_checkout_sessions/);
  assert.match(sql, /CREATE TABLE billing_stripe_recurring_bindings/);
  assert.match(sql, /FOREIGN KEY \(tenant_id, subscription_id\)\s+REFERENCES tenant_subscriptions\(tenant_id, id\)/g);
  assert.match(sql, /FOREIGN KEY \(tenant_id, stripe_checkout_session_id, subscription_id, plan_id, stripe_price_id\)/);
  assert.match(sql, /UNIQUE \(tenant_id, stripe_session_id, subscription_id, plan_id, stripe_price_id\)/);
  assert.match(sql, /stripe_subscription_id text NOT NULL UNIQUE/);
  assert.match(sql, /stripe_checkout_session_id text NOT NULL UNIQUE/);
  assert.match(sql, /UNIQUE \(tenant_id, subscription_id\)/);
  assert.match(sql, /status IN \('pending', 'active'\)/);
  assert.match(sql, /status = 'pending' AND last_period_ends_at IS NULL/);
  assert.match(sql, /status = 'active' AND last_period_ends_at IS NOT NULL/);
});

test('C28 tables deny access before tenant RLS setup and retain least-privilege grants', () => {
  for (const table of ['billing_stripe_recurring_checkout_sessions', 'billing_stripe_recurring_bindings']) {
    assert.match(sql, new RegExp('ALTER TABLE ' + table + ' ENABLE ROW LEVEL SECURITY'));
    assert.match(sql, new RegExp('ALTER TABLE ' + table + ' FORCE ROW LEVEL SECURITY'));
    assert.match(rls, new RegExp('REVOKE UPDATE, DELETE ON ' + table + ' FROM pmo_app'));
  }
  assert.doesNotMatch(sql, /CREATE POLICY|GRANT\s+ALL/i);
  assert.match(rls, /GRANT UPDATE \(status, last_period_ends_at, cancel_at_period_end, updated_at\)\s+ON billing_stripe_recurring_bindings TO pmo_app/);
  assert.doesNotMatch(rls, /GRANT UPDATE \([^)]*(?:tenant_id|stripe_subscription_id|stripe_customer_id|stripe_price_id)[^)]*\)\s+ON billing_stripe_recurring_bindings/i);
});
