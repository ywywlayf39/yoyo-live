-- Clear VIP-only frames from public profiles when VIP expires or is revoked.
create or replace function private.clear_expired_vip_profile_frames()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  v_user uuid;
begin
  v_user := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  if not exists (
    select 1 from public.user_vip_subscriptions s
    where s.user_id = v_user and s.status = 'active' and s.expires_at > now()
  ) then
    update public.profiles p
    set selected_frame_code = null
    where p.id = v_user
      and exists (
        select 1 from public.yoyo_profile_frames f
        where f.code = p.selected_frame_code and f.vip_only = true
      )
      and not exists (
        select 1 from public.yoyo_user_profile_frames o
        where o.user_id = v_user and o.frame_code = p.selected_frame_code
      );
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop trigger if exists clear_expired_vip_profile_frames on public.user_vip_subscriptions;
create trigger clear_expired_vip_profile_frames
after update of status, expires_at or delete on public.user_vip_subscriptions
for each row execute function private.clear_expired_vip_profile_frames();
