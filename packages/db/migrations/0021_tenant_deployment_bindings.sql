-- E13: privileged, durable tenant-to-deployment registry.
-- This is not a provisioning API. Only the migration/provisioning administrator
-- may insert bindings; application credentials can read their own tenant row.
CREATE TABLE public.tenant_deployment_bindings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE RESTRICT,
  deployment_id uuid NOT NULL,
  profile text NOT NULL CHECK (profile IN ('shared', 'dedicated')),
  region text NOT NULL CHECK (region ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  data_residency text NOT NULL DEFAULT 'SA' CHECK (data_residency = 'SA'),
  database_isolation text NOT NULL,
  key_isolation text NOT NULL,
  api_origin text NOT NULL CHECK (api_origin ~ '^https://[^/?#@]+$'),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_deployment_profile_isolation CHECK (
    (profile = 'shared' AND database_isolation = 'shared-rls' AND key_isolation = 'tenant-context')
    OR (profile = 'dedicated' AND database_isolation = 'dedicated' AND key_isolation = 'dedicated')
  )
);
-- Dedicated deployment IDs must not be reused across different customers.
CREATE UNIQUE INDEX tenant_deployment_dedicated_unique
  ON public.tenant_deployment_bindings(deployment_id) WHERE profile = 'dedicated';

-- A privileged operator may disable a binding, but may not silently reassign
-- a tenant, move regions, change encryption/isolation, or delete its history.
CREATE FUNCTION public.prevent_tenant_deployment_binding_rewrite()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Deployment binding deletion requires an audited migration';
  END IF;
  IF ROW(NEW.tenant_id, NEW.deployment_id, NEW.profile, NEW.region,
         NEW.data_residency, NEW.database_isolation, NEW.key_isolation,
         NEW.api_origin, NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.tenant_id, OLD.deployment_id, OLD.profile, OLD.region,
         OLD.data_residency, OLD.database_isolation, OLD.key_isolation,
         OLD.api_origin, OLD.created_at) THEN
    RAISE EXCEPTION 'Deployment binding is immutable; use an audited migration';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tenant_deployment_immutable
  BEFORE UPDATE OR DELETE ON public.tenant_deployment_bindings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_deployment_binding_rewrite();

ALTER TABLE public.tenant_deployment_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_deployment_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.tenant_deployment_bindings
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON public.tenant_deployment_bindings FROM PUBLIC;
REVOKE ALL ON public.tenant_deployment_bindings FROM pmo_app;
GRANT SELECT ON public.tenant_deployment_bindings TO pmo_app;
REVOKE ALL ON FUNCTION public.prevent_tenant_deployment_binding_rewrite() FROM PUBLIC;
