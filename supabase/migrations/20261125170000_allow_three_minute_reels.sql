-- Allow YOYO LIVE reels up to 3 minutes and up to 50 MB after compression.
alter table public.reels
  drop constraint if exists reels_duration_seconds_check,
  add constraint reels_duration_seconds_check
    check (duration_seconds > 0 and duration_seconds <= 180),
  drop constraint if exists reels_file_size_bytes_check,
  add constraint reels_file_size_bytes_check
    check (file_size_bytes > 0 and file_size_bytes <= 52428800);

update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['video/mp4']
where id = 'reels';
