create table if not exists public.reel_comments (
  id uuid primary key default gen_random_uuid(),
  reel_id uuid not null references public.reels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 240),
  created_at timestamptz not null default now()
);
create index if not exists reel_comments_reel_created_idx
  on public.reel_comments (reel_id, created_at asc);
alter table public.reel_comments enable row level security;
revoke all on public.reel_comments from anon, public;
grant select, insert on public.reel_comments to authenticated;
drop policy if exists "Authenticated users can read published reel comments" on public.reel_comments;
create policy "Authenticated users can read published reel comments"
  on public.reel_comments for select to authenticated
  using (exists (
    select 1 from public.reels r
    where r.id = reel_comments.reel_id and r.status = 'published'
  ));
drop policy if exists "Users can comment on published reels as themselves" on public.reel_comments;
create policy "Users can comment on published reels as themselves"
  on public.reel_comments for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and char_length(btrim(body)) between 1 and 240
    and exists (
      select 1 from public.reels r
      where r.id = reel_comments.reel_id and r.status = 'published'
    )
  );
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reel_comments'
  ) then
    alter publication supabase_realtime add table public.reel_comments;
  end if;
end $$;