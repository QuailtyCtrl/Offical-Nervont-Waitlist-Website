-- Keep membership tiers consistent with the public leaderboard, which ranks
-- newest signups first and uses id as a deterministic tie-breaker.
CREATE OR REPLACE FUNCTION public.update_user_tier(user_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_email_verified boolean;
  v_sms_verified boolean;
  v_referral_count integer;
  v_created_at timestamptz;
  v_position bigint;
  v_new_tier text;
BEGIN
  SELECT id, email_verified, sms_verified, referral_count, created_at
  INTO v_user_id, v_email_verified, v_sms_verified, v_referral_count, v_created_at
  FROM public.waitlist
  WHERE email = lower(trim(user_email));

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT count(*) + 1 INTO v_position
  FROM public.waitlist
  WHERE created_at > v_created_at OR (created_at = v_created_at AND id < v_user_id);

  IF v_position <= 10 THEN
    v_new_tier := 'platinum';
  ELSIF v_referral_count >= 1 THEN
    v_new_tier := 'gold';
  ELSIF v_email_verified AND v_sms_verified THEN
    v_new_tier := 'silver';
  ELSE
    v_new_tier := 'bronze';
  END IF;

  UPDATE public.waitlist
  SET tier = v_new_tier, updated_at = now()
  WHERE id = v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_top_tiers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user record;
  v_position integer := 0;
  v_tier text;
BEGIN
  FOR v_user IN
    SELECT id, email_verified, sms_verified, referral_count
    FROM public.waitlist
    ORDER BY created_at DESC, id ASC
    LIMIT 15
  LOOP
    v_position := v_position + 1;
    IF v_position <= 10 THEN
      v_tier := 'platinum';
    ELSIF v_user.referral_count >= 1 THEN
      v_tier := 'gold';
    ELSIF v_user.email_verified AND v_user.sms_verified THEN
      v_tier := 'silver';
    ELSE
      v_tier := 'bronze';
    END IF;

    UPDATE public.waitlist SET tier = v_tier, updated_at = now() WHERE id = v_user.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.update_user_tier(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_top_tiers() FROM PUBLIC, anon, authenticated;

SELECT public.recalculate_top_tiers();
