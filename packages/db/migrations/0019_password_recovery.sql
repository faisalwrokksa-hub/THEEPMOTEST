-- P0: token-based recovery of a global user. App role NEVER receives UPDATE(password_hash).
CREATE TABLE public.auth_password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT auth_reset_ttl CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 minutes')
);
CREATE INDEX auth_password_resets_user_recent ON public.auth_password_resets(user_id, created_at DESC);
CREATE INDEX auth_password_resets_expiration ON public.auth_password_resets(expires_at);

-- The definer, not pmo_app, owns the only ability to update existing password hashes.
-- Validate, consume, change password, revoke all sessions and audit atomically.
-- Safe under simultaneous reset requests: lock user first, then token, then check eligibility.
CREATE OR REPLACE FUNCTION public.pmo_redeem_password_reset(p_token_hash text, p_password_hash text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $reset$
DECLARE
  target_user uuid;
  reset_id uuid;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' OR
     p_password_hash IS NULL OR p_password_hash !~ '^\$2[aby]\$12\$[./A-Za-z0-9]{53}$' THEN
    RETURN false;
  END IF;
  SELECT user_id INTO target_user FROM public.auth_password_resets
  WHERE token_hash = p_token_hash LIMIT 1;
  IF target_user IS NULL THEN RETURN false; END IF;
  PERFORM 1 FROM public.users WHERE id = target_user AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT id INTO reset_id FROM public.auth_password_resets
    WHERE user_id = target_user AND token_hash = p_token_hash
      AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > now()
    FOR UPDATE;
  IF reset_id IS NULL THEN RETURN false; END IF;
  UPDATE public.users SET password_hash = p_password_hash, failed_attempts = 0, locked_until = NULL
    WHERE id = target_user AND is_active = true;
  DELETE FROM public.sessions WHERE user_id = target_user;
  UPDATE public.auth_password_resets SET consumed_at = now() WHERE id = reset_id;
  UPDATE public.auth_password_resets SET revoked_at = now()
    WHERE user_id = target_user AND id <> reset_id AND consumed_at IS NULL AND revoked_at IS NULL;
  INSERT INTO public.auth_events (user_id, action, detail)
    VALUES (target_user, 'password.reset.completed', 'all_sessions_revoked');
  RETURN true;
END;
$reset$;
-- Functions otherwise grant EXECUTE to PUBLIC by default. Block before deploying web routes.
REVOKE ALL ON FUNCTION public.pmo_redeem_password_reset(text, text) FROM PUBLIC;
