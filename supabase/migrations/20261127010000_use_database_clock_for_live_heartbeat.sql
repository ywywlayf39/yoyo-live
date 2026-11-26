create or replace function public.yoyo_touch_live_room(p_room_name text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول أولاً';
  end if;

  update public.live_rooms
  set last_heartbeat_at = now()
  where room_name = p_room_name
    and host_id = auth.uid()
    and status = 'live';

  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$function$;

grant execute on function public.yoyo_touch_live_room(text) to authenticated;
