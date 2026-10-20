import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

async function adminRpc(name: string, args: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Server configuration missing");
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error("Database request failed");
  return response.json();
}
function secureCode() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(100000 + value[0] % 900000);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) return json({ error: "Valid phone number is required" }, 400);
    const resend = body.resend === true || body.resend === "true";
    let code = typeof body.code === "string" ? body.code : "";
    if (resend) {
      code = secureCode();
      const result = await adminRpc("update_waitlist_sms_code", { p_phone: phone, p_code: code });
      if (!result?.success) return json({ success: false, message: result?.message ?? "Could not prepare code" }, 429);
    }
    if (!/^\d{6}$/.test(code)) return json({ error: "A valid code is required" }, 400);
    const claim = await adminRpc("claim_waitlist_sms_delivery", { p_phone: phone, p_code: code });
    if (!claim?.success) return json({ success: false, message: "Could not send code. Please wait before trying again." }, 429);

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const from = Deno.env.get("TWILIO_PHONE_NUMBER");
    if (!accountSid || !authToken || !from) throw new Error("SMS provider unavailable");
    const formData = new URLSearchParams({
      From: from, To: phone,
      Body: `Nervont: Limited Collections - Your verification code is ${code}. It expires in 15 minutes.`,
    });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST", headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
    });
    if (!response.ok) return json({ error: "Failed to send SMS. Please try again later." }, 502);
    return json({ success: true, message: "Verification code sent to your phone" });
  } catch {
    return json({ error: "Failed to send SMS. Please try again later." }, 500);
  }
});
