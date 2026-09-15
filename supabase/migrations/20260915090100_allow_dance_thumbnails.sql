-- The media worker writes the poster frame beside the recording, so the bucket has
-- to accept JPEG as well. The size limit is unchanged: a remux adds only the encoded
-- music (~960 KB for 60 s at 128 kbps), and the worker skips the upload when an input
-- recorded at the very top of the limit produces an output just over it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dance-videos',
  'dance-videos',
  false,
  47185920,
  array['video/mp4', 'image/jpeg']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
