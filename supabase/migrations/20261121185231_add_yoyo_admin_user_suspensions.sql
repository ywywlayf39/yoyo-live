create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.user_suspensions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 5 and 500),
  suspended_by uuid not null references auth.users(id),
  suspended_at timestamptz not null default now(),
  suspended_until timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.admin_user_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id),
  target_user_id uuid not null references auth.users(id),
  action text not null check (action in ('suspend','unsuspend')),
  reason text not null check (char_length(reason) between 5 and 500),
  duration text,
  created_at timestamptz not null default now()
);
alter table public.user_suspensions enable row level security;
alter table public.admin_user_actions enable row level security;
revoke all on public.user_suspensions, public.admin_user_actions from anon, authenticated;
grant select on public.user_suspensions, public.admin_user_actions to authenticated;

drop policy if exists "Admins view user suspensions" on public.user_suspensions;
create policy "Admins view user suspensions" on public.user_suspensions
for select to authenticated
using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');
drop policy if exists "Admins view admin user actions" on public.admin_user_actions;
create policy "Admins view admin user actions" on public.admin_user_actions
for select to authenticated
using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

create or replace function private.yoyo_is_user_suspended(p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_suspensions s
    where s.user_id = p_user_id and s.revoked_at is null
      and (s.suspended_until is null or s.suspended_until > now())
  );
$$;
revoke all on function private.yoyo_is_user_suspended(uuid) from public, anon;
grant execute on function private.yoyo_is_user_suspended(uuid) to authenticated;

drop policy if exists "Suspended users cannot access direct messages" on public.direct_messages;
create policy "Suspended users cannot access direct messages" on public.direct_messages
as restrictive for all to authenticated
using (not private.yoyo_is_user_suspended((select auth.uid())))
with check (not private.yoyo_is_user_suspended((select auth.uid())));
drop policy if exists "Suspended users cannot access live calls" on public.live_calls;
create policy "Suspended users cannot access live calls" on public.live_calls
as restrictive for all to authenticated
using (not private.yoyo_is_user_suspended((select auth.uid())))
with check (not private.yoyo_is_user_suspended((select auth.uid())));
drop policy if exists "Suspended users cannot access live rooms" on public.live_rooms;
create policy "Suspended users cannot access live rooms" on public.live_rooms
as restrictive for all to authenticated
using (not private.yoyo_is_user_suspended((select auth.uid())))
with check (not private.yoyo_is_user_suspended((select auth.uid())));

create or replace function public.send_live_gift(p_receiver_id uuid, p_gift_id uuid, p_quantity integer default 1)
returns jsonb language plpgsql security definer set search_path = ''
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
  if v_sender_id is null then raise exception 'يجب تسجيل الدخول لإرسال هدية'; end if;
  if private.yoyo_is_user_suspended(v_sender_id) or private.yoyo_is_user_suspended(p_receiver_id) then
    raise exception 'لا يمكن إرسال الهدايا من أو إلى حساب موقوف';
  end if;
  if p_receiver_id is null or p_receiver_id = v_sender_id then raise exception 'لا يمكن إرسال هدية إلى نفسك'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then raise exception 'الكمية يجب أن تكون من 1 إلى 100'; end if;
  if not exists (select 1 from public.live_rooms where host_id = p_receiver_id and status = 'live') then
    raise exception 'يمكن إرسال الهدايا لصاحب بث مباشر فقط';
  end if;
  if exists (select 1 from public.user_blocks b where (b.blocker_id = v_sender_id and b.blocked_id = p_receiver_id) or (b.blocker_id = p_receiver_id and b.blocked_id = v_sender_id)) then
    raise exception 'لا يمكن إرسال هدية بين حسابين محظورين';
  end if;
  select * into v_gift from public.gift_catalog where id = p_gift_id and active = true for share;
  if not found then raise exception 'هذه الهدية غير متاحة حاليًا'; end if;
  v_total_coins := v_gift.coin_cost * p_quantity;
  v_gross_points := v_gift.gross_points * p_quantity;
  v_host_points := round(v_gross_points * 0.70)::bigint;
  v_platform_points := v_gross_points - v_host_points;
  insert into public.wallets(user_id) values (v_sender_id) on conflict (user_id) do nothing;
  insert into public.wallets(user_id) values (p_receiver_id) on conflict (user_id) do nothing;
  select purchased_coins into v_sender_balance from public.wallets where user_id = v_sender_id for update;
  if v_sender_balance < v_total_coins then raise exception 'رصيد العملات غير كافٍ'; end if;
  update public.wallets set purchased_coins = purchased_coins - v_total_coins, updated_at = now() where user_id = v_sender_id;
  update public.wallets set earned_points = earned_points + v_host_points, lifetime_points = lifetime_points + v_host_points, updated_at = now() where user_id = p_receiver_id;
  insert into public.gift_transfers (sender_id, receiver_id, gift_id, quantity, coins_spent, gross_points, host_points, platform_points)
  values (v_sender_id, p_receiver_id, p_gift_id, p_quantity, v_total_coins, v_gross_points, v_host_points, v_platform_points)
  returning id into v_transfer_id;
  insert into public.wallet_transactions (user_id, transaction_type, coins, reference_id, description, points, platform_points)
  values
    (v_sender_id, 'gift_sent', -v_total_coins, v_transfer_id, 'إرسال ' || v_gift.name, 0, v_platform_points),
    (p_receiver_id, 'gift_received', 0, v_transfer_id, 'استلام ' || v_gift.name, v_host_points, 0);
  return jsonb_build_object('transfer_id', v_transfer_id, 'gift_name', v_gift.name, 'emoji', v_gift.emoji,
    'quantity', p_quantity, 'coins_spent', v_total_coins, 'host_points', v_host_points, 'platform_points', v_platform_points);
end;
$function$;
revoke all on function public.send_live_gift(uuid,uuid,integer) from public, anon;
grant execute on function public.send_live_gift(uuid,uuid,integer) to authenticated;
