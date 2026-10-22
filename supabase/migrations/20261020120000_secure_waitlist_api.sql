-- Replace anonymous table access with narrowly scoped RPCs. The public web
-- client must never read verification codes or update arbitrary waitlist rows.

DROP POLICY IF EXISTS "Anyone can read waitlist data" ON public.waitlist;
DROP POLICY IF EXISTS "Anyone can update waitlist data" ON public.waitlist;
DROP POLICY IF EXISTS "Anyone can insert new waitlist entries" ON public.waitlist;
DROP POLICY IF EXISTS "Users can read own waitlist data" ON public.waitlist;
DROP POLICY IF EXISTS "Users can update own email verification" ON public.waitlist;

REVOKE ALL PRIVILEGES ON TABLE public.waitlist FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.waitlist_email_exists(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.waitlist WHERE email = lower(trim(p_email)));
$$;

CREATE OR REPLACE FUNCTION public.waitlist_phone_exists(p_phone text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.waitlist WHERE phone = p_phone);
$$;

CREATE OR REPLACE FUNCTION public.create_waitlist_entry(
  p_email text,
  p_phone text,
  p_email_code text,
  p_sms_code text,
  p_referred_by_code text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_phone text := nullif(trim(p_phone), '');
  v_referral_code text;
  v_id uuid;
BEGIN
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR p_email_code IS NULL OR p_email_code !~ '^\d{6}$'
     OR (v_phone IS NOT NULL AND v_phone !~ '^\+[1-9][0-9]{7,14}$')
     OR (v_phone IS NOT NULL AND (p_sms_code IS NULL OR p_sms_code !~ '^\d{6}$')) THEN
    RAISE EXCEPTION 'Invalid waitlist details' USING ERRCODE = '22023';
  END IF;

  IF p_referred_by_code IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.waitlist WHERE referral_code = upper(trim(p_referred_by_code))
  ) THEN
    RAISE EXCEPTION 'Referral code not found' USING ERRCODE = '22023';
  END IF;

  LOOP
    v_referral_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    v_id := NULL;
    INSERT INTO public.waitlist (
      email, phone, email_verification_code, email_verification_code_expires_at,
      sms_verification_code, sms_verification_code_expires_at, referral_code,
      referred_by_code, email_verified, sms_verified, tier
    ) VALUES (
      v_email, v_phone, p_email_code, now() + interval '15 minutes',
      CASE WHEN v_phone IS NULL THEN NULL ELSE p_sms_code END,
      CASE WHEN v_phone IS NULL THEN NULL ELSE now() + interval '15 minutes' END,
      v_referral_code, nullif(upper(trim(p_referred_by_code)), ''), false, false, 'bronze'
    ) ON CONFLICT (referral_code) DO NOTHING
    RETURNING id INTO v_id;
    EXIT WHEN v_id IS NOT NULL;
  END LOOP;
