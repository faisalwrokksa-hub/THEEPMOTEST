-- Phase 13A: tenant-specific public-facing profile and single-use invitations.
-- Canonical tenant ID/slug are immutable. The profile is deliberately tenant-scoped.
CREATE TABLE IF NOT EXISTS tenant_profiles (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 2 AND 120),
  name_ar text CHECK (name_ar IS NULL OR char_length(trim(name_ar)) BETWEEN 2 AND 120),
  contact_email text CHECK (contact_email IS NULL OR char_length(contact_email) <= 254),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tenant_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(trim(email)) AND char_length(email) <= 254),
  role member_role NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending','sent','failed')),
  expires_at timestamptz NOT NULL,
  invited_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  revoked_at timestamptz,
  accepted_by uuid REFERENCES users(id),
  CONSTRAINT invitation_terminal_exclusive CHECK (consumed_at IS NULL OR revoked_at IS NULL),
  CONSTRAINT invitation_acceptance_consistency CHECK ((consumed_at IS NULL) = (accepted_by IS NULL))
);
CREATE INDEX IF NOT EXISTS tenant_invitations_list_idx
  ON tenant_invitations(tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_invitation_one_pending_email
  ON tenant_invitations(tenant_id, email)
  WHERE consumed_at IS NULL AND revoked_at IS NULL AND delivery_status IN ('pending', 'sent');

ALTER TABLE tenant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_profiles_isolation ON tenant_profiles
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_invitations_isolation ON tenant_invitations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- The normal app role may use the scoped invitation workflow but may not delete history.
GRANT SELECT, INSERT, UPDATE ON tenant_profiles, tenant_invitations TO pmo_app;
REVOKE DELETE ON tenant_profiles, tenant_invitations FROM pmo_app;
