-- Durable provenance for dance scores. `dance_scans` already records how a score was
-- reached, but it is deleted with its post: automatically in Stepz, which uploads a
-- recording only to have it scored, and on request in b-new-app. So the evidence for
-- the one question a surprising score raises — was this scored by a scan server or
-- generated as a fallback, by which server, on which try — is gone within seconds of
-- the score being read.
--
-- This table is that evidence, written by the scan worker and nothing else. One row per
-- decision, appended and never updated, so a retried scan leaves the whole sequence
-- rather than only its last state.

create table public.dance_scan_events (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately not foreign keys. `dance_posts` and `dance_scans` are both deleted
  -- while this row must survive, so a reference to either would take it with them —
  -- the exact failure this table exists to prevent. The ids stay as plain columns:
  -- they remain the correlation key against a scan server's own logs, which receive
  -- `post_id` as their `jobid`.
  post_id uuid not null,
  scan_id uuid not null,
  owner_id uuid not null,
  dance_move_id uuid,
  -- claimed: the worker took the job. scored: an external server answered.
  -- requeued: this attempt failed and the job went back to the queue.
  -- fallback: attempts were exhausted and the worker generated the score itself.
  event text not null,
  -- 1-based, matching the worker's log lines: attempt 1 is the first run of a scan.
  attempt integer not null,
  -- Null on 'claimed' and 'requeued', which reach no score. False on 'fallback' —
  -- the column that answers "did a scan server produce this number".
  is_external_score boolean,
  -- The score as produced (raw_score) and after the first-time bracket bonus
  -- (updated_score). Both recorded because only raw_score reaches the client today.
  raw_score integer,
  updated_score integer,
  is_first_time boolean,
  -- Position in the configured scan-server list and the URL at that position, so a
  -- score is attributable even after the configured list changes.
  scan_server_index integer,
  scan_server_url text,
  scan_duration_ms integer,
  -- Every server tried in the attempt, in order, each with its own status, duration
  -- and error. An array rather than columns: the list is as long as the configured
  -- server list and is read as a whole, never filtered on.
  server_attempts jsonb,
  error text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint dance_scan_events_event_check
    check (event in ('claimed', 'scored', 'requeued', 'fallback')),
  constraint dance_scan_events_attempt_check
    check (attempt >= 1),
  constraint dance_scan_events_raw_score_check
    check (raw_score is null or (raw_score >= 0 and raw_score <= 100))
);

-- No updated_at and no trigger: an appended row is never modified.

-- The whole history of one recording, in order — the lookup that starts from a score
-- the user is asking about.
create index dance_scan_events_post_id_created_at_idx
  on public.dance_scan_events (post_id, created_at);

-- "What has this user been scored recently", the second way in when a post id is not
-- to hand.
create index dance_scan_events_owner_id_created_at_idx
  on public.dance_scan_events (owner_id, created_at desc);

-- Partial: fallback scores are the rare event and the one worth monitoring, so the
-- index covers them alone rather than the whole table.
create index dance_scan_events_fallback_idx
  on public.dance_scan_events (created_at desc)
  where event = 'fallback';

-- RLS on with no policies, matching dance_posts and dance_scans: this table is reached
-- only through the server's secret-key client. It holds no user-facing data and a
-- client must never read another owner's scoring history.
alter table public.dance_scan_events enable row level security;

comment on table public.dance_scan_events is
  'Append-only provenance for dance scores: which server produced a score, on which attempt, and whether it was a generated fallback. Outlives the dance_posts and dance_scans rows it refers to, which is why it holds no foreign keys to them.';

-- Rollback:
--   drop table if exists public.dance_scan_events;
