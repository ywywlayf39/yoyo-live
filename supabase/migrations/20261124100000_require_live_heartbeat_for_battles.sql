alter table public.live_rooms
  add column if not exists last_heartbeat_at timestamptz not null default now();

update public.live_rooms
set last_heartbeat_at = now() - interval '10 minutes'
where status = 'live';

create index if not exists live_rooms_active_heartbeat_idx
  on public.live_rooms (last_heartbeat_at desc)
  where status = 'live';

-- yoyo_battle_invite and yoyo_battle_respond now require a fresh host heartbeat
-- (45 seconds) for both broadcasters before creating or accepting a battle.
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
  where r.room_name=p_my_room_name and r.host_id=v_user and r.status='live'
    and r.last_heartbeat_at > now()-interval '45 seconds' for update;
  if not found then raise exception 'بثك غير متصل حاليًا. أعد فتح البث وحاول مرة أخرى'; end if;
  select r.host_id,r.host_name into v_opponent,v_opponent_name from public.live_rooms r
  where r.room_name=p_opponent_room_name and r.status='live'
    and r.last_heartbeat_at > now()-interval '45 seconds';
  if not found or v_opponent=v_user then raise exception 'المضيف الآخر غير متصل حاليًا أو انتهى بثه'; end if;
  v_first:=least(v_user,v_opponent); v_second:=greatest(v_user,v_opponent);
  perform pg_advisory_xact_lock(hashtextextended(v_first::text,0));
  perform pg_advisory_xact_lock(hashtextextended(v_second::text,0));
  if private.yoyo_is_user_suspended(v_user) or private.yoyo_is_user_suspended(v_opponent) then
    raise exception 'لا يمكن بدء تحدٍ لحساب موقوف';
  end if;
  if exists(select 1 from public.user_blocks b where
    (b.blocker_id=v_user and b.blocked_id=v_opponent) or (b.blocker_id=v_opponent and b.blocked_id=v_user)) then
    raise exception 'لا يمكن بدء تحدٍ بين حسابين محظورين';
  end if;
  if exists(select 1 from public.yoyo_battles b where b.status in ('pending','active')
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
declare v_user uuid:=auth.uid(); v_battle public.yoyo_battles%rowtype; v_start timestamptz;
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
  if exists(select 1 from public.user_blocks b where
    (b.blocker_id=v_battle.host_a_id and b.blocked_id=v_battle.host_b_id) or
    (b.blocker_id=v_battle.host_b_id and b.blocked_id=v_battle.host_a_id)) then
    raise exception 'لا يمكن قبول التحدي بين حسابين محظورين';
  end if;
  if not exists(select 1 from public.live_rooms r where r.room_name=v_battle.room_a and r.host_id=v_battle.host_a_id
    and r.status='live' and r.last_heartbeat_at>now()-interval '45 seconds')
     or not exists(select 1 from public.live_rooms r where r.room_name=v_battle.room_b and r.host_id=v_battle.host_b_id
    and r.status='live' and r.last_heartbeat_at>now()-interval '45 seconds') then
    update public.yoyo_battles set status='interrupted',result='no_result',responded_at=now(),finished_at=now() where id=p_battle_id;
    return jsonb_build_object('status','interrupted');
  end if;
  v_start:=now()+interval '10 seconds';
  update public.yoyo_battles set status='active',responded_at=now(),starts_at=v_start,ends_at=v_start+interval '5 minutes'
  where id=p_battle_id;
  return jsonb_build_object('status','active','starts_at',v_start,'ends_at',v_start+interval '5 minutes');
end;
$function$;

revoke all on function public.yoyo_battle_invite(text,text) from public,anon;
revoke all on function public.yoyo_battle_respond(uuid,boolean) from public,anon;
grant execute on function public.yoyo_battle_invite(text,text) to authenticated;
grant execute on function public.yoyo_battle_respond(uuid,boolean) to authenticated;
