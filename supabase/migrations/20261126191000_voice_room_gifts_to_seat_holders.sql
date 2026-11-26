-- Allow room gifts to be sent to the host or an approved speaker, with retry-safe idempotency.
alter table public.voice_room_gift_events
  add column if not exists request_id uuid;
create unique index if not exists voice_room_gift_events_sender_request_uidx
  on public.voice_room_gift_events(sender_id, request_id)
  where request_id is not null;

drop function if exists public.send_voice_room_gift(uuid, uuid, integer);
drop function if exists public.send_voice_room_gift(uuid, uuid, integer, uuid);
create function public.send_voice_room_gift(
  p_room_id uuid,
  p_gift_id uuid,
  p_quantity integer,
  p_receiver_id uuid default null,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sender_id uuid := auth.uid();
  v_receiver_id uuid;
  v_room public.voice_rooms%rowtype;
  v_gift public.gift_catalog%rowtype;
  v_sender_balance bigint;
  v_total_coins bigint;
  v_gross_points bigint;
  v_receiver_points bigint;
  v_platform_points bigint;
  v_transfer_id uuid;
  v_request_id uuid := coalesce(p_request_id, gen_random_uuid());
  v_existing_gift_name text;
begin
  if v_sender_id is null then raise exception 'يجب تسجيل الدخول لإرسال هدية'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception 'الكمية يجب أن تكون من 1 إلى 100';
  end if;
  select * into v_room from public.voice_rooms
   where id = p_room_id and status = 'live' for share;
  if not found then raise exception 'الغرفة الصوتية غير متاحة'; end if;
  v_receiver_id := coalesce(p_receiver_id, v_room.host_id);
  if v_sender_id = v_receiver_id then raise exception 'لا يمكن إرسال هدية لنفسك'; end if;
  if not exists (
    select 1 from public.voice_room_members m
    where m.room_id = p_room_id and m.user_id = v_sender_id
      and m.joined_at > now() - interval '2 hours'
  ) then raise exception 'يجب دخول الغرفة الصوتية أولاً لإرسال هدية'; end if;
  if v_receiver_id <> v_room.host_id and not exists (
    select 1 from public.voice_room_seats s
    where s.room_id = p_room_id and s.user_id = v_receiver_id
  ) then raise exception 'يمكن إرسال الهدية للمضيف أو لعضو جالس على مقعد فقط'; end if;
  if private.yoyo_is_user_suspended(v_sender_id)
     or private.yoyo_is_user_suspended(v_receiver_id) then
    raise exception 'لا يمكن إرسال الهدايا من أو إلى حساب موقوف';
  end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_sender_id and b.blocked_id = v_receiver_id)
       or (b.blocker_id = v_receiver_id and b.blocked_id = v_sender_id)
  ) then raise exception 'لا يمكن إرسال هدية بين حسابين محظورين'; end if;
  select * into v_gift from public.gift_catalog
   where id = p_gift_id and active = true for share;
  if not found then raise exception 'هذه الهدية غير متاحة حاليًا'; end if;
  v_total_coins := v_gift.coin_cost * p_quantity;
  v_gross_points := v_gift.gross_points * p_quantity;
  v_receiver_points := round(v_gross_points * 0.70)::bigint;
  v_platform_points := v_gross_points - v_receiver_points;

  insert into public.wallets(user_id) values (v_sender_id) on conflict (user_id) do nothing;
  insert into public.wallets(user_id) values (v_receiver_id) on conflict (user_id) do nothing;
  perform 1 from public.wallets
   where user_id in (v_sender_id, v_receiver_id)
   order by user_id for update;
  -- The sender wallet lock serializes retries from the same account. A repeated
  -- request returns the original transfer without charging coins again.
  select e.transfer_id, g.name
    into v_transfer_id, v_existing_gift_name
    from public.voice_room_gift_events e
    join public.gift_catalog g on g.id = e.gift_id
   where e.sender_id = v_sender_id and e.request_id = v_request_id;
  if found then
    return jsonb_build_object(
      'transfer_id', v_transfer_id, 'gift_name', v_existing_gift_name,
      'receiver_id', v_receiver_id, 'duplicate', true
    );
  end if;

  select purchased_coins into v_sender_balance
   from public.wallets where user_id = v_sender_id;
  if v_sender_balance < v_total_coins then raise exception 'رصيد العملات غير كافٍ'; end if;

  update public.wallets
    set purchased_coins = purchased_coins - v_total_coins, updated_at = now()
    where user_id = v_sender_id;
  update public.wallets
    set earned_points = earned_points + v_receiver_points,
        lifetime_points = lifetime_points + v_receiver_points, updated_at = now()
    where user_id = v_receiver_id;

  insert into public.gift_transfers
    (sender_id, receiver_id, gift_id, quantity, coins_spent, gross_points, host_points, platform_points, room_name)
  values
    (v_sender_id, v_receiver_id, p_gift_id, p_quantity, v_total_coins,
     v_gross_points, v_receiver_points, v_platform_points, null)
  returning id into v_transfer_id;

  insert into public.wallet_transactions
    (user_id, transaction_type, coins, amount_egp, reference_id, description, points, platform_points)
  values
    (v_sender_id, 'gift_sent', -v_total_coins, 0, v_transfer_id, 'إرسال ' || v_gift.name || ' داخل غرفة صوتية', 0, v_platform_points),
    (v_receiver_id, 'gift_received', 0, 0, v_transfer_id, 'استلام ' || v_gift.name || ' داخل غرفة صوتية', v_receiver_points, 0);

  insert into public.voice_room_gift_events
    (transfer_id, room_id, sender_id, receiver_id, gift_id, quantity, request_id)
  values (v_transfer_id, p_room_id, v_sender_id, v_receiver_id, p_gift_id, p_quantity, v_request_id);

  return jsonb_build_object(
    'transfer_id', v_transfer_id, 'gift_name', v_gift.name,
    'receiver_id', v_receiver_id, 'coins_spent', v_total_coins,
    'receiver_points', v_receiver_points, 'platform_points', v_platform_points
  );
end;
$function$;
revoke all on function public.send_voice_room_gift(uuid, uuid, integer, uuid, uuid) from public;
grant execute on function public.send_voice_room_gift(uuid, uuid, integer, uuid, uuid) to authenticated;

create or replace function public.reject_voice_room_seat_request(
  p_room_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.voice_rooms r
    where r.id=p_room_id and r.host_id=auth.uid() and r.status='live'
  ) then raise exception 'مضيف الغرفة فقط يمكنه رفض الطلب'; end if;
  update public.voice_room_seat_requests
    set status='rejected'
    where room_id=p_room_id and user_id=p_user_id and status='pending';
  if not found then raise exception 'الطلب غير موجود أو تمت معالجته'; end if;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.reject_voice_room_seat_request(uuid, uuid) from public;
grant execute on function public.reject_voice_room_seat_request(uuid, uuid) to authenticated;

create or replace function public.leave_voice_room_seat(p_room_id uuid)
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
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.leave_voice_room_seat(uuid) from public;
grant execute on function public.leave_voice_room_seat(uuid) to authenticated;
