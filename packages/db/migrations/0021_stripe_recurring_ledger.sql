-- C28: additive Stripe recurring Checkout and subscription identity ledger.
-- No customer-facing recurring Checkout or entitlement is enabled by this migration.
-- Before first use, the restricted application role must run the reviewed RLS grants.
CREATE TABLE billing_stripe_recurring_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES subscription_plans(id),
  stripe_price_id text NOT NULL CHECK (stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
  stripe_session_id text NOT NULL UNIQUE
    CHECK (stripe_session_id ~ '^cs_(test_|live_)[A-Za-z0-9]+$'),
  checkout_url text NOT NULL CHECK (checkout_url ~ '^https://checkout[.]stripe[.]com/'),
  live_mode boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_checkout_subscription_fk
    FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenant_subscriptions(tenant_id, id),
  CONSTRAINT recurring_checkout_identity_unique
    UNIQUE (tenant_id, stripe_session_id, subscription_id, plan_id, stripe_price_id),
  CONSTRAINT recurring_checkout_mode_check
    CHECK ((stripe_session_id LIKE 'cs_live_%') = live_mode)
);
CREATE INDEX recurring_checkout_tenant_idx
  ON billing_stripe_recurring_checkout_sessions(tenant_id, subscription_id, created_at DESC);

-- Insert only after a signed Checkout completion and independent Stripe GET.
-- A pending binding does not activate access; only a verified invoice settlement
-- may advance it to active and update the tenant subscription period.
CREATE TABLE billing_stripe_recurring_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES subscription_plans(id),
  stripe_checkout_session_id text NOT NULL UNIQUE,
  stripe_subscription_id text NOT NULL UNIQUE
    CHECK (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  stripe_customer_id text NOT NULL CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  stripe_price_id text NOT NULL CHECK (stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  last_period_ends_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_binding_local_subscription_unique UNIQUE (tenant_id, subscription_id),
  CONSTRAINT recurring_binding_subscription_fk
    FOREIGN KEY (tenant_id, subscription_id)
    REFERENCES tenant_subscriptions(tenant_id, id),
  CONSTRAINT recurring_binding_checkout_fk
    FOREIGN KEY (tenant_id, stripe_checkout_session_id, subscription_id, plan_id, stripe_price_id)
    REFERENCES billing_stripe_recurring_checkout_sessions
      (tenant_id, stripe_session_id, subscription_id, plan_id, stripe_price_id),
  CONSTRAINT recurring_binding_period_check
    CHECK ((status = 'pending' AND last_period_ends_at IS NULL) OR
           (status = 'active' AND last_period_ends_at IS NOT NULL))
);
CREATE INDEX recurring_binding_tenant_idx
  ON billing_stripe_recurring_bindings(tenant_id, subscription_id, status);

-- Fail closed between migration and RLS policy application: no permissive
-- policy is created here. packages/db/sql/rls.sql installs tenant_isolation.
ALTER TABLE billing_stripe_recurring_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_stripe_recurring_checkout_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_stripe_recurring_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_stripe_recurring_bindings FORCE ROW LEVEL SECURITY;
