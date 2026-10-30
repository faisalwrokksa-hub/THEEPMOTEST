-- E04a additive foundation only: legacy integration_connections unchanged.
CREATE TABLE public.microsoft_user_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 provider text NOT NULL DEFAULT 'microsoft' CHECK (provider = 'microsoft'),
 status integ_status NOT NULL DEFAULT 'pending',
 external_tenant_id text, account_email text, account_name text, scopes text,
 refresh_token text, site_id text, site_name text, site_url text,
 drive_id text, drive_name text, root_item_id text, root_path text,
 connected_at timestamptz, last_error text, last_used_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT microsoft_user_connections_tenant_user_provider_key UNIQUE(tenant_id,user_id,provider),
 CONSTRAINT microsoft_user_connections_membership_fk FOREIGN KEY(tenant_id,user_id)
 REFERENCES public.memberships(tenant_id,user_id) ON DELETE CASCADE
);
CREATE INDEX microsoft_user_connections_tenant_idx ON public.microsoft_user_connections(tenant_id);
ALTER TABLE public.microsoft_user_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.microsoft_user_connections FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.microsoft_user_connections FROM PUBLIC;
-- No app grants or runtime switch until separately reviewed authorization policies.
