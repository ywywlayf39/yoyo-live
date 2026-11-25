-- Enforce frame entitlement in the database, not only in the mobile UI.
create or replace function private.enforce_profile_frame_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_frame public.yoyo_profile_frames%rowtype;
  v_vip_active boolean;
begin
  if new.selected_frame_code is null then
    return new;
  end if;

  select * into v_frame
  from public.yoyo_profile_frames
  where code = new.selected_frame_code and active = true;

  if not found then
    raise exception 'هذا الإطار غير متاح حاليًا.';
  end if;

  if v_frame.coin_cost > 0 then
    raise exception 'هذا الإطار يحتاج إلى شراء بالنقاط، والشراء غير متاح بعد.';
  end if;

  if v_frame.vip_only then
    select exists (
      select 1 from public.user_vip_subscriptions s
      where s.user_id = new.id
        and s.status = 'active'
        and s.expires_at > now()
    ) into v_vip_active;

    if not v_vip_active then
      raise exception 'هذا الإطار مخصص لأعضاء VIP أصحاب العضوية السارية.';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists enforce_profile_frame_entitlement on public.profiles;
create trigger enforce_profile_frame_entitlement
before insert or update of selected_frame_code
on public.profiles
for each row execute function private.enforce_profile_frame_entitlement();
