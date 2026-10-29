-- Vendor-wide, append-only journal for plan-management actions.
-- Tenant subscription events remain in subscription_events (with tenant RLS).
CREATE TABLE IF NOT EXISTS platform_subscription_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  entity_kind text NOT NULL CHECK (entity_kind IN ('plan')),
  entity_id text NOT NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_subscription_audit_events_created_at_idx
  ON platform_subscription_audit_events (created_at DESC);
-- Privilege hardening is in sql/rls.sql, including revoke update/delete.
