-- Persist one view per signed-in member and reel.
-- Viewer identities are never exposed through the Data API.
alter table public.reels
  add column if not exists views_count bigint not null default 0;

create table if not exists public.reel_views (
  reel_id uuid not null references public.reels(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint reel_views_pkey primary key (reel_id, viewer_id)
);

create index if not exists reel_views_reel_created_idx
  on public.reel_views (reel_id, created_at desc);

alter table public.reel_views enable row level security;
revoke all on public.reel_views from public, anon, authenticated;
grant insert on public.reel_views to authenticated;

drop policy if exists "Members record unique views on other published reels" on public.reel_views;
create policy "Members record unique views on other published reels"
  on public.reel_views for insert to authenticated
  with check (
    viewer_id = (select auth.uid())
    and exists (
      select 1 from public.reels r
      where r.id = reel_id
        and r.status = 'published'
        and r.user_id <> (select auth.uid())
    )
  );

create or replace function public.increment_reel_view_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reels
  set views_count = views_count + 1
  where id = new.reel_id;
  return new;
end;
$$;

revoke all on function public.increment_reel_view_count() from public, anon, authenticated;
drop trigger if exists reel_views_increment_count on public.reel_views;
create trigger reel_views_increment_count
  after insert on public.reel_views
  for each row execute function public.increment_reel_view_count();
