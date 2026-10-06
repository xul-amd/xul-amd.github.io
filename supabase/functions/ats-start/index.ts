// ats-start — issues a single-use {sessionId, seed} for one game.
//
// The seed is generated server-side and stored, so a player cannot pre-compute a
// favourable run offline against a chosen seed, and each session can be redeemed
// exactly once (see ats-submit, which marks it used).
//
// Deploy: supabase functions deploy ats-start --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0] : "").trim() || "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const ip = clientIp(req);

  // Light per-IP rate limit: cap brand-new sessions in the last minute.
  try {
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", since);
    if ((count ?? 0) > 30) return json({ error: "rate_limited" }, 429);
  } catch (_) { /* non-fatal */ }

  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const { data, error } = await admin
    .from("sessions")
    .insert({ seed, ip })
    .select("id")
    .single();

  if (error) return json({ error: "db" }, 500);
  return json({ sessionId: data.id, seed });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}
