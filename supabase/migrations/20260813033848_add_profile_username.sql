create sequence public.profile_username_seq;

-- The default covers both existing rows and concurrent signups still using the
-- current trigger, which omits username from its insert.
alter table public.profiles
  add column username text not null default (
    'dancer-' || lpad(nextval('public.profile_username_seq'::regclass)::text, 6, '0')
  );

alter sequence public.profile_username_seq owned by public.profiles.username;

alter table public.profiles
  add constraint profiles_username_unique unique (username);

-- Embed prerequisite: let PostgREST join profiles(username) from a room row.
-- Safe because every owner has a profile (signup trigger). After this, owner_id
-- carries TWO FKs (auth.users + profiles); the embed profiles(username) stays
-- unambiguous because this is the only FK targeting profiles. If PostgREST still
-- can't resolve it, disambiguate with the constraint name:
--   profiles!studio_rooms_owner_profile_fk(username)
alter table public.studio_rooms
  add constraint studio_rooms_owner_profile_fk
  foreign key (owner_id) references public.profiles(id) on delete cascade;

-- Index supporting the Explore query (rooms with items only)
create index studio_rooms_explore_idx
  on public.studio_rooms (updated_at desc, id desc)
  where map <> '{}'::jsonb;
