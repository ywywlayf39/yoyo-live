alter table public.voice_rooms
  add column if not exists seats_open boolean not null default true;

create table if not exists public.voice_room_members (
  room_id uuid not null references public.voice_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.voice_room_members enable row level security;
drop policy if exists "voice room members select self" on public.voice_room_members;
create policy "voice room members select self" on public.voice_room_members
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "voice room members insert self" on public.voice_room_members;
create policy "voice room members insert self" on public.voice_room_members
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "voice room members update self" on public.voice_room_members;
create policy "voice room members update self" on public.voice_room_members
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists "voice room members delete self" on public.voice_room_members;
create policy "voice room members delete self" on public.voice_room_members
  for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.voice_room_members to authenticated;

create table if not exists public.voice_room_gift_events (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null unique references public.gift_transfers(id) on delete cascade,
  room_id uuid not null references public.voice_rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  receiver_id uuid not null references auth.users(id),
  gift_id uuid not null references public.gift_catalog(id),
  quantity integer not null check (quantity between 1 and 100),
  created_at timestamptz not null default now()
);
alter table public.voice_room_gift_events enable row level security;
drop policy if exists "voice room gifts visible to members" on public.voice_room_gift_events;
create policy "voice room gifts visible to members" on public.voice_room_gift_events
  for select to authenticated using (
    exists (
      select 1 from public.voice_room_members m
      where m.room_id = voice_room_gift_events.room_id
        and m.user_id = (select auth.uid())
    )
  );
grant select on public.voice_room_gift_events to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.voice_room_gift_events;
exception when duplicate_object then null;
end $$;

create or replace function public.send_voice_room_gift(
  p_room_id uuid,
  p_gift_id uuid,
  p_quantity integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sender_id uuid := auth.uid();
  v_room public.voice_rooms%rowtype;
  v_gift public.gift_catalog%rowtype;
  v_sender_balance bigint;
  v_total_coins bigint;
  v_gross_points bigint;
  v_host_points bigint;
  v_platform_points bigint;
  v_transfer_id uuid;
begin
  if v_sender_id is null then raise exception 'يجب تسجيل الدخول لإرسال هدية'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then raise exception 'الكمية يجب أن تكون من 1 إلى 100'; end if;
  select * into v_room from public.voice_rooms where id = p_room_id and status = 'live' for share;
  if not found then raise exception 'الغرفة الصوتية غير متاحة'; end if;
  if v_sender_id = v_room.host_id then raise exception 'لا يمكن إرسال هدية لنفسك'; end if;
  if not exists (
    select 1 from public.voice_room_members m
    where m.room_id = p_room_id and m.user_id = v_sender_id
      and m.joined_at > now() - interval '2 hours'
  ) then raise exception 'يجب دخول الغرفة الصوتية أولاً لإرسال هدية'; end if;
  if private.yoyo_is_user_suspended(v_sender_id)
     or private.yoyo_is_user_suspended(v_room.host_id) then
    raise exception 'لا يمكن إرسال الهدايا من أو إلى حساب موقوف';
  end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_sender_id and b.blocked_id = v_room.host_id)
       or (b.blocker_id = v_room.host_id and b.blocked_id = v_sender_id)
  ) then raise exception 'لا يمكن إرسال هدية بين حسابين محظورين'; end if;
  select * into v_gift from public.gift_catalog where id = p_gift_id and active = true for share;
  if not found then raise exception 'هذه الهدية غير متاحة حاليًا'; end if;
  v_total_coins := v_gift.coin_cost * p_quantity;
  v_gross_points := v_gift.gross_points * p_quantity;
  v_host_points := round(v_gross_points * 0.70)::bigint;
  v_platform_points := v_gross_points - v_host_points;
  insert into public.wallets(user_id) values (v_sender_id) on conflict (user_id) do nothing;
  insert into public.wallets(user_id) values (v_room.host_id) on conflict (user_id) do nothing;
  select purchased_coins into v_sender_balance
    from public.wallets where user_id = v_sender_id for update;
  if v_sender_balance < v_total_coins then raise exception 'رصيد العملات غير كافٍ'; end if;
  update public.wallets
    set purchased_coins = purchased_coins - v_total_coins, updated_at = now()
    where user_id = v_sender_id;
  update public.wallets
    set earned_points = earned_points + v_host_points,
        lifetime_points = lifetime_points + v_host_points, updated_at = now()
    where user_id = v_room.host_id;
  insert into public.gift_transfers
    (sender_id, receiver_id, gift_id, quantity, coins_spent, gross_points, host_points, platform_points, room_name)
  values
    (v_sender_id, v_room.host_id, p_gift_id, p_quantity, v_total_coins,
     v_gross_points, v_host_points, v_platform_points, null)
  returning id into v_transfer_id;
  insert into public.wallet_transactions
    (user_id, transaction_type, coins, reference_id, description, points, platform_points)
  values
    (v_sender_id, 'gift_sent', -v_total_coins, v_transfer_id, 'إرسال ' || v_gift.name || ' داخل غرفة صوتية', 0, v_platform_points),
    (v_room.host_id, 'gift_received', 0, v_transfer_id, 'استلام ' || v_gift.name || ' داخل غرفة صوتية', v_host_points, 0);
  insert into public.voice_room_gift_events
    (transfer_id, room_id, sender_id, receiver_id, gift_id, quantity)
  values (v_transfer_id, p_room_id, v_sender_id, v_room.host_id, p_gift_id, p_quantity);
  return jsonb_build_object(
    'transfer_id', v_transfer_id, 'gift_name', v_gift.name,
    'coins_spent', v_total_coins, 'host_points', v_host_points,
    'platform_points', v_platform_points
  );
end;
$function$;

revoke all on function public.send_voice_room_gift(uuid, uuid, integer) from public;
grant execute on function public.send_voice_room_gift(uuid, uuid, integer) to authenticated;
