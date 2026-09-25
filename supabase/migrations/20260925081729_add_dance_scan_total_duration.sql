-- `scan_duration_ms` records the call to the server that answered, and only that call.
-- A failover ahead of it is not counted, so a 90-second timeout followed by a fast
-- answer is recorded as the fast answer alone: the column understates the wait by two
-- orders of magnitude in exactly the case worth investigating.
--
-- The whole span is recoverable from server_attempts today — sum its durations and add
-- a second per failover — but a number that must be reassembled by hand, with a
-- constant nobody remembers, is one that will be read wrong.
--
-- Nullable and backfill-free on purpose: rows written before this column existed do not
-- know their own total, and deriving one from server_attempts would record a guess as a
-- measurement. A null here means "written before the column", not "took no time".
alter table public.dance_scan_events
  add column total_scan_ms integer;

comment on column public.dance_scan_events.scan_duration_ms is
  'Duration of the call to the scan server that answered, excluding any failover ahead of it. Null when no server answered.';

comment on column public.dance_scan_events.total_scan_ms is
  'Duration of the whole scan call: every server tried, plus the delay between them. The number to read for how long scoring took. Null on rows written before the column existed, and on events that never called a scan server.';

-- Rollback:
--   alter table public.dance_scan_events drop column total_scan_ms;
