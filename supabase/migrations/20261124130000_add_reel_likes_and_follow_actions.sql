-- Allow signed-in members to like published reels once per user.
create table if not exists public.reel_likes (
  reel_id uuid not null references public.reels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint reel_likes_pkey primary key (reel_id, user_id)
);
create index if not exists reel_likes_user_created_idx on public.reel_likes (user_id, created_at desc);
alter table public.reel_likes enable row level security;
grant select, insert, delete on public.reel_likes to authenticated;
drop policy if exists "Authenticated users can view reel likes" on public.reel_likes;
create policy "Authenticated users can view reel likes" on public.reel_likes
  for select to authenticated using (true);
drop policy if exists "Users can like reels as themselves" on public.reel_likes;
create policy "Users can like reels as themselves" on public.reel_likes
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.reels r where r.id = reel_id and r.status = 'published')
  );
drop policy if exists "Users can unlike their own reel likes" on public.reel_likes;
create policy "Users can unlike their own reel likes" on public.reel_likes
  for delete to authenticated using (user_id = (select auth.uid()));
