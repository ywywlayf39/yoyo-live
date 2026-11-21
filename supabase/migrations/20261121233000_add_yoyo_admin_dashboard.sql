-- Secure admin dashboard RPCs. Admin status is read from trusted app_metadata only.
create or replace function public.yoyo_admin_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'members_total', (select count(*) from public.profiles),
    'live_now', (select count(*) from public.live_rooms where status = 'live'),
    'reports_pending', (select count(*) from public.user_reports where status = 'pending'),
    'gifts_sent', (select count(*) from public.gift_transfers)
  );
end;
$$;

create or replace function public.yoyo_admin_list_reports(p_limit integer default 50)
returns table (
  id uuid,
  reporter_id uuid,
  reported_user_id uuid,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  reporter_name text,
  reported_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  return query
  select r.id, r.reporter_id, r.reported_user_id, r.reason, r.details,
         r.status, r.created_at,
         coalesce(p1.display_name, 'عضو')::text,
         coalesce(p2.display_name, 'عضو')::text
  from public.user_reports r
  left join public.profiles p1 on p1.id = r.reporter_id
  left join public.profiles p2 on p2.id = r.reported_user_id
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

create or replace function public.yoyo_admin_update_report(p_report_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  if p_status not in ('reviewing', 'actioned', 'dismissed') then
    raise exception 'invalid report status' using errcode = '22023';
  end if;

  update public.user_reports
  set status = p_status,
      reviewed_at = case when p_status in ('actioned', 'dismissed') then now() else null end
  where id = p_report_id;

  return found;
end;
$$;

revoke all on function public.yoyo_admin_summary() from public, anon;
revoke all on function public.yoyo_admin_list_reports(integer) from public, anon;
revoke all on function public.yoyo_admin_update_report(uuid, text) from public, anon;
grant execute on function public.yoyo_admin_summary() to authenticated;
grant execute on function public.yoyo_admin_list_reports(integer) to authenticated;
grant execute on function public.yoyo_admin_update_report(uuid, text) to authenticated;
