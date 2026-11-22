create or replace function public.yoyo_battle_respond(p_battle_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_user uuid:=auth.uid(); v_battle public.yoyo_battles%rowtype; v_start timestamptz;
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
  if not exists(select 1 from public.live_rooms r where r.room_name=v_battle.room_a and r.host_id=v_battle.host_a_id and r.status='live')
     or not exists(select 1 from public.live_rooms r where r.room_name=v_battle.room_b and r.host_id=v_battle.host_b_id and r.status='live') then
    update public.yoyo_battles set status='interrupted',result='no_result',responded_at=now(),finished_at=now() where id=p_battle_id;
    return jsonb_build_object('status','interrupted');
  end if;
  v_start:=now()+interval '10 seconds';
  update public.yoyo_battles set status='active',responded_at=now(),starts_at=v_start,ends_at=v_start+interval '5 minutes' where id=p_battle_id;
  return jsonb_build_object('status','active','starts_at',v_start,'ends_at',v_start+interval '5 minutes');
end;
$function$;

create or replace function public.yoyo_battle_refresh()
returns integer language plpgsql security definer set search_path = ''
as $function$
declare v_user uuid:=auth.uid(); v_count integer:=0; v_rows integer:=0;
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
