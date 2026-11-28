-- Secure purchasable profile titles for YOYO LIVE.
create table if not exists public.yoyo_profile_titles (
  code text primary key,
  title text not null,
  emoji text not null default '✦',
  rarity text not null check (rarity in ('starter','gold','diamond','legendary')),
  coin_cost bigint not null check (coin_cost > 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.yoyo_profile_titles enable row level security;
revoke all on public.yoyo_profile_titles from anon, public;
grant select on public.yoyo_profile_titles to authenticated;
drop policy if exists "Authenticated users can view active profile titles" on public.yoyo_profile_titles;
create policy "Authenticated users can view active profile titles"
on public.yoyo_profile_titles for select to authenticated using (active = true);

insert into public.yoyo_profile_titles(code,title,emoji,rarity,coin_cost,sort_order) values
 ('star','النجم','⭐','starter',5000,10),
 ('lion','الليث','🦁','gold',15000,20),
 ('legend','الأسطورة','🔥','diamond',35000,30),
 ('king','ملك YOYO','👑','legendary',75000,40),
 ('diamond','الماسي','💎','legendary',150000,50),
 ('emperor','الإمبراطور','🏆','legendary',250000,60)
on conflict(code) do update set title=excluded.title,emoji=excluded.emoji,rarity=excluded.rarity,coin_cost=excluded.coin_cost,sort_order=excluded.sort_order,active=true;

create table if not exists public.yoyo_user_profile_titles (
  user_id uuid not null references auth.users(id) on delete cascade,
  title_code text not null references public.yoyo_profile_titles(code) on delete restrict,
  purchased_at timestamptz not null default now(),
  primary key(user_id,title_code)
);
alter table public.yoyo_user_profile_titles enable row level security;
revoke all on public.yoyo_user_profile_titles from anon, public;
grant select on public.yoyo_user_profile_titles to authenticated;
drop policy if exists "Users can view own unlocked profile titles" on public.yoyo_user_profile_titles;
create policy "Users can view own unlocked profile titles"
on public.yoyo_user_profile_titles for select to authenticated
using (user_id = (select auth.uid()));

alter table public.profiles add column if not exists selected_title_code text
  references public.yoyo_profile_titles(code) on delete set null;
alter table public.member_public_profiles add column if not exists selected_title_code text;
alter table public.member_public_profiles add column if not exists selected_title_text text;
alter table public.member_public_profiles add column if not exists selected_title_emoji text;

create or replace function private.sync_member_public_profile()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  v_title public.yoyo_profile_titles%rowtype;
begin
  if tg_op = 'DELETE' then
    delete from public.member_public_profiles where id = old.id;
    return old;
  end if;
  if new.display_name is null or length(btrim(new.display_name)) = 0 then
    delete from public.member_public_profiles where id = new.id;
  else
    if new.selected_title_code is not null then
      select * into v_title from public.yoyo_profile_titles
      where code = new.selected_title_code and active = true;
    end if;
    insert into public.member_public_profiles
      (id,display_name,avatar_url,country,selected_frame_code,selected_title_code,selected_title_text,selected_title_emoji)
    values
      (new.id,new.display_name,new.avatar_url,new.country,new.selected_frame_code,
       case when found then new.selected_title_code else null end,
       case when found then v_title.title else null end,
       case when found then v_title.emoji else null end)
    on conflict(id) do update set
      display_name=excluded.display_name,
      avatar_url=excluded.avatar_url,
      country=excluded.country,
      selected_frame_code=excluded.selected_frame_code,
      selected_title_code=excluded.selected_title_code,
      selected_title_text=excluded.selected_title_text,
      selected_title_emoji=excluded.selected_title_emoji;
  end if;
  return new;
end;
$function$;

drop trigger if exists sync_member_public_profile on public.profiles;
create trigger sync_member_public_profile
after insert or delete or update of display_name,avatar_url,country,selected_frame_code,selected_title_code
on public.profiles for each row execute function private.sync_member_public_profile();

create or replace function private.enforce_profile_title_entitlement()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if new.selected_title_code is null then return new; end if;
  if not exists (
    select 1 from public.yoyo_profile_titles t
    join public.yoyo_user_profile_titles o on o.title_code=t.code
    where t.code=new.selected_title_code and t.active=true and o.user_id=new.id
  ) then
    raise exception 'يجب شراء اللقب أولاً قبل تفعيله.';
  end if;
  return new;
end;
$function$;
drop trigger if exists enforce_profile_title_entitlement on public.profiles;
create trigger enforce_profile_title_entitlement
before insert or update of selected_title_code on public.profiles
for each row execute function private.enforce_profile_title_entitlement();

create or replace function public.yoyo_purchase_profile_title(p_title_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_title public.yoyo_profile_titles%rowtype;
  v_balance bigint;
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  select * into v_title from public.yoyo_profile_titles
    where code=p_title_code and active=true for update;
  if not found then raise exception 'اللقب غير متاح حاليًا'; end if;
  if exists(select 1 from public.yoyo_user_profile_titles where user_id=v_user and title_code=p_title_code) then
    return jsonb_build_object('success',true,'already_owned',true,
      'balance',(select purchased_coins from public.wallets where user_id=v_user));
  end if;
  insert into public.wallets(user_id) values(v_user) on conflict(user_id) do nothing;
  select purchased_coins into v_balance from public.wallets where user_id=v_user for update;
  if coalesce(v_balance,0) < v_title.coin_cost then raise exception 'رصيد العملات غير كافٍ'; end if;

  update public.wallets set purchased_coins=purchased_coins-v_title.coin_cost,updated_at=now()
    where user_id=v_user;
  insert into public.yoyo_user_profile_titles(user_id,title_code) values(v_user,p_title_code);
  insert into public.wallet_transactions(user_id,transaction_type,coins,description)
    values(v_user,'profile_title_purchase',-v_title.coin_cost,'شراء لقب '||v_title.title);
  update public.profiles set selected_title_code=p_title_code where id=v_user;

  return jsonb_build_object('success',true,'already_owned',false,'title_code',p_title_code,
    'coins_spent',v_title.coin_cost,'balance',v_balance-v_title.coin_cost);
end;
$function$;

create or replace function public.yoyo_select_profile_title(p_title_code text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  if p_title_code is null or p_title_code='' then
    update public.profiles set selected_title_code=null where id=v_user;
    return jsonb_build_object('success',true,'title_code',null);
  end if;
  if not exists (
    select 1 from public.yoyo_profile_titles t
    join public.yoyo_user_profile_titles o on o.title_code=t.code
    where t.code=p_title_code and t.active=true and o.user_id=v_user
  ) then raise exception 'اللقب غير مملوك لك؛ اشتريه أولاً'; end if;
  update public.profiles set selected_title_code=p_title_code where id=v_user;
  return jsonb_build_object('success',true,'title_code',p_title_code);
end;
$function$;

revoke all on function public.yoyo_purchase_profile_title(text) from public,anon;
revoke all on function public.yoyo_select_profile_title(text) from public,anon;
grant execute on function public.yoyo_purchase_profile_title(text) to authenticated;
grant execute on function public.yoyo_select_profile_title(text) to authenticated;

-- Backfill public title labels for existing profiles.
update public.profiles p set selected_title_code=p.selected_title_code
where p.selected_title_code is not null;
