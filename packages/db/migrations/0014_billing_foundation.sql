-- Phase 12 billing foundation. Additive: does not change existing customer entitlements.
-- No provider may make a tenant active without an invoice-specific verified settlement.
CREATE TABLE IF NOT EXISTS billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL,
  period_starts_at timestamptz NOT NULL,
  period_ends_at timestamptz NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'void')),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  CONSTRAINT billing_invoice_period_check CHECK (period_ends_at > period_starts_at),
  CONSTRAINT billing_invoice_subscription_fk FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenant_subscriptions(tenant_id, id),
  CONSTRAINT billing_invoice_unique_period UNIQUE (tenant_id, subscription_id, period_starts_at),
  CONSTRAINT billing_invoice_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT billing_invoice_paid_at_check CHECK
    ((status = 'paid' AND paid_at IS NOT NULL) OR (status <> 'paid' AND paid_at IS NULL))
);
CREATE INDEX IF NOT EXISTS billing_invoices_tenant_created_idx
  ON billing_invoices(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL,
  provider text NOT NULL,
  provider_payment_id text NOT NULL,
  provider_event_id text NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_payments_invoice_fk FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES billing_invoices(tenant_id, id),
  CONSTRAINT billing_payments_provider_payment_unique UNIQUE (provider, provider_payment_id),
  CONSTRAINT billing_payments_invoice_unique UNIQUE (invoice_id)
);
CREATE INDEX IF NOT EXISTS billing_payments_tenant_created_idx
  ON billing_payments(tenant_id, created_at DESC);

-- Each signed provider event is recorded once. Payload hashes detect changed replay bodies.
CREATE TABLE IF NOT EXISTS billing_webhook_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  payload_sha256 text NOT NULL CHECK (length(payload_sha256) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_receipts_invoice_fk FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES billing_invoices(tenant_id, id),
  CONSTRAINT billing_receipts_event_unique UNIQUE (provider, provider_event_id)
);
CREATE INDEX IF NOT EXISTS billing_webhook_receipts_tenant_created_idx
  ON billing_webhook_receipts(tenant_id, created_at DESC);

-- Defense in depth: fail closed even if the RLS setup script has not yet been re-run.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['billing_invoices', 'billing_payments', 'billing_webhook_receipts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY billing_tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', table_name);
  END LOOP;
END $$;
