-- P0 tenant/global privilege gate. Run AFTER applying sql/rls.sql against the
-- same PostgreSQL cluster used by the application. No data is modified.
-- Uses effective role privileges, not a fragile match against GRANT syntax.
DO $check$
DECLARE
  role_is_safe boolean;
BEGIN
  SELECT NOT rolsuper AND NOT rolbypassrls
    INTO role_is_safe FROM pg_roles WHERE rolname='pmo_app';
  IF role_is_safe IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'P0: pmo_app must not be superuser or BYPASSRLS';
  END IF;
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'P0: public.users must exist';
  END IF;
  IF has_table_privilege('pmo_app', 'public.users', 'UPDATE') OR
     has_table_privilege('pmo_app', 'public.users', 'INSERT') OR
     has_table_privilege('pmo_app', 'public.users', 'DELETE') THEN
    RAISE EXCEPTION 'P0: broad write privilege on global users table';
  END IF;
  IF has_column_privilege('pmo_app', 'public.users', 'is_platform_admin', 'UPDATE') OR
     has_column_privilege('pmo_app', 'public.users', 'is_active', 'UPDATE') OR
     has_column_privilege('pmo_app', 'public.users', 'password_hash', 'UPDATE') OR
     has_column_privilege('pmo_app', 'public.users', 'email', 'UPDATE') OR
     has_column_privilege('pmo_app', 'public.users', 'is_platform_admin', 'INSERT') OR
     has_column_privilege('pmo_app', 'public.users', 'is_active', 'INSERT') THEN
    RAISE EXCEPTION 'P0: account administration fields writable by application role';
  END IF;
  IF NOT has_column_privilege('pmo_app', 'public.users', 'failed_attempts', 'UPDATE') OR
     NOT has_column_privilege('pmo_app', 'public.users', 'locked_until', 'UPDATE') OR
     NOT has_column_privilege('pmo_app', 'public.users', 'last_login_at', 'UPDATE') OR
     NOT has_column_privilege('pmo_app', 'public.users', 'email', 'INSERT') OR
     NOT has_column_privilege('pmo_app', 'public.users', 'display_name', 'INSERT') OR
     NOT has_column_privilege('pmo_app', 'public.users', 'password_hash', 'INSERT') OR
     NOT has_table_privilege('pmo_app', 'public.users', 'SELECT') THEN
    RAISE EXCEPTION 'P0: required authentication and invitation privileges are missing';
  END IF;
  IF has_table_privilege('pmo_app', 'public.tenants', 'INSERT') OR
     has_table_privilege('pmo_app', 'public.tenants', 'UPDATE') OR
     has_table_privilege('pmo_app', 'public.tenants', 'DELETE') THEN
    RAISE EXCEPTION 'P0: global tenants writable by application role';
  END IF;
  IF to_regclass('public.auth_password_resets') IS NULL THEN
    RAISE EXCEPTION 'P0: missing password recovery table';
  END IF;
  IF has_table_privilege('pmo_app', 'public.auth_password_resets', 'SELECT') OR
     has_table_privilege('pmo_app', 'public.auth_password_resets', 'UPDATE') OR
     has_table_privilege('pmo_app', 'public.auth_password_resets', 'INSERT') OR
     has_table_privilege('pmo_app', 'public.auth_password_resets', 'DELETE') OR
     has_column_privilege('pmo_app', 'public.auth_password_resets', 'token_hash', 'SELECT') OR
     has_column_privilege('pmo_app', 'public.auth_password_resets', 'token_hash', 'UPDATE') OR
     has_column_privilege('pmo_app', 'public.auth_password_resets', 'consumed_at', 'UPDATE') THEN
    RAISE EXCEPTION 'P0: password reset token hashes exposed or overly broad writes granted';
  END IF;
  IF NOT has_column_privilege('pmo_app', 'public.auth_password_resets', 'token_hash', 'INSERT') OR
     NOT has_column_privilege('pmo_app', 'public.auth_password_resets', 'revoked_at', 'UPDATE') OR
     NOT has_function_privilege('pmo_app', 'public.pmo_redeem_password_reset(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P0: missing narrowly-scoped password recovery permissions';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p,
      LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid='public.pmo_redeem_password_reset(text,text)'::regprocedure
        AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
    RAISE EXCEPTION 'P0: password reset function must not be public';
  END IF;
  RAISE NOTICE 'PASS P0 application role column-level privilege boundary';
END
$check$;
