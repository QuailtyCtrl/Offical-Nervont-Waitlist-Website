-- Count referrals only after the referred person verifies their email.
-- Recompute old totals as part of the migration to remove unverified signups.
CREATE OR REPLACE FUNCTION public.handle_referral_increment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- A new signup affects leaderboard rank even before verification.
  PERFORM public.recalculate_top_tiers();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_verification_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_referrer_email text;
BEGIN
  IF NEW.email_verified IS DISTINCT FROM OLD.email_verified
     OR NEW.sms_verified IS DISTINCT FROM OLD.sms_verified THEN
    PERFORM public.update_user_tier(NEW.email);
  END IF;

  IF NEW.email_verified IS TRUE
     AND OLD.email_verified IS DISTINCT FROM TRUE
     AND NEW.referred_by_code IS NOT NULL THEN
    UPDATE public.waitlist
    SET referral_count = referral_count + 1,
        updated_at = now()
    WHERE referral_code = NEW.referred_by_code
    RETURNING email INTO v_referrer_email;

    IF FOUND THEN
      PERFORM public.update_user_tier(v_referrer_email);
      PERFORM public.recalculate_top_tiers();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_referral_increment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_verification_update() FROM PUBLIC, anon, authenticated;

UPDATE public.waitlist AS referrer
SET referral_count = (
  SELECT count(*)::integer
  FROM public.waitlist AS referred
  WHERE referred.referred_by_code = referrer.referral_code
    AND referred.email_verified = true
),
updated_at = now()
WHERE referrer.referral_count IS DISTINCT FROM (
  SELECT count(*)::integer
  FROM public.waitlist AS referred
  WHERE referred.referred_by_code = referrer.referral_code
    AND referred.email_verified = true
);

SELECT public.recalculate_top_tiers();
