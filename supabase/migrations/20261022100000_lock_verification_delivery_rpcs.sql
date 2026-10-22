-- These functions modify verification codes or mark them as sent. They must
-- only be callable by the Edge Functions using the service role key.
REVOKE ALL ON FUNCTION public.update_waitlist_email_code(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_waitlist_sms_code(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_waitlist_email_delivery(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_waitlist_sms_delivery(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_waitlist_email_code(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_waitlist_sms_code(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_email_delivery(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_sms_delivery(text, text) TO service_role;
