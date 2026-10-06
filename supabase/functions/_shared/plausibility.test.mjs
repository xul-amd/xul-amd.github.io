// Run: node supabase/functions/_shared/plausibility.test.mjs   (Node >= 22.18, strips .ts types)
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { replayTimed, tooFast } from "./plausibility.ts";

const { AtsEngine: ClientEngine } = createRequire(import.meta.url)("../../../tetris/engine.js");
const COLS = 10, ROWS = 15;

// Greedy bot that plays only what the UI can send (L/R/D) and tags inputs exactly like
// the client does. It stands in for a cheater precomputing a run for a known seed.
function botRun(seed, target = 100, maxPieces = 80) {
  const lock = (e) => { const lc = e.lockCount; while (e.lockCount === lc && !e.gameOver) e.step(); };
  const play = (pieces) => {
    const e = new ClientEngine(seed), inputs = [];
    for (const acts of pieces) {
      for (const a of acts) { const t = e.tick; if (e.input(a)) inputs.push({ t, a }); }
      lock(e); if (e.gameOver) break;
    }
    return { e, inputs };
  };
  const heur = (e) => {
    let adj = 0, maxH = 0;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (e.grid[y][x]) maxH = Math.max(maxH, ROWS - y);
      const c = e.grid[y][x], r = x + 1 < COLS ? e.grid[y][x + 1] : null;
      if (c && r && ((c.letter === "A" && r.letter === "T") || (c.letter === "T" && r.letter === "S"))) adj++;
    }
    return e.score * 1000 + adj * 40 - maxH * 3;
  };
  const pieces = [];
  for (let n = 0; n < maxPieces; n++) {
    let best = null;
    for (let k = -5; k <= 5; k++) {
      const acts = Array(Math.abs(k)).fill(k < 0 ? "L" : "R").concat(Array(ROWS + 2).fill("D"));
      const { e } = play(pieces.concat([acts]));
      if (e.gameOver) continue;
      const h = heur(e); if (!best || h > best.h) best = { h, acts, score: e.score };
    }
    if (!best) break;
    pieces.push(best.acts);
    if (best.score >= target) break;
  }
  return play(pieces).inputs;
}

let checked = 0, minSeen = Infinity;
for (let i = 0; i < 20; i++) {
  const seed = (Math.random() * 2 ** 32) >>> 0;
  const inputs = botRun(seed);
  const r = replayTimed(seed, inputs);
  assert.ok(r.ok, "bot inputs must be accepted");

  // 1) Server replay agrees with the client engine (parity), for L/R/D-only runs.
  assert.equal(r.score, ClientEngine.replay(seed, inputs), `score parity, seed ${seed}`);
  assert.ok(r.score >= 100, "bot should have scored");

  // 2) The attack: precomputed run submitted within seconds of ats-start is rejected...
  assert.ok(tooFast(r.minMs, 5_000), `5 s submit must be flagged (needs >= ${Math.round(r.minMs)} ms), seed ${seed}`);
  // ...a half-speed run is rejected, while a run at real gravity pace (or slower) passes.
  assert.ok(tooFast(r.minMs, r.minMs * 0.5), "half-speed run must be flagged");
  assert.ok(!tooFast(r.minMs, r.minMs), "real-pace run must pass");
  assert.ok(!tooFast(r.minMs, r.minMs * 3), "slow human run must pass");
  minSeen = Math.min(minSeen, r.minMs); checked++;
}

// 3) Hard drop is not something the UI can send: reject it outright.
assert.deepEqual(replayTimed(1, [{ t: 0, a: "drop" }]), { ok: false, error: "bad_input_action" });
// 4) Malformed input streams.
assert.deepEqual(replayTimed(1, [{ t: 5, a: "L" }, { t: 2, a: "R" }]), { ok: false, error: "bad_input_order" });
assert.deepEqual(replayTimed(1, [{ t: 0, a: "X" }]), { ok: false, error: "bad_input_action" });
// 5) Nothing but gravity (no inputs) is still a valid game, and must also take real time.
const idle = replayTimed(123, []);
assert.ok(idle.ok && idle.minMs > 5_000, "an idle top-out game takes real time too");

console.log(`OK: ${checked} bot runs; shortest legit-pace run needs >= ${Math.round(minSeen / 1000)} s of real time; idle game needs ${Math.round(idle.minMs / 1000)} s`);
