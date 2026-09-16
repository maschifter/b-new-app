-- Anonymous sign-ins (apps/edu) create an auth.users row with email = null, which the
-- existing handle_new_user() insert cannot satisfy: profiles.email is not null. Skip the
-- insert for those users instead of widening the column, which would ripple into the
-- UserProfile DTO and both consuming apps.
--
-- The two-column insert stays legal only because profiles.username carries the
-- 'dancer-NNNNNN' default from 20260813033848_add_profile_username.sql. Dropping or
-- tightening that default breaks the signup path silently.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.email is not null then
    insert into public.profiles (id, email)
    values (new.id, new.email)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

-- Anonymous -> permanent conversion is an UPDATE on auth.users, which the insert trigger
-- above never sees. Without this branch a converted user would keep running without a
-- profile row. The when clause keeps it off the hot path: auth.users is updated on every
-- sign-in, and only an email transition matters here.
create function public.handle_user_identified()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_identified
  after update of email on auth.users
  for each row
  when (old.email is null and new.email is not null)
  execute procedure public.handle_user_identified();

-- Corrects the invariant recorded on studio_rooms_owner_profile_fk in
-- 20260813033848_add_profile_username.sql. "Every owner has a profile (signup trigger)"
-- is false from here on: anonymous users have none. The constraint still holds because
-- studio rooms are an apps/mobile surface and apps/mobile has no anonymous sign-in, so
-- every studio_rooms.owner_id is an identified user. An anonymous owner would now be
-- rejected by this FK rather than silently accepted; that is the intended behavior.
comment on constraint studio_rooms_owner_profile_fk on public.studio_rooms is
  'Requires an identified (non-anonymous) owner: profiles rows exist only for auth.users with an email. Also the PostgREST embed prerequisite for profiles(username).';

-- Rollback: the pre-change state is an unconditional insert plus no update trigger.
--   drop trigger if exists on_auth_user_identified on auth.users;
--   drop function if exists public.handle_user_identified();
--   create or replace function public.handle_new_user()
--   returns trigger language plpgsql security definer set search_path = '' as $$
--   begin
--     insert into public.profiles (id, email) values (new.id, new.email);
--     return new;
--   end; $$;
-- Rolling back while anonymous sign-ins are still enabled in the dashboard makes every
-- anonymous sign-in fail at the trigger, so disable that switch first. Profile rows
-- created by the update trigger are left in place; they are indistinguishable from rows
-- the insert trigger would have written.
