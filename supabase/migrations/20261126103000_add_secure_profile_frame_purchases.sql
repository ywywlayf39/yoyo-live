-- Secure ownership and selection for coin-priced profile frames.
create table if not exists public.yoyo_user_profile_frames (
  user_id uuid not null references auth.users(id) on delete cascade,
  frame_code text not null references public.yoyo_profile_frames(code) on delete cascade,
  purchased_at timestamptz not null default now(),
  primary key (user_id, frame_code)
);
alter table public.yoyo_user_profile_frames enable row level security;
revoke all on public.yoyo_user_profile_frames from anon, public;
grant select on public.yoyo_user_profile_frames to authenticated;
drop policy if exists "Users can view own unlocked frames" on public.yoyo_user_profile_frames;
create policy "Users can view own unlocked frames"
on public.yoyo_user_profile_frames for select to authenticated
using (user_id = (select auth.uid()));

create or replace function private.enforce_profile_frame_entitlement()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  v_frame public.yoyo_profile_frames%rowtype;
  v_allowed boolean := false;
begin
  if new.selected_frame_code is null then return new; end if;
  select * into v_frame from public.yoyo_profile_frames
  where code = new.selected_frame_code and active = true;
  if not found then raise exception 'هذا الإطار غير متاح حاليًا.'; end if;

  if v_frame.coin_cost = 0 and not v_frame.vip_only then
    v_allowed := true;
  elsif v_frame.vip_only and exists (
    select 1 from public.user_vip_subscriptions s
    where s.user_id = new.id and s.status = 'active' and s.expires_at > now()
  ) then
    v_allowed := true;
  elsif exists (
    select 1 from public.yoyo_user_profile_frames o
    where o.user_id = new.id and o.frame_code = v_frame.code
  ) then
    v_allowed := true;
  end if;
  if not v_allowed then raise exception 'يجب فتح هذا الإطار أولاً أو تفعيل عضوية VIP.'; end if;
  return new;
end;
$function$;

create or replace function public.yoyo_unlock_profile_frame(p_frame_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_frame public.yoyo_profile_frames%rowtype;
  v_balance bigint;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  select * into v_frame from public.yoyo_profile_frames
  where code = p_frame_code and active = true for update;
  if not found then raise exception 'الإطار غير متاح حاليًا'; end if;
  if v_frame.coin_cost <= 0 then raise exception 'هذا الإطار مجاني ولا يحتاج شراء'; end if;

  if exists (select 1 from public.yoyo_user_profile_frames where user_id=v_user and frame_code=p_frame_code) then
    return jsonb_build_object('success',true,'already_owned',true,'balance',(select purchased_coins from public.wallets where user_id=v_user));
  end if;

  insert into public.wallets(user_id) values (v_user) on conflict (user_id) do nothing;
  select purchased_coins into v_balance from public.wallets where user_id=v_user for update;
  if coalesce(v_balance,0) < v_frame.coin_cost then raise exception 'رصيد العملات غير كافٍ'; end if;

  update public.wallets set purchased_coins=purchased_coins-v_frame.coin_cost,updated_at=now() where user_id=v_user;
  insert into public.yoyo_user_profile_frames(user_id,frame_code) values(v_user,p_frame_code);
  insert into public.wallet_transactions(user_id,transaction_type,coins,description)
  values(v_user,'profile_frame_purchase',-v_frame.coin_cost,'شراء إطار '||v_frame.name);
  update public.profiles set selected_frame_code=p_frame_code where id=v_user;

  return jsonb_build_object('success',true,'already_owned',false,'frame_code',p_frame_code,'coins_spent',v_frame.coin_cost,'balance',v_balance-v_frame.coin_cost);
end;
$function$;

create or replace function public.yoyo_select_profile_frame(p_frame_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_frame public.yoyo_profile_frames%rowtype;
  v_allowed boolean := false;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  if p_frame_code is null or p_frame_code = 'classic' then
    update public.profiles set selected_frame_code=null where id=v_user;
    return jsonb_build_object('success',true,'frame_code','classic');
  end if;

  select * into v_frame from public.yoyo_profile_frames
  where code=p_frame_code and active=true;
  if not found then raise exception 'الإطار غير متاح حاليًا'; end if;

  if v_frame.coin_cost=0 and not v_frame.vip_only then
    v_allowed := true;
  elsif v_frame.vip_only and exists (
    select 1 from public.user_vip_subscriptions s
    where s.user_id=v_user and s.status='active' and s.expires_at>now()
  ) then
    v_allowed := true;
  elsif exists (
    select 1 from public.yoyo_user_profile_frames o
    where o.user_id=v_user and o.frame_code=p_frame_code
  ) then
    v_allowed := true;
  end if;
  if not v_allowed then raise exception 'الإطار مقفول؛ افتحه بالنقاط أو فعّل VIP'; end if;
  update public.profiles set selected_frame_code=p_frame_code where id=v_user;
  return jsonb_build_object('success',true,'frame_code',p_frame_code);
end;
$function$;

revoke all on function public.yoyo_unlock_profile_frame(text) from public, anon;
revoke all on function public.yoyo_select_profile_frame(text) from public, anon;
grant execute on function public.yoyo_unlock_profile_frame(text) to authenticated;
grant execute on function public.yoyo_select_profile_frame(text) to authenticated;
