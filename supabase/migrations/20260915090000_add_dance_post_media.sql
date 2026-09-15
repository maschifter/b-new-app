-- Derived media for a recorded dance post: the recording remuxed with the move's
-- music, a poster frame, and its blurhash placeholder. All three are produced by a
-- background worker after upload and stay off the scoring path, so every column is
-- nullable and a post without them keeps playing the original silent recording.

alter table public.dance_posts
  add column merged_video_path text,
  add column thumbnail_path text,
  add column blurhash text,
  -- Playhead position of the music track at the first recorded frame, measured on
  -- device. Null rows fall back to the computed timeline offset.
  add column audio_offset_ms integer;

alter table public.dance_posts
  add constraint dance_posts_audio_offset_check
  check (audio_offset_ms is null or audio_offset_ms >= 0);

-- Second table-as-queue, shaped like dance_scans so the two job types retry
-- independently and media state stays out of dance_posts.
create table public.dance_media_jobs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  owner_id uuid not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_run_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  -- Composite FK rather than a post_id reference plus a bare owner_id: the original
  -- dance_scans shape let the denormalized owner drift from its post, which
  -- 20260911081328_enforce_dance_scan_owner exists to remove.
  constraint dance_media_jobs_post_owner_fk
    foreign key (post_id, owner_id)
    references public.dance_posts (id, owner_id)
    on delete cascade,
  constraint dance_media_jobs_post_id_unique unique (post_id),
  constraint dance_media_jobs_status_check
    check (status in ('pending', 'processing', 'completed', 'failed')),
  constraint dance_media_jobs_attempts_check
    check (attempts >= 0)
);

-- Worker claim path, mirroring dance_scans_claim_idx.
create index dance_media_jobs_claim_idx
  on public.dance_media_jobs (next_run_at)
  where status = 'pending';

alter table public.dance_media_jobs enable row level security;

create trigger dance_media_jobs_set_updated_at
  before update on public.dance_media_jobs
  for each row execute procedure public.set_updated_at();
