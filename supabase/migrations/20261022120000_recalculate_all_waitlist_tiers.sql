-- Recalculate all entries, not only the first 15, so people who leave the
-- top ten lose Platinum and receive the tier earned by their current status.
CREATE OR REPLACE FUNCTION public.recalculate_top_tiers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  WITH ranked AS (
    SELECT id, email_verified, sms_verified, referral_count,
      row_number() OVER (ORDER BY created_at DESC, id ASC) AS rank_number
    FROM public.waitlist
  ), desired_tiers AS (
    SELECT id,
      CASE
        WHEN rank_number <= 10 THEN 'platinum'
        WHEN referral_count >= 1 THEN 'gold'
        WHEN email_verified AND sms_verified THEN 'silver'
        ELSE 'bronze'
      END AS tier
    FROM ranked
  )
  UPDATE public.waitlist AS w
  SET tier = desired_tiers.tier, updated_at = now()
  FROM desired_tiers
  WHERE w.id = desired_tiers.id
    AND w.tier IS DISTINCT FROM desired_tiers.tier;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_top_tiers() FROM PUBLIC, anon, authenticated;

SELECT public.recalculate_top_tiers();
