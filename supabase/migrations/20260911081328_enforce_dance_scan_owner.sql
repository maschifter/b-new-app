-- Keep the denormalized scan owner synchronized with its parent post. The
-- existing one-to-one post_id constraint remains the scan cardinality invariant.
alter table public.dance_posts
  add constraint dance_posts_id_owner_unique unique (id, owner_id);

alter table public.dance_scans
  drop constraint dance_scans_post_id_fkey;

alter table public.dance_scans
  add constraint dance_scans_post_owner_fk
  foreign key (post_id, owner_id)
  references public.dance_posts (id, owner_id)
  on delete cascade;
