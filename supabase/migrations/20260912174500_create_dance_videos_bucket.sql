-- The mobile dance flow uploads amateur clips directly through a server-issued
-- signed URL. Keep this bucket private: clients receive no Storage policies and
-- the scan worker resolves a short-lived read URL per attempt.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dance-videos',
  'dance-videos',
  false,
  47185920,
  array['video/mp4']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
