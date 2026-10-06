// Anti-cheat plausibility check: "large score, little playing time".
//
// Re-simulating the inputs proves the score is *reachable*, not that it was *played*.
// A bot can precompute a perfect run for the server-issued seed and submit it seconds
// after ats-start. Real play can't be that fast: the client advances the game by
// exactly one gravity step per getDropInterval() ms (150-700 ms), a piece only locks
// on a gravity step (soft-drop 'D' just moves it down a row), and the replay runs to
// game over exactly as the real game did. So the minimum real time of a run is the
// sum of those intervals over every tick, and the wall clock since the session was
// issued can never be shorter than that.
import { AtsEngine } from "./engine.ts";

// Real elapsed time must be at least this fraction of the computed minimum...
export const MIN_TIME_FACTOR = 0.9;
// ...with this much slack for clock skew between the DB (created_at) and the function.
export const CLOCK_GRACE_MS = 2000;

export type Timed =
  | { ok: true; score: number; ticks: number; minMs: number }
  | { ok: false; error: "bad_input_order" | "bad_input_action" };

// Same loop as AtsEngine.replay, plus the time bound. Only L/R/D are accepted: the
// UI has no hard-drop key, and 'drop' would lock a piece without a gravity tick.
export function replayTimed(seed: number, inputs: any[], maxTicks = 100_000): Timed {
  const byTick = new Map<number, string[]>();
  let prevT = 0;
  for (const ev of inputs) {
    const t = (ev?.t as number) | 0;
    const a = ev?.a;
    if (t < 0 || t < prevT) return { ok: false, error: "bad_input_order" };
    if (a !== "L" && a !== "R" && a !== "D") return { ok: false, error: "bad_input_action" };
    prevT = t;
    if (!byTick.has(t)) byTick.set(t, []);
    byTick.get(t)!.push(a);
  }

  const eng = new AtsEngine(seed);
  const applyAt = (t: number) => { for (const a of byTick.get(t) ?? []) eng.input(a); };

  applyAt(0);
  let minMs = 0, guard = 0;
  while (!eng.gameOver) {
    minMs += eng.getDropInterval();   // the client waits this long before each step
    eng.step();
    applyAt(eng.tick);
    if (++guard > maxTicks) break;    // DoS guard, same as AtsEngine.replay
  }
  return { ok: true, score: eng.score, ticks: eng.tick, minMs };
}

export function tooFast(minMs: number, elapsedMs: number): boolean {
  return elapsedMs + CLOCK_GRACE_MS < MIN_TIME_FACTOR * minMs;
}
