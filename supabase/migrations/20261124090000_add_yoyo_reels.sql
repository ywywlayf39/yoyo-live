-- YOYO LIVE short-form Reels storage and metadata
create table if not exists public.reels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_path text not null unique,
  caption text not null default '' check (char_length(caption) <= 300),
  duration_seconds numeric(6,2) not null check (duration_seconds > 0 and duration_seconds <= 60),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 31457280),
  status text not null default 'published' check (status in ('published','removed')),
  created_at timestamptz not null default now()
);
create index if not exists reels_published_created_at_idx on public.reels (created_at desc) where status = 'published';
create index if not exists reels_user_created_at_idx on public.reels (user_id, created_at desc);
alter table public.reels enable row level security;
grant select, insert, delete on public.reels to authenticated;
drop policy if exists "Authenticated users view published reels" on public.reels;
create policy "Authenticated users view published reels" on public.reels for select to authenticated using (status = 'published' or user_id = (select auth.uid()));
drop policy if exists "Users publish their own reels" on public.reels;
create policy "Users publish their own reels" on public.reels for insert to authenticated with check (user_id = (select auth.uid()) and status = 'published' and video_path like ((select auth.uid())::text || '/%'));
drop policy if exists "Users delete their own reels" on public.reels;
create policy "Users delete their own reels" on public.reels for delete to authenticated using (user_id = (select auth.uid()));
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reels', 'reels', true, 31457280, array['video/mp4'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Public can watch published reels" on storage.objects;
create policy "Public can watch published reels" on storage.objects for select to public using (bucket_id = 'reels');
drop policy if exists "Users upload their own reels" on storage.objects;
create policy "Users upload their own reels" on storage.objects for insert to authenticated with check (bucket_id = 'reels' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users delete their own reels files" on storage.objects;
create policy "Users delete their own reels files" on storage.objects for delete to authenticated using (bucket_id = 'reels' and (storage.foldername(name))[1] = (select auth.uid())::text);
