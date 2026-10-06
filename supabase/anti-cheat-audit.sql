-- ATSsemble audit log. Run once (Dashboard -> SQL editor, or `supabase db query --linked -f`).
-- One row per scored submission and per rejected "too fast" submission, with the full
-- input log so a suspicious score can be replayed and reviewed before a prize is paid.
-- Private: RLS on and no anon/authenticated access (only the edge functions' service role).

create table if not exists public.submission_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  status      text   not null,          -- 'accepted' | 'too_fast'
  session_id  uuid,
  score_id    bigint,                   -- scores.id when accepted
  name        text,
  ip          text,
  score       int,                      -- server-replayed score
  ticks       int,
  inputs_n    int,                      -- number of inputs submitted
  min_ms      int,                      -- minimum real time the run needs (gravity bound)
  elapsed_ms  int,                      -- real time from ats-start to submit
  seed        bigint,
  inputs      jsonb                     -- full log for accepted; first 2000 for rejected
);
create index if not exists submission_log_name_idx   on public.submission_log (name, created_at);
create index if not exists submission_log_status_idx on public.submission_log (status, created_at);
create index if not exists submission_log_score_idx  on public.submission_log (score desc);

alter table public.submission_log enable row level security;
revoke all on public.submission_log from anon, authenticated;

-- Review helper: top accepted scores, with how close each came to the minimum possible time.
-- ratio near 1.0 = played flat out at gravity speed (bot-like); humans are usually well above.
-- select id, name, score, inputs_n, round(elapsed_ms/1000.0) as secs,
--        round(elapsed_ms::numeric / nullif(min_ms,0), 2) as ratio
--   from public.submission_log where status = 'accepted' order by score desc limit 20;
