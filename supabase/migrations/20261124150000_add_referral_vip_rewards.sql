create table if not exists private.yoyo_referral_vip_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  milestone_invites integer not null check (milestone_invites in (3,5,10)),
  target_vip_days integer not null check (target_vip_days in (7,15,30)),
  granted_days integer not null default 0 check (granted_days between 0 and 30),
  status text not null default 'pending' check (status in ('pending','reviewing','approved','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, period_start, milestone_invites)
);
alter table private.yoyo_referral_vip_rewards enable row level security;
revoke all on private.yoyo_referral_vip_rewards from public, anon, authenticated;

create or replace function private.yoyo_try_qualify_referral(p_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  if p_user_id is null then return; end if;
  update private.yoyo_referrals r
  set status = 'qualified', qualified_at = coalesce(r.qualified_at, now())
  where r.referred_user_id = p_user_id and r.status = 'registered'
    and exists (select 1 from auth.users u where u.id = p_user_id and u.email_confirmed_at is not null)
    and exists (
      select 1 from public.profiles p where p.id = p_user_id
        and nullif(btrim(p.display_name),'') is not null
        and nullif(btrim(p.country),'') is not null
        and p.birth_date is not null and nullif(btrim(p.gender),'') is not null
    )
    and (
      exists (select 1 from public.user_follows f where f.follower_id = p_user_id)
      or exists (select 1 from public.reel_likes l where l.user_id = p_user_id)
      or exists (select 1 from public.live_room_viewers v where v.user_id = p_user_id and v.last_seen_at > now() - interval '2 minutes')
    );
end;
$function$;

create or replace function private.yoyo_qualify_referral_after_activity()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare v_user_id uuid;
begin
  v_user_id := coalesce(nullif(to_jsonb(new)->>'user_id','')::uuid, nullif(to_jsonb(new)->>'follower_id','')::uuid);
  perform private.yoyo_try_qualify_referral(v_user_id);
  return new;
end;
$function$;
revoke all on function private.yoyo_try_qualify_referral(uuid) from public, anon, authenticated;
revoke all on function private.yoyo_qualify_referral_after_activity() from public, anon, authenticated;

drop trigger if exists yoyo_qualify_referral_after_follow on public.user_follows;
create trigger yoyo_qualify_referral_after_follow after insert on public.user_follows
for each row execute function private.yoyo_qualify_referral_after_activity();
drop trigger if exists yoyo_qualify_referral_after_reel_like on public.reel_likes;
create trigger yoyo_qualify_referral_after_reel_like after insert on public.reel_likes
for each row execute function private.yoyo_qualify_referral_after_activity();
drop trigger if exists yoyo_qualify_referral_after_live_join on public.live_room_viewers;
create trigger yoyo_qualify_referral_after_live_join after insert on public.live_room_viewers
for each row execute function private.yoyo_qualify_referral_after_activity();

create or replace function public.yoyo_apply_referral_code(p_code text)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_user_id uuid := auth.uid(); v_referrer_id uuid; v_inserted boolean := false;
begin
  if v_user_id is null or nullif(pg_catalog.btrim(p_code), '') is null then return false; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user_id) then return false; end if;
  select c.user_id into v_referrer_id from private.yoyo_referral_codes c
  where c.code = pg_catalog.upper(pg_catalog.btrim(p_code)) limit 1;
  if v_referrer_id is null or v_referrer_id = v_user_id then return false; end if;
  insert into private.yoyo_referrals (referrer_id,referred_user_id,referral_code,status)
  values (v_referrer_id,v_user_id,pg_catalog.upper(pg_catalog.btrim(p_code)),'registered')
  on conflict (referred_user_id) do nothing;
  v_inserted := found;
  if v_inserted then perform private.yoyo_try_qualify_referral(v_user_id); end if;
  return v_inserted;
end;
$function$;
revoke all on function public.yoyo_apply_referral_code(text) from public, anon;
grant execute on function public.yoyo_apply_referral_code(text) to authenticated;

update private.yoyo_referrals r
set status = 'qualified', qualified_at = coalesce(r.qualified_at, now())
where r.status = 'registered'
  and exists (select 1 from auth.users u where u.id = r.referred_user_id and u.email_confirmed_at is not null)
  and exists (
    select 1 from public.profiles p where p.id = r.referred_user_id
      and nullif(btrim(p.display_name),'') is not null and nullif(btrim(p.country),'') is not null
      and p.birth_date is not null and nullif(btrim(p.gender),'') is not null
  )
  and (
    exists (select 1 from public.user_follows f where f.follower_id = r.referred_user_id)
    or exists (select 1 from public.reel_likes l where l.user_id = r.referred_user_id)
    or exists (select 1 from public.live_room_viewers v where v.user_id = r.referred_user_id and v.last_seen_at > now() - interval '2 minutes')
  );

create or replace function public.yoyo_get_referral_vip_reward_progress()
returns table (qualified_invites integer, milestone_invites integer, target_vip_days integer, status text, granted_days integer)
language plpgsql security definer set search_path = ''
as $function$
declare v_user_id uuid := auth.uid(); v_period_start date := date_trunc('month', now())::date; v_qualified integer := 0;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select count(*)::integer into v_qualified from private.yoyo_referrals r
  where r.referrer_id = v_user_id and r.status = 'qualified'
    and r.qualified_at >= v_period_start::timestamptz
    and r.qualified_at < (v_period_start + interval '1 month')::timestamptz;
  insert into private.yoyo_referral_vip_rewards (user_id,period_start,milestone_invites,target_vip_days)
  select v_user_id,v_period_start,m.milestone_invites,m.target_vip_days
  from (values (3,7),(5,15),(10,30)) as m(milestone_invites,target_vip_days)
  where v_qualified >= m.milestone_invites
  on conflict (user_id,period_start,milestone_invites) do nothing;
  return query
  select v_qualified,m.milestone_invites,m.target_vip_days,coalesce(w.status,'not_reached'),coalesce(w.granted_days,0)
  from (values (3,7),(5,15),(10,30)) as m(milestone_invites,target_vip_days)
  left join private.yoyo_referral_vip_rewards w on w.user_id=v_user_id
    and w.period_start=v_period_start and w.milestone_invites=m.milestone_invites
  order by m.milestone_invites;
end;
$function$;

create or replace function public.yoyo_admin_list_referral_vip_rewards(p_limit integer default 100)
returns table (id uuid,user_id uuid,display_name text,period_start date,milestone_invites integer,target_vip_days integer,granted_days integer,status text,created_at timestamptz)
language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or coalesce(auth.jwt() -> 'app_metadata' ->> 'role','') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  return query
  select w.id,w.user_id,coalesce(p.display_name,'عضو بدون اسم'),w.period_start,w.milestone_invites,
    w.target_vip_days,w.granted_days,w.status,w.created_at
  from private.yoyo_referral_vip_rewards w left join public.profiles p on p.id=w.user_id
  order by case w.status when 'pending' then 0 when 'reviewing' then 1 else 2 end,w.created_at desc
  limit greatest(1,least(coalesce(p_limit,100),200));
end;
$function$;

create or replace function public.yoyo_admin_review_referral_vip_reward(p_reward_id uuid,p_decision text)
returns integer language plpgsql security definer set search_path = ''
as $function$
declare v_reward private.yoyo_referral_vip_rewards%rowtype; v_already_granted integer := 0; v_to_grant integer := 0; v_plan_id uuid;
begin
  if auth.uid() is null or coalesce(auth.jwt() -> 'app_metadata' ->> 'role','') <> 'admin' then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if p_decision not in ('approved','rejected','reviewing') then raise exception 'Invalid decision'; end if;
  select * into v_reward from private.yoyo_referral_vip_rewards where id=p_reward_id for update;
  if not found then raise exception 'Reward request not found'; end if;
  if v_reward.status not in ('pending','reviewing') then raise exception 'Reward request already reviewed'; end if;
  if p_decision='approved' then
    select coalesce(sum(granted_days),0)::integer into v_already_granted
    from private.yoyo_referral_vip_rewards where user_id=v_reward.user_id
      and period_start=v_reward.period_start and status='approved';
    v_to_grant := greatest(0,v_reward.target_vip_days-v_already_granted);
    if v_to_grant > 0 then
      select id into v_plan_id from public.vip_plans where code='vip_monthly'
      order by active desc,created_at asc limit 1;
      if v_plan_id is null then raise exception 'VIP plan is not configured'; end if;
      insert into public.user_vip_subscriptions(user_id,plan_id,status,starts_at,expires_at,updated_at)
      values(v_reward.user_id,v_plan_id,'active',now(),now()+make_interval(days=>v_to_grant),now())
      on conflict(user_id) do update set
        plan_id=excluded.plan_id,status='active',
        starts_at=case when public.user_vip_subscriptions.status='active'
          and public.user_vip_subscriptions.expires_at>now()
          then public.user_vip_subscriptions.starts_at else now() end,
        expires_at=greatest(coalesce(public.user_vip_subscriptions.expires_at,now()),now())+make_interval(days=>v_to_grant),
        updated_at=now();
    end if;
  end if;
  update private.yoyo_referral_vip_rewards set status=p_decision,
    granted_days=case when p_decision='approved' then v_to_grant else granted_days end,
    reviewed_by=auth.uid(),reviewed_at=now() where id=p_reward_id;
  return v_to_grant;
end;
$function$;

revoke all on function public.yoyo_get_referral_vip_reward_progress() from public,anon;
grant execute on function public.yoyo_get_referral_vip_reward_progress() to authenticated;
revoke all on function public.yoyo_admin_list_referral_vip_rewards(integer) from public,anon;
grant execute on function public.yoyo_admin_list_referral_vip_rewards(integer) to authenticated;
revoke all on function public.yoyo_admin_review_referral_vip_reward(uuid,text) from public,anon;
grant execute on function public.yoyo_admin_review_referral_vip_reward(uuid,text) to authenticated;
