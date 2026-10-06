# ATSsemble — Server-Authoritative Anti-Cheat

The leaderboard prize is protected by making the **server** the sole authority on
scores. The browser is fully public (GitHub Pages serves readable source, and no
encryption/obfuscation can change that), so we never trust it:

- The anon key can only **read** the `scores` table (RLS). It cannot insert.
- Every score is written by the `ats-submit` edge function, which **re-simulates
  the whole game** from the player's recorded inputs using the same deterministic
  engine the browser ran (`_shared/engine.ts` ≡ `tetris/engine.js`). It ignores
  any score the client claims. Cheating therefore requires submitting inputs that
  *actually* achieve the score — i.e. genuinely playing well.
- Seeds are server-issued and single-use, so runs can't be precomputed offline or
  replayed twice.

## One-time setup

1. **Run the SQL** in `anti-cheat.sql` (Dashboard → SQL editor). This creates the
   `sessions` table, locks down `scores`, and drops the old `submit_score` RPC.

2. **Install the Supabase CLI** and link the project:
   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref pmgfmymtavhjfynoyupv
   ```

3. **Deploy the edge functions** (public — the game calls them without a JWT):
   ```bash
   supabase functions deploy ats-start  --no-verify-jwt
   supabase functions deploy ats-submit --no-verify-jwt
   ```
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically into
   deployed functions — no manual secrets needed.

4. The frontend already points at `https://<ref>.functions.supabase.co` via
   `window.ATS_FN_BASE` in `tetris/config.js`. Adjust if you use a custom domain.

## Keeping the engine in sync

`tetris/engine.js` (browser) and `supabase/functions/_shared/engine.ts` (server)
**must contain identical logic** or honest replays will be rejected. They are the
same file; if you change game rules, update both.

## Local testing

```bash
supabase start                 # local stack
supabase functions serve       # serve ats-start / ats-submit locally
```
Point `window.ATS_FN_BASE` at the local functions URL while testing.

## Cheat attempts that now fail

- `supabase.rpc('submit_score', {...})` from the console → RPC removed.
- Direct `insert into scores` with the anon key → blocked by RLS.
- POST `ats-submit` with a tampered high `score` field → ignored; server replays
  the real inputs.
- Empty/garbage `inputs` → low/zero score, not a winning value.
- Reusing a `sessionId` → rejected (`session_used`).
- Replaying another seed's inputs → `seed_mismatch` / low score.
- Precomputing a run with a bot and submitting it seconds after `ats-start` →
  `too_fast` (422). Gravity gates real play, so the server totals the minimum real
  time of the replay (sum of `getDropInterval()` over every tick, incl. the ticks to
  game over) and rejects if the time since the session was issued is shorter
  (`_shared/plausibility.ts`; test: `node _shared/plausibility.test.mjs`). Rejections
  are logged as `too_fast` in the function logs.
- Hard-drop (`drop`) inputs, which the UI can't send and which skip gravity → rejected.

## Credits

Tetris game icon by chrisbanks2 — https://icon-icons.com/authors/29-chrisbanks2
