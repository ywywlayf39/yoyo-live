-- Keep every empty voice-room seat open by default.
-- Occupied seats are preserved; this only unlocks empty seats in live rooms.
update public.voice_room_seats s
set is_open = true,
    updated_at = now()
from public.voice_rooms r
where r.id = s.room_id
  and r.status = 'live'
  and s.user_id is null
  and s.is_open = false;

-- Reassert the room-creation initializer so all eight new seats start open.
create or replace function public.yoyo_initialize_voice_room_seats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.voice_room_seats(room_id, seat_number, user_id, is_open)
  select new.id, slots.seat_number, null, true
  from generate_series(1, 8) as slots(seat_number)
  on conflict (room_id, seat_number) do update
    set is_open = case
      when public.voice_room_seats.user_id is null then true
      else public.voice_room_seats.is_open
    end,
    updated_at = now();
  return new;
end;
$$;
revoke all on function public.yoyo_initialize_voice_room_seats() from public;
