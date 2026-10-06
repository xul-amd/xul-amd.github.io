-- ATSsemble anti-cheat hardening.
-- Run this in the Supabase SQL editor (Dashboard → SQL → New query).
-- After this, the public anon key can READ the leaderboard but cannot write to
-- it. All score writes go exclusively through the ats-submit edge function,
-- which uses the service-role key and re-computes the score from replayed inputs.

-- 1) Sessions: one row per game start, single-use, server-issued seed.
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  seed bigint not null,
  created_at timestamptz not null default now(),
  used boolean not null default false,
  ip text
);
create index if not exists sessions_ip_created_idx on public.sessions (ip, created_at);

-- RLS on, with NO anon/authenticated policies => only the service role (edge
-- functions) can touch this table. The browser never reads or writes it.
alter table public.sessions enable row level security;
revoke all on public.sessions from anon, authenticated;

-- 2) Scores: anon may READ (leaderboard), never WRITE.
alter table public.scores enable row level security;

drop policy if exists scores_anon_insert on public.scores;   -- remove any insert policy
drop policy if exists scores_insert     on public.scores;
drop policy if exists scores_anon_select on public.scores;

create policy scores_anon_select on public.scores
  for select to anon using (true);

revoke insert, update, delete on public.scores from anon, authenticated;
grant  select on public.scores to anon;
-- Supabase's defaults also grant TRUNCATE/REFERENCES/TRIGGER; the app only needs SELECT.
revoke truncate, references, trigger on public.scores from anon, authenticated;

-- 3) Remove the old exploitable RPC the browser used to call directly.
--    (Drop every signature it may have been created with.)
drop function if exists public.submit_score(text, int, int, int);
drop function if exists public.submit_score(text, integer, integer, integer);
drop function if exists public.submit_score(p_name text, p_score int, p_lock_count int, p_elapsed_seconds int);

-- 4) Optional hygiene: purge stale/used sessions periodically (manual or cron).
-- delete from public.sessions where created_at < now() - interval '1 day';
