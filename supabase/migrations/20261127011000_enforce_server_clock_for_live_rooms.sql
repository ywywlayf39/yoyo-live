create or replace function public.yoyo_live_room_server_clock()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    if new.status = 'live' then
      new.last_heartbeat_at := now();
    end if;
  elsif new.status = 'live'
    and (new.status is distinct from old.status
      or new.last_heartbeat_at is distinct from old.last_heartbeat_at) then
    new.last_heartbeat_at := now();
  end if;
  return new;
end;
$function$;

drop trigger if exists yoyo_live_room_server_clock on public.live_rooms;
create trigger yoyo_live_room_server_clock
before insert or update on public.live_rooms
for each row execute function public.yoyo_live_room_server_clock();
