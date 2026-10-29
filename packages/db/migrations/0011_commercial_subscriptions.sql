-- Phase 12 Milestone 2A: additive subscription foundation; no customer data is removed.
CREATE TABLE IF NOT EXISTS subscription_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL,
 price_minor integer NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
 currency text NOT NULL DEFAULT 'SAR', billing_interval text NOT NULL DEFAULT 'monthly'
 CHECK (billing_interval IN ('monthly','yearly')),
 trial_days integer NOT NULL DEFAULT 0 CHECK (trial_days >= 0),
 is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 plan_id uuid NOT NULL REFERENCES subscription_plans(id),
 status text NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing','active','past_due','paused','canceled','expired')),
 trial_ends_at timestamptz, period_starts_at timestamptz NOT NULL,
 period_ends_at timestamptz NOT NULL, cancel_at_period_end boolean NOT NULL DEFAULT false,
 canceled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT subscription_period_valid CHECK (period_ends_at > period_starts_at)
);
CREATE INDEX IF NOT EXISTS tenant_subscriptions_tenant_idx ON tenant_subscriptions(tenant_id);
CREATE TABLE IF NOT EXISTS subscription_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 subscription_id uuid NOT NULL REFERENCES tenant_subscriptions(id),
 actor_user_id uuid REFERENCES users(id), event_type text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_events_tenant_idx ON subscription_events(tenant_id);
ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
-- Deny access unless the session has a matching tenant id; privileged service roles require separate controls.
DROP POLICY IF EXISTS tenant_subscriptions_isolation ON tenant_subscriptions;
CREATE POLICY tenant_subscriptions_isolation ON tenant_subscriptions USING (
 tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS subscription_events_isolation ON subscription_events;
CREATE POLICY subscription_events_isolation ON subscription_events USING (
 tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
