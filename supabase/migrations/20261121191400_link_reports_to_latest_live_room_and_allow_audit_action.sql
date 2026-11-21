alter table public.admin_user_actions
  drop constraint if exists admin_user_actions_action_check;
alter table public.admin_user_actions
  add constraint admin_user_actions_action_check
  check (action in ('suspend','unsuspend','end_live_room'));

create or replace function public.yoyo_admin_list_reports_with_live(p_limit integer default 50)
returns table (
  id uuid,
  reporter_id uuid,
  reported_user_id uuid,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  reporter_name text,
  reported_name text,
  live_room_id uuid,
  live_room_name text,
  live_room_title text,
  live_room_status text,
  live_room_started_at timestamptz,
  live_room_ended_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
     or coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  return query
  select r.id, r.reporter_id, r.reported_user_id, r.reason, r.details,
         r.status, r.created_at,
         coalesce(p1.display_name, 'عضو')::text,
         coalesce(p2.display_name, 'عضو')::text,
         lr.id, lr.room_name, lr.title, lr.status, lr.created_at, lr.ended_at
  from public.user_reports r
  left join public.profiles p1 on p1.id = r.reporter_id
  left join public.profiles p2 on p2.id = r.reported_user_id
  left join lateral (
    select x.id, x.room_name, x.title, x.status, x.created_at, x.ended_at
    from public.live_rooms x
    where x.host_id = r.reported_user_id
    order by x.created_at desc
    limit 1
  ) lr on true
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$function$;

revoke all on function public.yoyo_admin_list_reports_with_live(integer) from public, anon;
grant execute on function public.yoyo_admin_list_reports_with_live(integer) to authenticated;
