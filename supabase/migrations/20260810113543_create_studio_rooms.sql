-- A user's studio decoration, persisted as a versioned snapshot.
-- One row per user for now; drop the unique(owner_id) constraint later to
-- support multiple rooms per user without changing the primary key.
create table public.studio_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  version integer not null,
  template_id text not null,
  map jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (owner_id)
);

-- Defense in depth: the server uses the secret key and bypasses RLS, but these
-- policies keep a room private to its owner if it is ever read with an anon key.
alter table public.studio_rooms enable row level security;

create policy "Owner can read their own room"
on public.studio_rooms
for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy "Owner can insert their own room"
on public.studio_rooms
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy "Owner can update their own room"
on public.studio_rooms
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

-- Keep updated_at fresh on every write so last-write-wins sync can compare it.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger studio_rooms_set_updated_at
  before update on public.studio_rooms
  for each row execute procedure public.set_updated_at();
