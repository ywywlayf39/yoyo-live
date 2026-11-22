create table if not exists public.yoyo_battles (
  id uuid primary key default gen_random_uuid(),
  host_a_id uuid not null references auth.users(id) on delete cascade,
  host_b_id uuid not null references auth.users(id) on delete cascade,
  room_a text not null,
  room_b text not null,
  host_a_name text not null,
  host_b_name text not null,
  status text not null default 'pending'
    check (status in ('pending','active','completed','rejected','cancelled','expired','interrupted')),
  result text check (result is null or result in ('host_a','host_b','draw','no_result')),
  score_a bigint not null default 0 check (score_a >= 0),
  score_b bigint not null default 0 check (score_b >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '60 seconds'),
  responded_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  finished_at timestamptz,
  constraint yoyo_battles_distinct_hosts check (host_a_id <> host_b_id),
  constraint yoyo_battles_distinct_rooms check (room_a <> room_b)
);

create index if not exists yoyo_battles_host_a_status_idx on public.yoyo_battles(host_a_id, status, created_at desc);
create index if not exists yoyo_battles_host_b_status_idx on public.yoyo_battles(host_b_id, status, created_at desc);
create index if not exists yoyo_battles_active_end_idx on public.yoyo_battles(ends_at) where status = 'active';

alter table public.yoyo_battles enable row level security;
revoke all on public.yoyo_battles from anon, public;
grant select on public.yoyo_battles to authenticated;

drop policy if exists "Battle participants can view their battles" on public.yoyo_battles;
create policy "Battle participants can view their battles" on public.yoyo_battles
for select to authenticated using ((select auth.uid()) in (host_a_id, host_b_id));

create or replace function public.yoyo_battle_invite(p_my_room_name text, p_opponent_room_name text)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
  v_user uuid := auth.uid(); v_opponent uuid; v_my_name text; v_opponent_name text;
  v_battle_id uuid; v_first uuid; v_second uuid;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  if p_my_room_name is null or p_opponent_room_name is null or p_my_room_name = p_opponent_room_name then
    raise exception 'غرفة التحدي غير صحيحة';
  end if;
  select r.host_name into v_my_name from public.live_rooms r
  where r.room_name=p_my_room_name and r.host_id=v_user and r.status='live' for update;
  if not found then raise exception 'يجب أن يكون بثك المباشر نشطًا لإرسال التحدي'; end if;
  select r.host_id,r.host_name into v_opponent,v_opponent_name from public.live_rooms r
  where r.room_name=p_opponent_room_name and r.status='live';
  if not found or v_opponent=v_user then raise exception 'المضيف الآخر غير متاح للتحدي الآن'; end if;
  v_first := least(v_user,v_opponent); v_second := greatest(v_user,v_opponent);
  perform pg_advisory_xact_lock(hashtextextended(v_first::text,0));
  perform pg_advisory_xact_lock(hashtextextended(v_second::text,0));
  if private.yoyo_is_user_suspended(v_user) or private.yoyo_is_user_suspended(v_opponent) then
    raise exception 'لا يمكن بدء تحدٍ لحساب موقوف';
  end if;
  if exists (select 1 from public.user_blocks b where
    (b.blocker_id=v_user and b.blocked_id=v_opponent) or (b.blocker_id=v_opponent and b.blocked_id=v_user)) then
    raise exception 'لا يمكن بدء تحدٍ بين حسابين محظورين';
  end if;
  if exists (select 1 from public.yoyo_battles b where b.status in ('pending','active')
    and (b.host_a_id in (v_user,v_opponent) or b.host_b_id in (v_user,v_opponent))) then
    raise exception 'أحد المضيفين لديه تحدٍ آخر قائم بالفعل';
  end if;
  insert into public.yoyo_battles(host_a_id,host_b_id,room_a,room_b,host_a_name,host_b_name)
  values(v_user,v_opponent,p_my_room_name,p_opponent_room_name,v_my_name,v_opponent_name)
  returning id into v_battle_id;
  return v_battle_id;
end;
$function$;

