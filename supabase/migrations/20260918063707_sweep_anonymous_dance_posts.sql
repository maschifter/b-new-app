-- Retention backstop for apps/edu (Stepz). A Stepz recording is uploaded only so the
-- scan worker can score it; the app deletes the post once it has read the score. That
-- delete is fail-soft on the client, so an app killed between the score and the delete
-- leaves the row and its three storage objects behind forever. This is the server side
-- of that cleanup: the candidate query only, because the deletion itself already exists
-- in the service (`deleteRecordedPost`) and must not be written a second time.
--
-- The discriminator is `auth.users.is_anonymous`: apps/mobile has no anonymous sign-in
-- (see 20260916131240_allow_anonymous_users.sql), so an anonymous owner is a Stepz owner
-- and nothing else. Read here rather than captured from the JWT at write time, because a
-- claim recorded at write time cannot classify the posts that already exist.

-- Supports the sweep's own predicate: terminal rows ordered by the moment they became
-- terminal. Partial, so it indexes only what the sweep reads rather than the whole table.
create index dance_posts_terminal_updated_at_idx
  on public.dance_posts (updated_at)
  where status in ('scored', 'failed');

-- security definer: auth.users is not readable through PostgREST, and the sweep must not
-- depend on whichever grants the service role happens to hold on the auth schema.
create function public.list_expired_anonymous_dance_posts(
  p_older_than timestamptz,
  p_limit integer
)
returns table (id uuid, owner_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select post.id, post.owner_id
  from public.dance_posts as post
  join auth.users as account on account.id = post.owner_id
  where account.is_anonymous
    -- Terminal only. An 'uploading' row may have a transfer in flight behind it, and
    -- 'uploaded'/'scoring' are the queue's to finish; taking either would delete a
    -- recording out from under work that is still running.
    and post.status in ('scored', 'failed')
    and post.updated_at < p_older_than
  order by post.updated_at
  limit p_limit;
$$;

comment on function public.list_expired_anonymous_dance_posts(timestamptz, integer) is
  'Retention backstop candidates: terminal dance_posts owned by an anonymous (Stepz) user and older than the cutoff. Read-only; the caller deletes each row through the dance service so the row and its storage objects go together.';

revoke execute on function public.list_expired_anonymous_dance_posts(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.list_expired_anonymous_dance_posts(timestamptz, integer)
  to service_role;

-- Rollback:
--   drop function if exists public.list_expired_anonymous_dance_posts(timestamptz, integer);
--   drop index if exists public.dance_posts_terminal_updated_at_idx;
