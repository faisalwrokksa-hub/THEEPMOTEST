-- Stripe hosted checkout sessions tied to a single tenant-specific invoice.
-- Ledger mutations require server-verified Stripe webhook + invoice checks.
CREATE TABLE IF NOT EXISTS billing_stripe_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL,
  stripe_session_id text NOT NULL,
  checkout_url text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_stripe_invoice_fk FOREIGN KEY (tenant_id, invoice_id)
    REFERENCES billing_invoices(tenant_id, id),
  CONSTRAINT billing_stripe_session_unique UNIQUE (stripe_session_id),
  CONSTRAINT billing_stripe_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT billing_stripe_session_id_format CHECK (stripe_session_id ~ '^cs_(test_|live_)[A-Za-z0-9]+$'),
  CONSTRAINT billing_stripe_checkout_url_https CHECK (checkout_url ~ '^https://checkout[.]stripe[.]com/')
);
CREATE INDEX IF NOT EXISTS billing_stripe_invoice_idx
  ON billing_stripe_checkout_sessions(tenant_id, invoice_id, created_at DESC);
ALTER TABLE billing_stripe_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_stripe_checkout_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_stripe_tenant_isolation ON billing_stripe_checkout_sessions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
-- App role can create and read checkout references, never rewrite history.
-- The app role's existing grants on future tables are re-applied through db:rls.
