-- E44: owner-scoped RLS for the previously inert E04a per-user Microsoft store.
-- Additive, review-only; legacy integration_connections are unchanged.
-- A missing transaction-local tenant/user, suspended membership, or downgraded
-- administrator makes credentials invisible and unwritable.
-- RESTRICTIVE policy composes with the tenant_isolation baseline from rls.sql.
CREATE POLICY microsoft_user_owner ON public.microsoft_user_connections
AS RESTRICTIVE FOR ALL
USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM public.memberships AS m
    WHERE m.tenant_id = microsoft_user_connections.tenant_id
      AND m.user_id = microsoft_user_connections.user_id
      AND m.is_active = true
      AND m.role IN ('owner', 'admin', 'client_admin')
  )
)
WITH CHECK (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  AND EXISTS (
    SELECT 1 FROM public.memberships AS m
    WHERE m.tenant_id = microsoft_user_connections.tenant_id
      AND m.user_id = microsoft_user_connections.user_id
      AND m.is_active = true
      AND m.role IN ('owner', 'admin', 'client_admin')
  )
);
-- No new grant or permissive policy. The reviewed bootstrap RLS script
-- grants pmo_app table privileges; both policies must allow each operation.
