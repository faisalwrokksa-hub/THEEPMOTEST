/** Dependency-free source assertions for the RC1 database release path.
 * These check the supplied bootstrap/CI sources, not live PostgreSQL.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const bootstrap = read('infra/bootstrap-db.sh');
const rls = read('packages/db/sql/rls.sql');
const ci = read('.github/workflows/ci.yml');

test('bootstrap checks for an existing Drizzle journal before running SQL migrations', () => {
  const check = bootstrap.indexOf("to_regclass('drizzle.__drizzle_migrations')");
  assert.ok(check > bootstrap.indexOf('Waiting for postgres'));
  assert.ok(check < bootstrap.indexOf('echo "1/3 application role"'));
  assert.match(bootstrap, /do not mix ledgers/);
});
test('each bootstrap migration and its ledger insert share an explicit transaction', () => {
  const from = bootstrap.indexOf('for f in packages/db/migrations/*.sql; do');
  const to = bootstrap.indexOf('echo "3/3 row-level security"');
  const block = bootstrap.slice(from, to);
  assert.match(block, /printf 'BEGIN;/);
  assert.match(block, /cat "\$f"/);
  assert.match(block, /INSERT INTO public\.schema_migrations \(filename\)/);
  assert.match(block, /\\endif\\nCOMMIT;/);
  assert.ok(block.indexOf("printf 'BEGIN;") < block.indexOf('cat "$f"'));
  assert.ok(block.indexOf('cat "$f"') < block.indexOf('INSERT INTO public.schema_migrations'));
  assert.doesNotMatch(block, /\bpsql -q -1\b/);
});
test('a failed migration aborts bootstrap and prevents RLS application', () => {
  assert.match(bootstrap, /if ! \{[\s\S]*\} \| dc exec -T postgres psql[\s\S]*?then\s+echo[\s\S]*?exit 1\s+fi/);
  assert.ok(bootstrap.indexOf('echo "3/3 row-level security"') > bootstrap.indexOf('migration and ledger transaction rolled back'));
});
test('RLS setup cannot manufacture a default-password application account', () => {
  assert.match(rls, /CREATE ROLE pmo_app NOLOGIN/);
  assert.doesNotMatch(rls, /CREATE ROLE pmo_app LOGIN PASSWORD/);
  assert.match(rls, /REVOKE ALL ON TABLE public\.schema_migrations FROM pmo_app/);
  assert.ok(rls.indexOf('REVOKE ALL ON TABLE public.schema_migrations') > rls.indexOf('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES'));
});
test('CI creates application role before migration requiring it', () => {
  const role = ci.indexOf("CREATE ROLE pmo_app LOGIN PASSWORD 'ci_test_only_secure_password_2026'");
  const migrate = ci.indexOf('run: bash scripts/apply-sql-migrations.sh');
  assert.ok(role > 0 && migrate > role);
  assert.match(ci, /DATABASE_URL: postgres:\/\/pmo_app:ci_test_only_secure_password_2026@/);
});
test('bootstrap uses non-default application password from the application URL', () => {
  assert.match(bootstrap, /decodeURIComponent\(u\.password\)/);
  assert.match(bootstrap, /\[ "\$\{#APP_PW\}" -ge 16 \]/);
  assert.match(bootstrap, /ALTER ROLE pmo_app LOGIN WITH PASSWORD/);
});

test('database startup wait is bounded and fails before schema changes', () => {
  assert.match(bootstrap, /for attempt in \$\(seq 1 60\)/);
  assert.match(bootstrap, /PostgreSQL did not become ready within 120 seconds/);
});
test('bootstrap verifies exact SQL migration history before applying RLS', () => {
  assert.match(bootstrap, /expected_migrations=\$\(for file in packages\/db\/migrations/);
  assert.match(bootstrap, /SELECT filename FROM schema_migrations ORDER BY filename/);
  assert.match(bootstrap, /SQL migration ledger differs/);
  assert.ok(bootstrap.indexOf('expected_migrations=') < bootstrap.indexOf('echo "3/3 row-level security"'));
});
test('financial RLS assertion is enforced after applying RLS policies', () => {
  assert.match(bootstrap, /< packages\/db\/sql\/assert-financial-rls\.sql/);
  assert.ok(bootstrap.indexOf('< packages/db/sql/rls.sql') < bootstrap.indexOf('< packages/db/sql/assert-financial-rls.sql'));
});

test('bootstrap converts an existing NOLOGIN app role into a restricted LOGIN', () => {
  assert.match(bootstrap, /ALTER ROLE pmo_app LOGIN WITH PASSWORD/);
  assert.match(bootstrap, /CREATE ROLE pmo_app LOGIN/);
});
