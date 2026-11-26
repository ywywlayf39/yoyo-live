-- Make voice-room membership server-authorized instead of client-writable.
drop policy if exists "voice room members insert self" on public.voice_room_members;
drop policy if exists "voice room members update self" on public.voice_room_members;
drop policy if exists "voice room members delete self" on public.voice_room_members;
revoke insert, update, delete on public.voice_room_members from authenticated;
grant select on public.voice_room_members to authenticated;

create or replace function public.join_voice_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_room public.voice_rooms%rowtype;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  select * into v_room from public.voice_rooms
   where id=p_room_id and status='live' for share;
  if not found then raise exception 'الغرفة الصوتية غير متاحة'; end if;
  if private.yoyo_is_user_suspended(v_user) then
    raise exception 'الحساب موقوف حاليًا ولا يمكنه دخول الغرف';
  end if;
  if v_room.host_id <> v_user and exists (
    select 1 from public.user_blocks b
    where (b.blocker_id=v_user and b.blocked_id=v_room.host_id)
       or (b.blocker_id=v_room.host_id and b.blocked_id=v_user)
  ) then raise exception 'لا يمكنك دخول هذه الغرفة بسبب إعدادات الحظر'; end if;
  insert into public.voice_room_members(room_id,user_id,joined_at)
  values (p_room_id,v_user,now())
  on conflict (room_id,user_id) do update set joined_at=now();
  return jsonb_build_object('ok',true,'room_id',p_room_id);
end;
$$;
revoke all on function public.join_voice_room(uuid) from public;
grant execute on function public.join_voice_room(uuid) to authenticated;

create or replace function public.leave_voice_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  update public.voice_room_seats
    set user_id=null, updated_at=now()
    where room_id=p_room_id and user_id=v_user;
  update public.voice_room_seat_requests
    set status='rejected'
    where room_id=p_room_id and user_id=v_user and status in ('pending','approved');
  delete from public.voice_room_members
    where room_id=p_room_id and user_id=v_user;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.leave_voice_room(uuid) from public;
grant execute on function public.leave_voice_room(uuid) to authenticated;

create or replace function public.request_voice_room_seat(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_room public.voice_rooms%rowtype;
  v_request_id uuid;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  select * into v_room from public.voice_rooms
   where id = p_room_id and status = 'live' for update;
  if not found then raise exception 'الغرفة غير متاحة'; end if;
  if v_room.host_id = v_user then raise exception 'المضيف لا يحتاج إلى طلب مقعد'; end if;
  if private.yoyo_is_user_suspended(v_user) then raise exception 'الحساب موقوف حاليًا'; end if;
  if not exists (
    select 1 from public.voice_room_members m
    where m.room_id=p_room_id and m.user_id=v_user
      and m.joined_at > now() - interval '2 hours'
  ) then raise exception 'ادخل الغرفة أولاً ثم اطلب مقعدًا'; end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_user and b.blocked_id = v_room.host_id)
       or (b.blocker_id = v_room.host_id and b.blocked_id = v_user)
  ) then raise exception 'لا يمكن طلب مقعد بسبب إعدادات الحظر'; end if;
  if exists (select 1 from public.voice_room_seats s where s.room_id=p_room_id and s.user_id=v_user) then
    raise exception 'أنت بالفعل على أحد المقاعد';
  end if;
  insert into public.voice_room_seat_requests(room_id, user_id, status, created_at)
  values (p_room_id, v_user, 'pending', now())
  on conflict (room_id, user_id) do update
    set status = 'pending', created_at = now()
  returning id into v_request_id;
  return jsonb_build_object('request_id', v_request_id, 'status', 'pending');
end;
$$;
revoke all on function public.request_voice_room_seat(uuid) from public;
grant execute on function public.request_voice_room_seat(uuid) to authenticated;
