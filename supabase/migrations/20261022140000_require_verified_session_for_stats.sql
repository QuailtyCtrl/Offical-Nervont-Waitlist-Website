-- The old stats RPC accepted any email address. Replace that lookup with a
-- bearer token issued only after a valid email verification/login code.
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS session_token_hash text,
  ADD COLUMN IF NOT EXISTS session_token_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_waitlist_session_token_hash
  ON public.waitlist(session_token_hash)
  WHERE session_token_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.verify_waitlist_email_code(p_email text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempts smallint;
  v_session_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
BEGIN
  IF p_email IS NULL OR p_code IS NULL OR p_code !~ '^\d{6}$' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid or expired verification code');
  END IF;

  UPDATE public.waitlist
  SET email_verified = true,
      email_verification_code = NULL,
      email_verification_code_expires_at = NULL,
      email_code_attempts = 0,
      session_token_hash = md5(v_session_token),
      session_token_expires_at = now() + interval '30 days',
      updated_at = now()
  WHERE email = lower(trim(p_email)) AND email_verification_code = p_code
    AND email_verification_code_expires_at > now() AND email_code_attempts < 5;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'message', 'Email verified successfully', 'session_token', v_session_token);
  END IF;

  UPDATE public.waitlist
  SET email_code_attempts = LEAST(email_code_attempts + 1, 5), updated_at = now()
  WHERE email = lower(trim(p_email)) AND email_verification_code IS NOT NULL
    AND email_verification_code_expires_at > now() AND email_code_attempts < 5
  RETURNING email_code_attempts INTO v_attempts;

  IF v_attempts >= 5 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Too many incorrect attempts. Request a new code.');
  END IF;
  RETURN jsonb_build_object('success', false, 'message', 'Invalid or expired verification code');
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_waitlist_login_code(p_email text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user public.waitlist%ROWTYPE;
  v_attempts smallint;
  v_session_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
BEGIN
  IF p_email IS NULL OR p_code IS NULL OR p_code !~ '^\d{6}$' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid or expired login code');
  END IF;

  UPDATE public.waitlist
  SET email_verified = true,
      email_verification_code = NULL,
      email_verification_code_expires_at = NULL,
      email_code_attempts = 0,
      session_token_hash = md5(v_session_token),
      session_token_expires_at = now() + interval '30 days',
      updated_at = now()
  WHERE email = lower(trim(p_email)) AND email_verification_code = p_code
    AND email_verification_code_expires_at > now() AND email_code_attempts < 5
  RETURNING * INTO v_user;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'message', 'Login successful', 'session_token', v_session_token,
      'user', jsonb_build_object('email', v_user.email, 'phone', v_user.phone,
        'email_verified', v_user.email_verified, 'sms_verified', v_user.sms_verified));
  END IF;

  UPDATE public.waitlist
  SET email_code_attempts = LEAST(email_code_attempts + 1, 5), updated_at = now()
  WHERE email = lower(trim(p_email)) AND email_verification_code IS NOT NULL
    AND email_verification_code_expires_at > now() AND email_code_attempts < 5
  RETURNING email_code_attempts INTO v_attempts;

  IF v_attempts >= 5 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Too many incorrect attempts. Request a new code.');
  END IF;
  RETURN jsonb_build_object('success', false, 'message', 'Invalid or expired login code');
END;
$$;

DROP FUNCTION IF EXISTS public.waitlist_user_stats(text);

CREATE FUNCTION public.waitlist_user_stats(p_session_token text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'referral_code', w.referral_code,
    'tier', w.tier,
    'referral_count', w.referral_count,
    'position', (SELECT count(*) + 1 FROM public.waitlist newer
                 WHERE newer.created_at > w.created_at OR
                   (newer.created_at = w.created_at AND newer.id < w.id))
  )
  FROM public.waitlist w
  WHERE p_session_token IS NOT NULL
    AND w.session_token_hash = md5(p_session_token)
    AND w.session_token_expires_at > now();
$$;

REVOKE ALL ON FUNCTION public.verify_waitlist_email_code(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_waitlist_login_code(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.waitlist_email_exists(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.waitlist_phone_exists(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.waitlist_user_stats(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_waitlist_email_code(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_waitlist_login_code(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.waitlist_user_stats(text) TO anon, authenticated;
