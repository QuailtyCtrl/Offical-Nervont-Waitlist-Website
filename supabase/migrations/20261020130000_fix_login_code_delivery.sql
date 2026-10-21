-- Login code issuance must not mark the code as delivered before the Edge
-- Function claims delivery. claim_waitlist_email_delivery stamps the time.
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
      updated_at = now()
  WHERE email = lower(trim(p_email));

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.issue_waitlist_login_code(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_waitlist_login_code(text, text) TO service_role;
