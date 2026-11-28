-- Prevent users from setting a title code unless they own that catalog item.
create or replace function private.enforce_selected_store_title_entitlement()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if new.selected_title is null or new.selected_title = '' then
    return new;
  end if;
  if not exists (
    select 1
    from public.yoyo_store_items i
    join public.yoyo_user_store_inventory inv on inv.item_id=i.id
    where i.item_code=new.selected_title
      and i.category='title'
      and i.active=true
      and inv.user_id=new.id
  ) then
    raise exception 'يجب امتلاك اللقب من متجر YOYO قبل تفعيله.';
  end if;
  return new;
end;
$function$;

drop trigger if exists enforce_selected_store_title_entitlement on public.profiles;
create trigger enforce_selected_store_title_entitlement
before insert or update of selected_title on public.profiles
for each row execute function private.enforce_selected_store_title_entitlement();
