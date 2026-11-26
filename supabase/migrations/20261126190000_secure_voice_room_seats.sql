-- Voice room seat capacity and server-authorized seat workflow.
-- Existing occupied seats are preserved; empty seat slots are added for each live room.
alter table public.voice_room_seats
  alter column user_id drop not null,
  add column if not exists is_open boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists voice_room_seats_one_user_per_room
  on public.voice_room_seats(room_id, user_id) where user_id is not null;

create or replace function public.yoyo_initialize_voice_room_seats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.voice_room_seats(room_id, seat_number, user_id, is_open)
  select new.id, slots.seat_number, null, true from generate_series(1, 8) as slots(seat_number)
  on conflict (room_id, seat_number) do nothing;
  return new;
end;
$$;
revoke all on function public.yoyo_initialize_voice_room_seats() from public;

drop trigger if exists yoyo_initialize_voice_room_seats on public.voice_rooms;
create trigger yoyo_initialize_voice_room_seats
after insert on public.voice_rooms
for each row execute function public.yoyo_initialize_voice_room_seats();

insert into public.voice_room_seats(room_id, seat_number, user_id, is_open)
select r.id, slots.seat_number, null, true
from public.voice_rooms r
cross join generate_series(1, 8) as slots(seat_number)
where r.status = 'live'
  and not exists (
    select 1 from public.voice_room_seats s
    where s.room_id = r.id and s.seat_number = slots.seat_number
  )
on conflict (room_id, seat_number) do nothing;

-- Clients may read room seat state but cannot directly assign or unlock seats.
drop policy if exists "host manages voice seats" on public.voice_room_seats;
drop policy if exists "members leave own voice seats" on public.voice_room_seats;
drop policy if exists "voice seats visible in live rooms" on public.voice_room_seats;
create policy "voice seats visible in live rooms"
on public.voice_room_seats for select to authenticated
using (exists (
  select 1 from public.voice_rooms r
  where r.id = voice_room_seats.room_id and r.status = 'live'
));
revoke insert, update, delete on public.voice_room_seats from authenticated;
grant select on public.voice_room_seats to authenticated;

-- Seat requests are private to the requester and room host.
drop policy if exists "voice seat requests visible in live rooms" on public.voice_room_seat_requests;
drop policy if exists "members request own voice seat" on public.voice_room_seat_requests;
drop policy if exists "host manages voice seat requests" on public.voice_room_seat_requests;
drop policy if exists "members retry own voice seat requests" on public.voice_room_seat_requests;
create policy "requester and host read seat requests"
on public.voice_room_seat_requests for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.voice_rooms r
    where r.id = voice_room_seat_requests.room_id
      and r.host_id = (select auth.uid())
      and r.status = 'live'
  )
);
revoke insert, update, delete on public.voice_room_seat_requests from authenticated;
grant select on public.voice_room_seat_requests to authenticated;

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
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_user and b.blocked_id = v_room.host_id)
       or (b.blocker_id = v_room.host_id and b.blocked_id = v_user)
  ) then raise exception 'لا يمكن الانضمام بسبب إعدادات الحظر'; end if;

  insert into public.voice_room_members(room_id, user_id, joined_at)
  values (p_room_id, v_user, now())
  on conflict (room_id, user_id) do update set joined_at = excluded.joined_at;

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

create or replace function public.manage_voice_room_seat(
  p_room_id uuid,
  p_seat_number integer,
  p_action text,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_room public.voice_rooms%rowtype;
  v_seat public.voice_room_seats%rowtype;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  if p_seat_number is null or p_seat_number < 1 or p_seat_number > 8 then
    raise exception 'رقم المقعد غير صحيح';
  end if;
  if p_action is null or p_action not in ('open','close','approve','remove') then
    raise exception 'إجراء المقعد غير صالح';
  end if;
  select * into v_room from public.voice_rooms
   where id=p_room_id and status='live' for update;
  if not found or v_room.host_id <> v_user then
    raise exception 'التحكم في المقاعد متاح لمضيف الغرفة فقط';
  end if;
  select * into v_seat from public.voice_room_seats
   where room_id=p_room_id and seat_number=p_seat_number for update;
  if not found then raise exception 'المقعد غير موجود'; end if;

  if p_action = 'open' then
    update public.voice_room_seats set is_open=true, updated_at=now()
    where id=v_seat.id;
  elsif p_action = 'close' then
    if v_seat.user_id is not null then
      raise exception 'أخرج العضو من المقعد أولاً قبل قفله';
    end if;
    update public.voice_room_seats set is_open=false, updated_at=now()
    where id=v_seat.id;
  elsif p_action = 'remove' then
    if v_seat.user_id is null then raise exception 'المقعد فارغ بالفعل'; end if;
    update public.voice_room_seat_requests
      set status='rejected'
      where room_id=p_room_id and user_id=v_seat.user_id and status='approved';
    update public.voice_room_seats
      set user_id=null, updated_at=now()
      where id=v_seat.id;
  elsif p_action = 'approve' then
    if p_user_id is null then raise exception 'اختر العضو المطلوب قبوله'; end if;
    if not v_seat.is_open then raise exception 'هذا المقعد مقفول'; end if;
    if v_seat.user_id is not null then raise exception 'هذا المقعد مشغول'; end if;
    if not exists (
      select 1 from public.voice_room_seat_requests q
      where q.room_id=p_room_id and q.user_id=p_user_id and q.status='pending'
        and q.created_at > now() - interval '2 hours'
    ) then raise exception 'طلب العضو غير موجود أو انتهت صلاحيته'; end if;
    if not exists (
      select 1 from public.voice_room_members m
      where m.room_id=p_room_id and m.user_id=p_user_id
        and m.joined_at > now() - interval '2 hours'
    ) then raise exception 'يجب أن يكون العضو داخل الغرفة لقبول طلبه'; end if;
    if exists (
      select 1 from public.voice_room_seats s
      where s.room_id=p_room_id and s.user_id=p_user_id
    ) then raise exception 'العضو يشغل مقعدًا بالفعل'; end if;
    update public.voice_room_seats
      set user_id=p_user_id, updated_at=now()
      where id=v_seat.id;
    update public.voice_room_seat_requests
      set status='approved'
      where room_id=p_room_id and user_id=p_user_id;
  end if;
  return jsonb_build_object('ok',true,'seat_number',p_seat_number,'action',p_action);
end;
$$;
revoke all on function public.manage_voice_room_seat(uuid, integer, text, uuid) from public;
grant execute on function public.manage_voice_room_seat(uuid, integer, text, uuid) to authenticated;