create or replace function public.yoyo_battle_respond(p_battle_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_user uuid := auth.uid(); v_battle public.yoyo_battles%rowtype; v_start timestamptz;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  select * into v_battle from public.yoyo_battles where id=p_battle_id for update;
  if not found or v_battle.host_b_id<>v_user then raise exception 'دعوة التحدي غير موجودة أو ليست موجهة إليك'; end if;
  if v_battle.status<>'pending' then raise exception 'هذه الدعوة لم تعد متاحة'; end if;
  if v_battle.expires_at<=now() then
    update public.yoyo_battles set status='expired',result='no_result',finished_at=now() where id=p_battle_id;
    return jsonb_build_object('status','expired');
  end if;
  if not p_accept then
    update public.yoyo_battles set status='rejected',responded_at=now(),finished_at=now(),result='no_result' where id=p_battle_id;
    return jsonb_build_object('status','rejected');
  end if;
  if private.yoyo_is_user_suspended(v_battle.host_a_id) or private.yoyo_is_user_suspended(v_battle.host_b_id) then
    raise exception 'لا يمكن قبول التحدي لحساب موقوف';
  end if;
  if exists (select 1 from public.user_blocks b where
    (b.blocker_id=v_battle.host_a_id and b.blocked_id=v_battle.host_b_id) or
    (b.blocker_id=v_battle.host_b_id and b.blocked_id=v_battle.host_a_id)) then
    raise exception 'لا يمكن قبول التحدي بين حسابين محظورين';
  end if;
  if not exists (select 1 from public.live_rooms r where r.room_name=v_battle.room_a and r.host_id=v_battle.host_a_id and r.status='live')
     or not exists (select 1 from public.live_rooms r where r.room_name=v_battle.room_b and r.host_id=v_battle.host_b_id and r.status='live') then
    update public.yoyo_battles set status='interrupted',result='no_result',responded_at=now(),finished_at=now() where id=p_battle_id;
    return jsonb_build_object('status','interrupted');
  end if;
  v_start := now()+interval '10 seconds';
  update public.yoyo_battles set status='active',responded_at=now(),starts_at=v_start,ends_at=v_start+interval '5 minutes'
  where id=p_battle_id;
  return jsonb_build_object('status','active','starts_at',v_start,'ends_at',v_start+interval '5 minutes');
end;
$function$;

create or replace function public.yoyo_battle_cancel(p_battle_id uuid)
returns void language plpgsql security definer set search_path = ''
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  update public.yoyo_battles set status='cancelled',result='no_result',finished_at=now()
  where id=p_battle_id and host_a_id=v_user and status='pending';
  if not found then raise exception 'لا يمكن إلغاء هذه الدعوة'; end if;
end;
$function$;

create or replace function public.yoyo_battle_refresh()
returns integer language plpgsql security definer set search_path = ''
as $function$
declare v_user uuid := auth.uid(); v_count integer:=0; v_rows integer:=0;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  update public.yoyo_battles set status='expired',result='no_result',finished_at=now()
  where status='pending' and expires_at<=now() and (host_a_id=v_user or host_b_id=v_user);
  get diagnostics v_rows=row_count; v_count:=v_count+v_rows;
  update public.yoyo_battles b set status='interrupted',result='no_result',finished_at=now()
  where b.status='active' and (b.host_a_id=v_user or b.host_b_id=v_user) and (
    not exists(select 1 from public.live_rooms r where r.room_name=b.room_a and r.host_id=b.host_a_id and r.status='live')
    or not exists(select 1 from public.live_rooms r where r.room_name=b.room_b and r.host_id=b.host_b_id and r.status='live'));
  get diagnostics v_rows=row_count; v_count:=v_count+v_rows;
  update public.yoyo_battles set status='completed',
    result=case when score_a>score_b then 'host_a' when score_b>score_a then 'host_b' else 'draw' end,
    finished_at=now()
  where status='active' and ends_at<=now() and (host_a_id=v_user or host_b_id=v_user);
  get diagnostics v_rows=row_count; v_count:=v_count+v_rows;
  return v_count;
end;
$function$;

create or replace function private.yoyo_battle_count_gift()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  update public.yoyo_battles b set score_a=b.score_a+new.host_points
  where b.status='active' and b.starts_at<=new.created_at and b.ends_at>new.created_at
    and b.host_a_id=new.receiver_id and b.room_a=new.room_name;
  update public.yoyo_battles b set score_b=b.score_b+new.host_points
  where b.status='active' and b.starts_at<=new.created_at and b.ends_at>new.created_at
    and b.host_b_id=new.receiver_id and b.room_b=new.room_name;
  return new;
end;
$function$;

revoke all on function private.yoyo_battle_count_gift() from public, anon, authenticated;

drop trigger if exists yoyo_battle_score_from_live_gift on public.gift_transfers;
create trigger yoyo_battle_score_from_live_gift after insert on public.gift_transfers
for each row execute function private.yoyo_battle_count_gift();

revoke all on function public.yoyo_battle_invite(text,text) from public,anon;
revoke all on function public.yoyo_battle_respond(uuid,boolean) from public,anon;
revoke all on function public.yoyo_battle_cancel(uuid) from public,anon;
revoke all on function public.yoyo_battle_refresh() from public,anon;
grant execute on function public.yoyo_battle_invite(text,text) to authenticated;
grant execute on function public.yoyo_battle_respond(uuid,boolean) to authenticated;
grant execute on function public.yoyo_battle_cancel(uuid) to authenticated;
grant execute on function public.yoyo_battle_refresh() to authenticated;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='yoyo_battles') then
    alter publication supabase_realtime add table public.yoyo_battles;
  end if;
end $$;
