-- Run after migrations and apply-rls.sql with PostgreSQL administrative role.
-- Read-only catalog assertions: no customer data is inspected or modified.
-- psql -v ON_ERROR_STOP=1 -f packages/db/sql/assert-financial-rls.sql
DO $audit$
DECLARE
  table_name text;
  rls_on boolean;
  rls_forced boolean;
  policies int;
  tenant_policies int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pmo_app' AND NOT rolsuper AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'pmo_app must exist and must not be a superuser or bypass RLS';
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'tenant_subscriptions',
    'subscription_events',
    'billing_invoices',
    'billing_payments',
    'billing_webhook_receipts',
    'billing_stripe_checkout_sessions',
    'billing_payment_exceptions'
  ] LOOP
    SELECT c.relrowsecurity, c.relforcerowsecurity
    INTO rls_on, rls_forced
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=table_name AND c.relkind IN ('r','p');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Missing financial table: %', table_name;
    END IF;
    IF NOT rls_on OR NOT rls_forced THEN
      RAISE EXCEPTION 'Financial RLS must be ENABLED and FORCED: %', table_name;
    END IF;

    SELECT count(*), count(*) FILTER (
      WHERE qual LIKE '%tenant_id%'
        AND (qual LIKE '%app_current_tenant%' OR qual LIKE '%app.tenant_id%')
        AND with_check LIKE '%tenant_id%'
        AND (with_check LIKE '%app_current_tenant%' OR with_check LIKE '%app.tenant_id%')
    ) INTO policies, tenant_policies
    FROM pg_policies WHERE schemaname='public' AND tablename=table_name;
    IF policies < 1 OR tenant_policies < 1 THEN
      RAISE EXCEPTION 'Financial tenant isolation USING and WITH CHECK policy missing: %', table_name;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS financial RLS catalog: seven tables have forced tenant isolation';
END $audit$;
