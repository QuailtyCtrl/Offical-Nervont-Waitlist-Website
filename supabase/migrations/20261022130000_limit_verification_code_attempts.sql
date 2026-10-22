-- Limit guesses against six-digit email/SMS verification codes. A fresh code
-- resets its own counter; the fifth incorrect guess blocks that code.
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS email_code_attempts smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sms_code_attempts smallint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.update_waitlist_email_code(p_email text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_last_sent timestamptz;
BEGIN
  IF p_email IS NULL OR p_code IS NULL OR p_code !~ '^\d{6}$' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid verification code');
  END IF;

  SELECT email_code_last_sent_at INTO v_last_sent
  FROM public.waitlist WHERE email = lower(trim(p_email));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Email not found');
  END IF;
  IF v_last_sent IS NOT NULL AND v_last_sent > now() - interval '60 seconds' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Please wait before resending');
  END IF;

  UPDATE public.waitlist
  SET email_verification_code = p_code,
      email_verification_code_expires_at = now() + interval '15 minutes',
      email_code_attempts = 0,
      updated_at = now()
  WHERE email = lower(trim(p_email));
  RETURN jsonb_build_object('success', true, 'message', 'Verification code prepared');
END;
$$;

CREATE OR REPLACE FUNCTION public.update_waitlist_sms_code(p_phone text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_last_sent timestamptz;
BEGIN
  IF p_phone IS NULL OR p_code IS NULL OR p_code !~ '^\d{6}$' OR p_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid verification details');
  END IF;

  SELECT sms_code_last_sent_at INTO v_last_sent
  FROM public.waitlist WHERE phone = p_phone;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Phone number not found');
  END IF;
  IF v_last_sent IS NOT NULL AND v_last_sent > now() - interval '60 seconds' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Please wait before resending');
  END IF;

  UPDATE public.waitlist
  SET sms_verification_code = p_code,
      sms_verification_code_expires_at = now() + interval '15 minutes',
      sms_code_attempts = 0,
      updated_at = now()
  WHERE phone = p_phone;
  RETURN jsonb_build_object('success', true, 'message', 'Verification code prepared');
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_waitlist_login_code(p_email text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_last_sent timestamptz;
BEGIN
  IF p_email IS NULL OR p_code IS NULL OR p_code !~ '^\d{6}$' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid login code');
  END IF;

  SELECT email_code_last_sent_at INTO v_last_sent
  FROM public.waitlist WHERE email = lower(trim(p_email));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Email not found');
  END IF;
  IF v_last_sent IS NOT NULL AND v_last_sent > now() - interval '60 seconds' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Please wait before requesting another code');
  END IF;

  UPDATE public.waitlist
  SET email_verification_code = p_code,
      email_verification_code_expires_at = now() + interval '15 minutes',
      email_code_attempts = 0,
      updated_at = now()
  WHERE email = lower(trim(p_email));
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_waitlist_email_code(p_email text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempts smallint;
BEGIN
  IF p_email IS NULL OR p_code IS NULL OR p_code !~ '^\d{6}$' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid or expired verification code');
  END IF;

  UPDATE public.waitlist
  SET email_verified = true, email_verification_code = NULL,
      email_verification_code_expires_at = NULL, email_code_attempts = 0,
      updated_at = now()
  WHERE email = lower(trim(p_email)) AND email_verification_code = p_code
    AND email_verification_code_expires_at > now() AND email_code_attempts < 5;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'message', 'Email verified successfully');
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

CREATE OR REPLACE FUNCTION public.verify_waitlist_sms_code(p_phone text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
  v_attempts smallint;
BEGIN
  IF p_phone IS NULL OR p_code IS NULL OR p_code !~ '^\d{6}$' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid or expired verification code');
  END IF;

  UPDATE public.waitlist
  SET sms_verified = true, sms_verification_code = NULL,
      sms_verification_code_expires_at = NULL, sms_code_attempts = 0,
      updated_at = now()
  WHERE phone = p_phone AND sms_verification_code = p_code
    AND sms_verification_code_expires_at > now() AND sms_code_attempts < 5
  RETURNING email INTO v_email;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'message', 'SMS verified successfully', 'email', v_email);
  END IF;

  UPDATE public.waitlist
  SET sms_code_attempts = LEAST(sms_code_attempts + 1, 5), updated_at = now()
  WHERE phone = p_phone AND sms_verification_code IS NOT NULL
    AND sms_verification_code_expires_at > now() AND sms_code_attempts < 5
  RETURNING sms_code_attempts INTO v_attempts;

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
BEGIN
  IF p_email IS NULL OR p_code IS NULL OR p_code !~ '^\d{6}$' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid or expired login code');
  END IF;

  UPDATE public.waitlist
  SET email_verified = true, email_verification_code = NULL,
      email_verification_code_expires_at = NULL, email_code_attempts = 0,
      updated_at = now()
  WHERE email = lower(trim(p_email)) AND email_verification_code = p_code
    AND email_verification_code_expires_at > now() AND email_code_attempts < 5
  RETURNING * INTO v_user;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'message', 'Login successful', 'user',
      jsonb_build_object('email', v_user.email, 'phone', v_user.phone,
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

REVOKE ALL ON FUNCTION public.update_waitlist_email_code(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_waitlist_sms_code(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_waitlist_login_code(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_waitlist_email_code(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_waitlist_sms_code(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_waitlist_login_code(text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_waitlist_email_code(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_waitlist_sms_code(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_waitlist_login_code(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_waitlist_email_code(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_waitlist_sms_code(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_waitlist_login_code(text, text) TO anon, authenticated;
