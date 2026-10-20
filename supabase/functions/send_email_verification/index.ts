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
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Valid email is required" }, 400);
    const login = body.login === true || body.login === "true";
    const resend = body.resend === true || body.resend === "true";
    let code = typeof body.code === "string" ? body.code : "";
    if (login || resend) {
      code = secureCode();
      const result = await adminRpc(login ? "issue_waitlist_login_code" : "update_waitlist_email_code", {
        p_email: email, p_code: code,
      });
      if (!result?.success) return json({ success: false, message: result?.message ?? "Could not prepare code" }, 429);
    }
    if (!/^\d{6}$/.test(code)) return json({ error: "A valid code is required" }, 400);
    const claim = await adminRpc("claim_waitlist_email_delivery", { p_email: email, p_code: code });
    if (!claim?.success) return json({ success: false, message: "Could not send code. Please wait before trying again." }, 429);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("Email provider unavailable");
    const subject = login ? "Your Nervont login code" : "Your Nervont verification code";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "verify@nervont.store", to: email, subject,
        html: `<p>Your ${login ? "login" : "verification"} code is <strong>${code}</strong>.</p><p>It expires in 15 minutes. If you did not request it, ignore this email.</p>`,
      }),
    });
    if (!response.ok) return json({ error: "Failed to send email. Please try again later." }, 502);
    return json({ success: true, message: login ? "Login code sent to your email" : "Verification code sent" });
  } catch {
    return json({ error: "Failed to send email. Please try again later." }, 500);
  }
});
