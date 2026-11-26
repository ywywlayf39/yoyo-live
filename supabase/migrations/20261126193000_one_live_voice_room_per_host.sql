-- Enforce one active voice room per host at the database level.
-- Refuse to silently close or delete any existing room if duplicates are found.
do $$
begin
  if exists (
    select 1
    from public.voice_rooms
    where status = 'live'
    group by host_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate live voice rooms exist for one or more hosts. Resolve those rooms before applying the one-live-room-per-host constraint.';
  end if;
end;
$$;

create unique index if not exists voice_rooms_one_live_room_per_host_uidx
  on public.voice_rooms(host_id)
  where status = 'live';

comment on index public.voice_rooms_one_live_room_per_host_uidx is
  'Each member may host only one live voice room at a time.';
