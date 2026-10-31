-- Row-level security: the tenant boundary, enforced by Postgres rather than by
-- remembering to write WHERE tenant_id = ... in every query.
--
-- The app connects as pmo_app, which is NOT a superuser and does NOT have
-- BYPASSRLS, so these policies actually bind. Each request runs inside a
-- transaction that does: SELECT set_config('app.tenant_id', $1, true)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pmo_app') THEN
    -- Fail closed: application login must be provisioned with a strong secret
    -- by bootstrap or deployment automation, never by this policy script.
    CREATE ROLE pmo_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO pmo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pmo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pmo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pmo_app;

-- Revoke AFTER broad grants; the SQL bootstrap ledger is administrative state.
DO $$ BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.schema_migrations FROM pmo_app;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

-- Self-maintaining: every table that HAS a tenant_id column gets the policy.
-- A new tenant-scoped table can therefore never be left unprotected.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
      AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = app_current_tenant())
        WITH CHECK (tenant_id = app_current_tenant())
    $f$, t);
    RAISE NOTICE 'tenant_isolation applied to %', t;
  END LOOP;
END $$;

-- The audit ledger is append-only, even for the app role.
REVOKE UPDATE, DELETE ON audit_events FROM pmo_app;
-- Platform plan changes are recorded in this vendor-wide, append-only ledger.
GRANT SELECT, INSERT ON platform_subscription_audit_events TO pmo_app;
REVOKE UPDATE, DELETE ON platform_subscription_audit_events FROM pmo_app;

-- Financial ledgers are append-only. Invoices can only change status; never be deleted.
REVOKE UPDATE, DELETE ON billing_payments, billing_webhook_receipts, billing_payment_exceptions FROM pmo_app;
REVOKE DELETE ON billing_invoices FROM pmo_app;
REVOKE UPDATE, DELETE ON billing_stripe_checkout_sessions FROM pmo_app;
-- Recurring Checkout identities are immutable; only a verified settlement may
-- update the narrow binding lifecycle fields, never provider or tenant IDs.
REVOKE UPDATE, DELETE ON billing_stripe_recurring_checkout_sessions FROM pmo_app;
REVOKE UPDATE, DELETE ON billing_stripe_recurring_bindings FROM pmo_app;
GRANT UPDATE (status, last_period_ends_at, cancel_at_period_end, updated_at)
  ON billing_stripe_recurring_bindings TO pmo_app;

-- Global tables: readable, never writable by the app role. (Closes the gap
-- where pmo_app could update or delete any user in the system.)
REVOKE INSERT, UPDATE, DELETE ON tenants FROM pmo_app;
REVOKE INSERT, UPDATE, DELETE ON users   FROM pmo_app;

-- Exactly one accountable approver per gate — the "A" in RACI, enforced.
CREATE UNIQUE INDEX IF NOT EXISTS approvals_one_accountable
  ON approvals (gate_id) WHERE is_accountable;

-- Risk scoring is a 5x5 matrix; keep the data honest at the source.
ALTER TABLE raid_items DROP CONSTRAINT IF EXISTS raid_severity_range;
ALTER TABLE raid_items DROP CONSTRAINT IF EXISTS raid_likelihood_range;
ALTER TABLE raid_items ADD CONSTRAINT raid_severity_range
  CHECK (severity IS NULL OR severity BETWEEN 1 AND 5);
ALTER TABLE raid_items ADD CONSTRAINT raid_likelihood_range
  CHECK (likelihood IS NULL OR likelihood BETWEEN 1 AND 5);

-- Auth tables are global (a session is not scoped to a tenant until chosen).
-- The app role needs full control of sessions but must not rewrite auth history.
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO pmo_app;
GRANT SELECT, INSERT ON auth_events TO pmo_app;
REVOKE UPDATE, DELETE ON auth_events FROM pmo_app;
-- Users are global, not tenant-scoped. The API needs to look users up for
-- authentication, insert a newly invited person, and update ONLY login lockout
-- state. Never permit the application database role to change is_platform_admin,
-- is_active, password_hash, email, or any other existing account fields.
-- A future password-reset flow must use a separately reviewed privileged path.
-- Revoke table-level rights first: column grants do NOT override a prior broad
-- table GRANT (e.g. from an earlier deployment of this RLS script).
REVOKE INSERT, UPDATE, DELETE ON users FROM pmo_app;
GRANT SELECT ON users TO pmo_app;
GRANT INSERT (email, display_name, password_hash) ON users TO pmo_app;
GRANT UPDATE (failed_attempts, locked_until, last_login_at) ON users TO pmo_app;

-- Global password-recovery records carry no tenant_id; protect tokens explicitly.
-- pmo_app may enqueue/revoke recovery links but cannot read the token_hash column,
-- overwrite an existing hash, consume tokens or change users.password_hash.
REVOKE ALL ON public.auth_password_resets FROM pmo_app;
GRANT SELECT (id, user_id, created_at, expires_at, consumed_at, revoked_at) ON public.auth_password_resets TO pmo_app;
GRANT INSERT (user_id, token_hash, expires_at) ON public.auth_password_resets TO pmo_app;
GRANT UPDATE (revoked_at) ON public.auth_password_resets TO pmo_app;
REVOKE ALL ON FUNCTION public.pmo_redeem_password_reset(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pmo_redeem_password_reset(text, text) TO pmo_app;
