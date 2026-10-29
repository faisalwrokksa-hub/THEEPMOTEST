-- P0: immutable, tenant-scoped record of signed payment reversals and unfulfilled charges.
-- Customer paid invoices remain immutable; payment exceptions do not forge a refund ledger.
CREATE TABLE billing_payment_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('stripe')),
  provider_event_id text NOT NULL,
  provider_payment_id text NOT NULL CHECK (provider_payment_id ~ '^pi_[A-Za-z0-9]+$'),
  exception_type text NOT NULL CHECK (exception_type IN
    ('full_refund', 'partial_refund', 'dispute_opened', 'dispute_closed', 'ineligible_settlement')),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subscription_paused boolean NOT NULL DEFAULT false,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_exception_invoice_fk FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES billing_invoices(tenant_id, id),
  CONSTRAINT billing_exception_event_unique UNIQUE (provider, provider_event_id)
);
CREATE INDEX billing_payment_exceptions_tenant_created_idx
  ON billing_payment_exceptions(tenant_id, created_at DESC);
ALTER TABLE billing_payment_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_payment_exceptions FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_payment_exception_tenant_isolation ON billing_payment_exceptions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
-- App-role privileges are applied by the same db:rls process as other billing tables.
