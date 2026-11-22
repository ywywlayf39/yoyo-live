alter table public.gift_transfers
  add column if not exists room_name text;

create index if not exists gift_transfers_room_name_created_at_idx
  on public.gift_transfers (room_name, created_at desc);

create table if not exists public.live_room_viewers (
  room_name text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_name, user_id)
);

create index if not exists live_room_viewers_user_joined_idx
  on public.live_room_viewers (user_id, joined_at desc);

alter table public.live_room_viewers enable row level security;

revoke all on public.live_room_viewers from anon, public;
grant select, insert, delete on public.live_room_viewers to authenticated;
grant select on public.gift_transfers to authenticated;

drop policy if exists "Users view own live room viewer entry" on public.live_room_viewers;
create policy "Users view own live room viewer entry"
  on public.live_room_viewers for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users join active unblocked live rooms" on public.live_room_viewers;
create policy "Users join active unblocked live rooms"
  on public.live_room_viewers for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not private.yoyo_is_user_suspended((select auth.uid()))
    and exists (
      select 1 from public.live_rooms r
      where r.room_name = live_room_viewers.room_name
        and r.status = 'live'
    )
  );

drop policy if exists "Users leave own live rooms" on public.live_room_viewers;
create policy "Users leave own live rooms"
  on public.live_room_viewers for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "View gifts in joined live rooms" on public.gift_transfers;
create policy "View gifts in joined live rooms"
  on public.gift_transfers for select to authenticated
  using (
    room_name is not null
    and exists (
      select 1
      from public.live_room_viewers v
      join public.live_rooms r on r.room_name = v.room_name
      where v.room_name = gift_transfers.room_name
        and v.user_id = (select auth.uid())
        and v.joined_at > now() - interval '2 hours'
        and r.status = 'live'
    )
  );

drop function if exists public.send_live_gift(uuid, uuid, integer);

create function public.send_live_gift(
  p_receiver_id uuid,
  p_gift_id uuid,
  p_quantity integer,
  p_room_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sender_id uuid := auth.uid();
  v_gift public.gift_catalog%rowtype;
  v_sender_balance bigint;
  v_total_coins bigint;
  v_gross_points bigint;
  v_host_points bigint;
  v_platform_points bigint;
  v_transfer_id uuid;
begin
  if v_sender_id is null then
    raise exception 'يجب تسجيل الدخول لإرسال هدية';
  end if;

  if private.yoyo_is_user_suspended(v_sender_id)
     or private.yoyo_is_user_suspended(p_receiver_id) then
    raise exception 'لا يمكن إرسال الهدايا من أو إلى حساب موقوف';
  end if;

  if p_receiver_id is null or p_receiver_id = v_sender_id then
    raise exception 'لا يمكن إرسال هدية إلى نفسك';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception 'الكمية يجب أن تكون من 1 إلى 100';
  end if;

  if p_room_name is null or btrim(p_room_name) = '' then
    raise exception 'غرفة البث غير محددة';
  end if;

  if not exists (
    select 1 from public.live_rooms r
    where r.room_name = p_room_name
      and r.host_id = p_receiver_id
      and r.status = 'live'
  ) then
    raise exception 'البث المحدد غير نشط أو لا يخص هذا المضيف';
  end if;

  if not exists (
    select 1 from public.live_room_viewers v
    where v.room_name = p_room_name
      and v.user_id = v_sender_id
      and v.joined_at > now() - interval '2 hours'
  ) then
    raise exception 'يجب دخول البث قبل إرسال الهدية';
  end if;

  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_sender_id and b.blocked_id = p_receiver_id)
       or (b.blocker_id = p_receiver_id and b.blocked_id = v_sender_id)
  ) then
    raise exception 'لا يمكن إرسال هدية بين حسابين محظورين';
  end if;

  select * into v_gift
  from public.gift_catalog
  where id = p_gift_id and active = true
  for share;

  if not found then
    raise exception 'هذه الهدية غير متاحة حاليًا';
  end if;

  v_total_coins := v_gift.coin_cost * p_quantity;
  v_gross_points := v_gift.gross_points * p_quantity;
  v_host_points := round(v_gross_points * 0.70)::bigint;
  v_platform_points := v_gross_points - v_host_points;

  insert into public.wallets(user_id)
  values (v_sender_id)
  on conflict (user_id) do nothing;

  insert into public.wallets(user_id)
  values (p_receiver_id)
  on conflict (user_id) do nothing;

  select purchased_coins into v_sender_balance
  from public.wallets
  where user_id = v_sender_id
  for update;

  if v_sender_balance < v_total_coins then
    raise exception 'رصيد العملات غير كافٍ';
  end if;

  update public.wallets
  set purchased_coins = purchased_coins - v_total_coins,
      updated_at = now()
  where user_id = v_sender_id;

  update public.wallets
  set earned_points = earned_points + v_host_points,
      lifetime_points = lifetime_points + v_host_points,
      updated_at = now()
  where user_id = p_receiver_id;

  insert into public.gift_transfers
    (sender_id, receiver_id, gift_id, quantity, coins_spent,
     gross_points, host_points, platform_points, room_name)
  values
    (v_sender_id, p_receiver_id, p_gift_id, p_quantity, v_total_coins,
     v_gross_points, v_host_points, v_platform_points, p_room_name)
  returning id into v_transfer_id;

  insert into public.wallet_transactions
    (user_id, transaction_type, coins, reference_id, description, points, platform_points)
  values
    (v_sender_id, 'gift_sent', -v_total_coins, v_transfer_id, 'إرسال ' || v_gift.name, 0, v_platform_points),
    (p_receiver_id, 'gift_received', 0, v_transfer_id, 'استلام ' || v_gift.name, v_host_points, 0);

  return jsonb_build_object(
    'transfer_id', v_transfer_id,
    'gift_name', v_gift.name,
    'emoji', v_gift.emoji,
    'quantity', p_quantity,
    'coins_spent', v_total_coins,
    'host_points', v_host_points,
    'platform_points', v_platform_points
  );
end;
$function$;

revoke all on function public.send_live_gift(uuid, uuid, integer, text) from public, anon;
grant execute on function public.send_live_gift(uuid, uuid, integer, text) to authenticated;
