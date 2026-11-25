-- Publicly visible, user-selectable profile frames.
create table if not exists public.yoyo_profile_frames (
  code text primary key,
  name text not null,
  tier text not null check (tier in ('starter','gold','diamond','legendary')),
  coin_cost bigint not null default 0 check (coin_cost >= 0),
  vip_only boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.yoyo_profile_frames enable row level security;
revoke all on public.yoyo_profile_frames from anon, public;
grant select on public.yoyo_profile_frames to authenticated;
drop policy if exists "Authenticated users can view active profile frames" on public.yoyo_profile_frames;
create policy "Authenticated users can view active profile frames"
on public.yoyo_profile_frames for select to authenticated using (active = true);

insert into public.yoyo_profile_frames (code,name,tier,coin_cost,vip_only,sort_order) values
('classic','الإطار الكلاسيكي','starter',0,false,0),
('vip_gold','VIP الذهبي','gold',0,true,10),
('vip_diamond','VIP الماسي','diamond',25000,true,20),
('vip_rose','VIP الوردي','gold',12000,false,30),
('vip_royal','VIP الملكي','legendary',75000,true,40),
('vip_fire','VIP الناري','legendary',100000,true,50),
('vip_galaxy','VIP المجري','legendary',150000,true,60),
('vip_ice','VIP الجليدي','diamond',35000,false,70),
('vip_emerald','VIP الزمردي','diamond',45000,false,80)
on conflict (code) do update set name=excluded.name,tier=excluded.tier,coin_cost=excluded.coin_cost,vip_only=excluded.vip_only,sort_order=excluded.sort_order,active=true;

alter table public.profiles add column if not exists selected_frame_code text references public.yoyo_profile_frames(code) on delete set null;
alter table public.member_public_profiles add column if not exists selected_frame_code text;

create or replace function private.sync_member_public_profile()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if (tg_op = 'DELETE') then
    delete from public.member_public_profiles where id = old.id;
    return old;
  end if;
  if new.display_name is null or length(btrim(new.display_name)) = 0 then
    delete from public.member_public_profiles where id = new.id;
  else
    insert into public.member_public_profiles (id, display_name, avatar_url, country, selected_frame_code)
    values (new.id, new.display_name, new.avatar_url, new.country, new.selected_frame_code)
    on conflict (id) do update set
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      country = excluded.country,
      selected_frame_code = excluded.selected_frame_code;
  end if;
  return new;
end;
$function$;

drop trigger if exists sync_member_public_profile on public.profiles;
create trigger sync_member_public_profile
after insert or delete or update of display_name, avatar_url, country, selected_frame_code
on public.profiles for each row execute function private.sync_member_public_profile();

update public.member_public_profiles m
set selected_frame_code = p.selected_frame_code
from public.profiles p
where p.id = m.id and m.selected_frame_code is distinct from p.selected_frame_code;
