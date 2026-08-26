-- Imported dance content is managed through the server's secret-key client.
-- RLS is enabled without client policies intentionally.
create table public.dance_genres (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null,
  status text not null default 'draft',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint dance_genres_status_check
    check (status in ('draft', 'published'))
);

create index dance_genres_status_sort_order_idx
  on public.dance_genres (status, sort_order);

alter table public.dance_genres enable row level security;

create trigger dance_genres_set_updated_at
  before update on public.dance_genres
  for each row
  -- Preserve an explicitly supplied legacy timestamp and avoid changing it on
  -- an idempotent upsert whose values are already current.
  when (
    old.* is distinct from new.*
    and old.updated_at is not distinct from new.updated_at
  )
  execute procedure public.set_updated_at();

create table public.music_tracks (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  title text not null,
  artist text,
  audio_url text not null,
  thumbnail_url text,
  status text not null default 'draft',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint music_tracks_status_check
    check (status in ('draft', 'published'))
);

create index music_tracks_status_sort_order_idx
  on public.music_tracks (status, sort_order);

alter table public.music_tracks enable row level security;

create trigger music_tracks_set_updated_at
  before update on public.music_tracks
  for each row
  when (
    old.* is distinct from new.*
    and old.updated_at is not distinct from new.updated_at
  )
  execute procedure public.set_updated_at();

create table public.dance_moves (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  title text not null,
  description text,
  level integer not null default 1,
  bpm integer,
  thumbnail_url text,
  main_video_url text,
  pro_dancer_video_url text,
  pro_dancer_image_url text,
  dancer_tip_video_url text,
  dancer_tip_image_url text,
  presentation_video_url text,
  film_yourself_video_url text,
  -- No cascade: a track in use must be detached or replaced before deletion.
  music_id uuid references public.music_tracks (id),
  status text not null default 'draft',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint dance_moves_status_check
    check (status in ('draft', 'published')),
  constraint dance_moves_level_check
    check (level >= 1),
  constraint dance_moves_bpm_check
    check (bpm is null or bpm > 0)
);

create index dance_moves_status_sort_order_idx
  on public.dance_moves (status, sort_order, created_at desc);

create index dance_moves_music_id_idx
  on public.dance_moves (music_id);

alter table public.dance_moves enable row level security;

create trigger dance_moves_set_updated_at
  before update on public.dance_moves
  for each row
  when (
    old.* is distinct from new.*
    and old.updated_at is not distinct from new.updated_at
  )
  execute procedure public.set_updated_at();

create table public.dance_move_genres (
  dance_move_id uuid not null
    references public.dance_moves (id) on delete cascade,
  genre_id uuid not null
    references public.dance_genres (id) on delete cascade,
  primary key (dance_move_id, genre_id)
);

create index dance_move_genres_genre_id_idx
  on public.dance_move_genres (genre_id);

alter table public.dance_move_genres enable row level security;
