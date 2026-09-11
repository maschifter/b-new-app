-- Consumer dance flow: a user's recorded attempt (dance_posts), its scan record
-- which doubles as the async job queue (dance_scans), and the beat-drop offset on
-- music_tracks consumed by the Record screen. RLS is enabled with no client
-- policies: every table is reached only through the server secret-key client,
-- matching the existing dance content tables.

-- Beat-drop offset (ms into the track where the choreography begins). Nullable →
-- treated as 0 (no seek). Backfilled by scripts/import-boogiz-dancemoves.mjs.
alter table public.music_tracks
  add column delay_before_avatar_dance integer;

alter table public.music_tracks
  add constraint music_tracks_delay_before_avatar_dance_check
  check (delay_before_avatar_dance is null or delay_before_avatar_dance >= 0);

-- A user's recorded attempt. video_path (the private-bucket object key) is the
-- source of truth; any playback/scan URL is a signed read URL resolved on demand.
create table public.dance_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  -- No cascade: a move with attempts must be handled explicitly before deletion.
  dance_move_id uuid not null references public.dance_moves (id),
  music_id uuid references public.music_tracks (id),
  video_path text,
  video_length_s numeric,
  status text not null default 'uploading',
  -- Displayed score = raw external match % (dance_scans.original_score), not the
  -- bonus-adjusted updated_score.
  score integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  -- lifecycle: uploading → uploaded → scoring (worker claim) → scored. The V1
  -- fallback always yields a terminal score, so 'failed' is unused — kept for
  -- post-V1 headroom.
  constraint dance_posts_status_check
    check (status in ('uploading', 'uploaded', 'scoring', 'scored', 'failed')),
  constraint dance_posts_score_check
    check (score is null or (score >= 0 and score <= 100))
);

create index dance_posts_owner_id_created_at_idx
  on public.dance_posts (owner_id, created_at desc);

create index dance_posts_dance_move_id_idx
  on public.dance_posts (dance_move_id);

alter table public.dance_posts enable row level security;

create trigger dance_posts_set_updated_at
  before update on public.dance_posts
  for each row execute procedure public.set_updated_at();

-- One scan record per post, which also carries the queue state: the row itself is
-- the job an in-process interval worker claims via a conditional UPDATE.
create table public.dance_scans (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.dance_posts (id) on delete cascade,
  owner_id uuid not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_run_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  original_score integer,
  updated_score integer,
  is_external_score boolean not null default false,
  error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint dance_scans_post_id_unique unique (post_id),
  constraint dance_scans_status_check
    check (status in ('pending', 'processing', 'completed', 'failed')),
  constraint dance_scans_attempts_check
    check (attempts >= 0),
  constraint dance_scans_original_score_check
    check (original_score is null or (original_score >= 0 and original_score <= 100))
);

-- Worker claim path: pending rows due to run, ordered by insertion.
create index dance_scans_claim_idx
  on public.dance_scans (next_run_at)
  where status = 'pending';

alter table public.dance_scans enable row level security;

create trigger dance_scans_set_updated_at
  before update on public.dance_scans
  for each row execute procedure public.set_updated_at();
