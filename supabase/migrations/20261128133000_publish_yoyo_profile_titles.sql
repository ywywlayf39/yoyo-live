-- Publish equipped titles and support clearing them, reusing the existing secure cosmetic inventory.
alter table public.member_public_profiles add column if not exists selected_title text;

create or replace function private.sync_member_public_title()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if new.selected_title is distinct from old.selected_title then
    update public.member_public_profiles
    set selected_title = new.selected_title
    where id = new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists sync_member_public_title on public.profiles;
create trigger sync_member_public_title
after update of selected_title on public.profiles
for each row execute function private.sync_member_public_title();

update public.member_public_profiles m
set selected_title = p.selected_title
from public.profiles p
where p.id = m.id and m.selected_title is distinct from p.selected_title;

insert into public.yoyo_store_items(item_code,name,category,description,emoji,coin_cost,active,sort_order) values
 ('title_lion','الليث','title','لقب القوة والحضور المميز','🦁',18000,true,25),
 ('title_diamond','الماسي','title','بريق الماس في كل ظهور','💎',65000,true,35),
 ('title_emperor','الإمبراطور','title','أعلى ألقاب المتجر ندرة','🏆',120000,true,45)
on conflict(item_code) do update set
 name=excluded.name,category=excluded.category,description=excluded.description,
 emoji=excluded.emoji,coin_cost=excluded.coin_cost,active=true,sort_order=excluded.sort_order;

create or replace function public.yoyo_clear_profile_title()
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;
  update public.profiles set selected_title=null where id=v_user;
  return jsonb_build_object('success',true,'title_cleared',true);
end;
$function$;

revoke all on function public.yoyo_clear_profile_title() from public,anon;
grant execute on function public.yoyo_clear_profile_title() to authenticated;
