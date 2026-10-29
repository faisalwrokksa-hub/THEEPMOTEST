-- Connecting a workspace to the customer's own Microsoft tenant.
--
-- Two new tables and four columns on documents. The shape follows one decision:
-- Align360 does not become a file store. A document connected this way lives in
-- the customer's SharePoint or OneDrive and stays there, under their retention
-- policy, their permissions and their legal hold. What is kept here is a
-- pointer — which drive, which item, which version — and a token to reach it.

CREATE TABLE IF NOT EXISTS integration_connections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider            text NOT NULL,
  status              integ_status NOT NULL DEFAULT 'pending',

  external_tenant_id  text,
  account_email       text,
  account_name        text,
  scopes              text,
  -- AES-256-GCM, keyed outside the database. A dump of this table is not a set
  -- of keys to a customer's SharePoint.
  refresh_token       text,

  site_id             text,
  site_name           text,
  site_url            text,
  drive_id            text,
  drive_name          text,
  root_item_id        text,
  root_path           text,

  connected_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  connected_at        timestamptz,
  last_error          text,
  last_used_at        timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- One connection per provider per workspace: connecting again replaces the
-- tokens rather than leaving two sets of credentials both appearing to work.
CREATE UNIQUE INDEX IF NOT EXISTS integration_conn_tenant_provider_key
  ON integration_connections (tenant_id, provider);

-- A handshake in progress. `state` must be unguessable, single-use and tied to
-- the workspace that started it, or a callback can be replayed into somebody
-- else's workspace.
CREATE TABLE IF NOT EXISTS oauth_states (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider    text NOT NULL,
  state       text NOT NULL,
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  return_to   text,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS oauth_states_state_key ON oauth_states (state);

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS storage_provider  text NOT NULL DEFAULT 'link',
  ADD COLUMN IF NOT EXISTS external_drive_id text,
  ADD COLUMN IF NOT EXISTS external_item_id  text,
  ADD COLUMN IF NOT EXISTS external_etag     text;

CREATE INDEX IF NOT EXISTS docs_external_idx ON documents (external_item_id);
