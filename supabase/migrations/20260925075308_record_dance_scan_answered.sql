-- Adds 'answered': the moment a scan server returns a valid score, recorded before the
-- score is written to dance_posts and dance_scans.
--
-- Until now the first record of a score was 'scored', which is written only after that
-- write succeeds. A scan server could therefore answer and have its score discarded —
-- the write fails, the attempt is requeued, and the next attempt calls the server
-- again — with nothing to show the score had ever arrived. 'answered' is that record.
--
-- It also splits the two halves of the wait: 'claimed' to 'answered' is the scan server,
-- 'answered' to 'scored' is this server's own persistence.
--
-- Note the vocabulary shift against the comment in 20260925073209: there, 'scored' was
-- described as "an external server answered". That description now belongs to
-- 'answered', and 'scored' means the attempt completed and the score is durable.

alter table public.dance_scan_events
  drop constraint dance_scan_events_event_check;

alter table public.dance_scan_events
  add constraint dance_scan_events_event_check
  check (event in ('claimed', 'answered', 'scored', 'requeued', 'fallback'));

-- Rollback (only while no 'answered' row exists, which the constraint would reject):
--   alter table public.dance_scan_events drop constraint dance_scan_events_event_check;
--   alter table public.dance_scan_events add constraint dance_scan_events_event_check
--     check (event in ('claimed', 'scored', 'requeued', 'fallback'));
