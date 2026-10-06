// ats-submit — the ONLY path that writes to the scores table.
//
// It ignores any score the client claims and instead RE-SIMULATES the game from
// the recorded inputs using the exact same deterministic engine the browser ran.
// To post a high score a cheater must therefore submit an input sequence that
// genuinely achieves it — i.e. actually play well. The anon key cannot insert
// into scores at all (RLS); this function uses the service-role key.
//
// Deploy: supabase functions deploy ats-submit --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { replayTimed, tooFast, type Timed } from "../_shared/plausibility.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_INPUTS = 200_000;     // DoS guard: absurd runs are rejected
const MAX_TICKS = 100_000;      // matches engine replay guard
const SESSION_TTL_MS = 30 * 60 * 1000; // a session must be redeemed within 30 min
const MAX_NAME_LEN = 40;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const { sessionId, seed, name, inputs } = body ?? {};
  if (!sessionId || typeof seed !== "number") return json({ error: "missing_fields" }, 400);
  if (!Array.isArray(inputs)) return json({ error: "bad_inputs" }, 400);
  if (inputs.length > MAX_INPUTS) return json({ error: "too_many_inputs" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Load the session; it must exist, be unused, fresh, and match the seed.
  const { data: sess, error: sErr } = await admin
    .from("sessions")
    .select("id, seed, used, created_at")
    .eq("id", sessionId)
    .single();
  if (sErr || !sess) return json({ error: "session_not_found" }, 404);
  if (sess.used) return json({ error: "session_used" }, 409);
  if ((sess.seed >>> 0) !== (seed >>> 0)) return json({ error: "seed_mismatch" }, 400);
  if (Date.now() - new Date(sess.created_at).getTime() > SESSION_TTL_MS) {
    return json({ error: "session_expired" }, 410);
  }

  // Atomically claim the session so the same run can't be submitted twice.
  const { data: claimed, error: cErr } = await admin
    .from("sessions")
    .update({ used: true })
    .eq("id", sessionId)
    .eq("used", false)
    .select("id")
    .single();
  if (cErr || !claimed) return json({ error: "session_used" }, 409);

  // Authoritative score: replay the inputs through the shared engine.
  let timed: Timed;
  try {
    timed = replayTimed(seed >>> 0, inputs, MAX_TICKS);
  } catch (_) {
    return json({ error: "invalid_replay" }, 400);
  }
  if (!timed.ok) return json({ error: "invalid_replay" }, 400);
  const score = timed.score;
  if (!Number.isFinite(score) || score < 0) return json({ error: "invalid_replay" }, 400);

  const cleanName = String(name ?? "anon").trim().slice(0, MAX_NAME_LEN) || "anon";

  // Audit record. Best-effort: a logging failure must never block or fail a score.
  const elapsedMs = Date.now() - new Date(sess.created_at).getTime();
  const logSubmission = async (status: "accepted" | "too_fast", scoreId: number | null) => {
    try {
      const xff = req.headers.get("x-forwarded-for");
      await admin.from("submission_log").insert({
        status, session_id: sessionId, score_id: scoreId, name: cleanName,
        ip: (xff ? xff.split(",")[0] : "").trim() || null,
        score, ticks: timed.ticks, inputs_n: inputs.length,
        min_ms: Math.round(timed.minMs), elapsed_ms: Math.round(elapsedMs), seed: seed >>> 0,
        inputs: status === "accepted" ? inputs : inputs.slice(0, 2000),
      });
    } catch (_) { /* non-fatal */ }
  };

  // Plausibility: the run can't have been played faster than gravity allows.
  if (tooFast(timed.minMs, elapsedMs)) {
    console.warn(JSON.stringify({
      event: "too_fast", sessionId, name: cleanName,
      score, ticks: timed.ticks, inputs: inputs.length, minMs: Math.round(timed.minMs), elapsedMs,
    }));
    await logSubmission("too_fast", null);
    return json({ error: "too_fast" }, 422);
  }

  const { data: ins, error: insErr } = await admin
    .from("scores").insert({ name: cleanName, score }).select("id").single();
  if (insErr) return json({ error: "db_insert" }, 500);
  await logSubmission("accepted", ins?.id ?? null);

  // Rank = how many scores beat this one, + 1.
  let rank: number | null = null;
  try {
    const { count } = await admin
      .from("scores")
      .select("id", { count: "exact", head: true })
      .gt("score", score);
    rank = (count ?? 0) + 1;
  } catch (_) { /* rank is best-effort */ }

  return json({ ok: true, score, rank });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}
