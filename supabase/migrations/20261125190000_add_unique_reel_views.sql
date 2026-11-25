-- Count one reel view per authenticated member, without exposing viewer identities.
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

create or replace function public.record_reel_view(p_reel_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_owner_id uuid;
  v_inserted integer := 0;
begin
  if v_viewer_id is null then
    raise exception 'Authentication required';
  end if;

  select r.user_id into v_owner_id
  from public.reels r
  where r.id = p_reel_id
    and r.status = 'published';

  if v_owner_id is null or v_owner_id = v_viewer_id then
    return false;
  end if;

  insert into public.reel_views (reel_id, viewer_id)
  values (p_reel_id, v_viewer_id)
  on conflict (reel_id, viewer_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

create or replace function public.get_my_reel_view_counts(p_reel_ids uuid[])
returns table (reel_id uuid, views_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, count(rv.viewer_id)::bigint
  from public.reels r
  left join public.reel_views rv on rv.reel_id = r.id
  where auth.uid() is not null
    and r.user_id = auth.uid()
    and r.id = any(coalesce(p_reel_ids, array[]::uuid[]))
  group by r.id;
$$;

revoke all on function public.record_reel_view(uuid) from public, anon;
revoke all on function public.get_my_reel_view_counts(uuid[]) from public, anon;
grant execute on function public.record_reel_view(uuid) to authenticated;
grant execute on function public.get_my_reel_view_counts(uuid[]) to authenticated;
