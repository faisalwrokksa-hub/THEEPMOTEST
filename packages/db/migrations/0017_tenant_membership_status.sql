-- Phase 14C: workspace suspension must never disable a shared global account.
-- Existing memberships remain active, preserving current access on upgrade.
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Speed up active-member checks while retaining historical deactivated memberships.
CREATE INDEX IF NOT EXISTS memberships_tenant_active_idx
  ON memberships (tenant_id, user_id) WHERE is_active;
