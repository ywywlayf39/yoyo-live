create or replace function public.yoyo_battle_interrupt_for_host(p_room_name text)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_host uuid;
  v_count integer := 0;
begin
  if v_user is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;

  if p_room_name is null or length(p_room_name) > 128 then
    raise exception 'غرفة البث غير صحيحة';
  end if;

  select r.host_id into v_host
  from public.live_rooms r
  where r.room_name = p_room_name
  for update;

  if not found or v_host <> v_user then
    raise exception 'لا تملك صلاحية إنهاء هذا البث';
  end if;

  update public.yoyo_battles b
  set status = 'interrupted',
      result = 'no_result',
      finished_at = now()
  where b.status in ('pending', 'active')
    and (
      (b.host_a_id = v_user and b.room_a = p_room_name)
      or
      (b.host_b_id = v_user and b.room_b = p_room_name)
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.yoyo_battle_interrupt_for_host(text) from public, anon;
grant execute on function public.yoyo_battle_interrupt_for_host(text) to authenticated;
