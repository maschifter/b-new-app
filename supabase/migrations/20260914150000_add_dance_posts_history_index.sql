-- The owner's history feed seeks and sorts by this complete keyset.
create index dance_posts_owner_id_created_at_id_idx
  on public.dance_posts (owner_id, created_at desc, id desc);