END;
$$;

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
  UPDATE public.waitlist SET email_verification_code = p_code,
    email_verification_code_expires_at = now() + interval '15 minutes', updated_at = now()
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
  UPDATE public.waitlist SET sms_verification_code = p_code,
    sms_verification_code_expires_at = now() + interval '15 minutes', updated_at = now()
  WHERE phone = p_phone;
  RETURN jsonb_build_object('success', true, 'message', 'Verification code prepared');
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_waitlist_email_delivery(p_email text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.waitlist SET email_code_last_sent_at = now(), updated_at = now()
  WHERE email = lower(trim(p_email)) AND email_verification_code = p_code
    AND email_verification_code_expires_at > now()
    AND (email_code_last_sent_at IS NULL OR email_code_last_sent_at <= now() - interval '60 seconds');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Code is invalid, expired, or recently sent');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_waitlist_sms_delivery(p_phone text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.waitlist SET sms_code_last_sent_at = now(), updated_at = now()
  WHERE phone = p_phone AND sms_verification_code = p_code
    AND sms_verification_code_expires_at > now()
    AND (sms_code_last_sent_at IS NULL OR sms_code_last_sent_at <= now() - interval '60 seconds');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Code is invalid, expired, or recently sent');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_waitlist_email_code(p_email text, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.waitlist SET email_verified = true, email_verification_code = NULL,
    email_verification_code_expires_at = NULL, updated_at = now()
  WHERE email = lower(trim(p_email)) AND email_verification_code = p_code
    AND email_verification_code_expires_at > now();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid or expired verification code');
  END IF;
  RETURN jsonb_build_object('success', true, 'message', 'Email verified successfully');
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
BEGIN
  UPDATE public.waitlist SET sms_verified = true, sms_verification_code = NULL,
    sms_verification_code_expires_at = NULL, updated_at = now()
  WHERE phone = p_phone AND sms_verification_code = p_code
    AND sms_verification_code_expires_at > now()
  RETURNING email INTO v_email;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid or expired verification code');
  END IF;
  RETURN jsonb_build_object('success', true, 'message', 'SMS verified successfully', 'email', v_email);
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
BEGIN
  UPDATE public.waitlist SET email_verified = true, email_verification_code = NULL,
    email_verification_code_expires_at = NULL, updated_at = now()
  WHERE email = lower(trim(p_email)) AND email_verification_code = p_code
    AND email_verification_code_expires_at > now()
  RETURNING * INTO v_user;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid or expired login code');
  END IF;
  RETURN jsonb_build_object('success', true, 'message', 'Login successful', 'user',
    jsonb_build_object('email', v_user.email, 'phone', v_user.phone,
      'email_verified', v_user.email_verified, 'sms_verified', v_user.sms_verified));
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
  SELECT email_code_last_sent_at INTO v_last_sent FROM public.waitlist
  WHERE email = lower(trim(p_email));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Email not found');
  END IF;
  IF v_last_sent IS NOT NULL AND v_last_sent > now() - interval '60 seconds' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Please wait before requesting another code');
  END IF;
  UPDATE public.waitlist SET email_verification_code = p_code,
    email_verification_code_expires_at = now() + interval '15 minutes',
    updated_at = now()
  WHERE email = lower(trim(p_email));
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.waitlist_user_stats(p_email text)
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
  FROM public.waitlist w WHERE w.email = lower(trim(p_email));
$$;

CREATE OR REPLACE FUNCTION public.waitlist_leaderboard(p_limit integer DEFAULT 50, p_user_email text DEFAULT NULL)
RETURNS TABLE(id uuid, email text, tier text, referral_count integer, created_at timestamptz,
              "position" bigint, is_current_user boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH ranked AS (
    SELECT w.id,
      left(split_part(w.email, '@', 1), 1) || '***@' || split_part(w.email, '@', 2) AS masked_email,
      w.email AS full_email, w.tier, w.referral_count, w.created_at,
      row_number() OVER (ORDER BY w.created_at DESC, w.id ASC) AS rank
    FROM public.waitlist w
  )
  SELECT ranked.id, ranked.masked_email, ranked.tier, ranked.referral_count,
         ranked.created_at, ranked.rank,
         ranked.full_email = lower(trim(coalesce(p_user_email, '')))
  FROM ranked
  WHERE ranked.rank <= greatest(1, least(coalesce(p_limit, 50), 100))
  ORDER BY ranked.rank;
$$;

CREATE OR REPLACE FUNCTION public.waitlist_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT count(*) FROM public.waitlist; $$;

REVOKE ALL ON FUNCTION public.waitlist_email_exists(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.waitlist_phone_exists(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_waitlist_entry(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_waitlist_email_code(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_waitlist_sms_code(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_waitlist_email_delivery(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_waitlist_sms_delivery(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_waitlist_email_code(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_waitlist_sms_code(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_waitlist_login_code(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_waitlist_login_code(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.waitlist_user_stats(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.waitlist_leaderboard(integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.waitlist_count() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_waitlist_entry(text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_waitlist_email_code(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_waitlist_sms_code(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_waitlist_login_code(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.waitlist_user_stats(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.waitlist_leaderboard(integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.waitlist_count() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_waitlist_email_code(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_waitlist_sms_code(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_email_delivery(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_sms_delivery(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_waitlist_login_code(text, text) TO service_role;
